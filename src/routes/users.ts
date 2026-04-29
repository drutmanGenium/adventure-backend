import { Router } from "express"
import { z } from "zod"
import {
  users,
  authTokens,
  nextUserId,
  generateToken,
  getUserByToken,
  hashPassword,
  verifyPassword,
} from "../data/store"

const router = Router()

const RegisterSchema = z.object({
  firstName: z.string().min(1, "Nombre es obligatorio"),
  lastName: z.string().min(1, "Apellido es obligatorio"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
})

const LoginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Contraseña es obligatoria"),
})

// Avatar upload limits.
// Decoded image bytes must stay below this — much smaller than the global
// 5MB JSON body limit so attackers cannot exhaust memory by uploading
// many large data-URL images.
const MAX_AVATAR_BYTES = 512 * 1024 // 512 KB
// Allowlist of acceptable image MIME types. Anything else (e.g. SVG, which
// can carry script payloads) is rejected.
const ALLOWED_AVATAR_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
])
// data:<mime>;base64,<payload>
const DATA_URL_RE = /^data:([a-zA-Z0-9.+\-/]+);base64,([A-Za-z0-9+/=]+)$/

// Helper to strip password from user object
function sanitizeUser(user: typeof users[number]) {
  const { password, ...safe } = user
  return safe
}

// POST /api/users/register
router.post("/register", (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({
      error: "Datos inválidos",
      details: parsed.error.flatten().fieldErrors,
    })
    return
  }

  const data = parsed.data

  // Check if email already exists
  const existing = users.find((u) => u.email === data.email)
  if (existing) {
    res.status(409).json({ error: "Ya existe una cuenta con este email" })
    return
  }

  const user = {
    id: nextUserId(),
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    // Store a salted scrypt hash, never the plaintext password.
    password: hashPassword(data.password),
    avatarUrl: null,
    createdAt: new Date().toISOString(),
  }

  users.push(user)

  const token = generateToken()
  authTokens.set(token, user.id)

  res.status(201).json({
    message: "Cuenta creada exitosamente",
    token,
    user: sanitizeUser(user),
  })
})

// POST /api/users/login
router.post("/login", (req, res) => {
  const parsed = LoginSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({
      error: "Datos inválidos",
      details: parsed.error.flatten().fieldErrors,
    })
    return
  }

  const { email, password } = parsed.data

  const user = users.find((u) => u.email === email)
  // verifyPassword performs a constant-time comparison against the stored
  // scrypt hash. We always reject with the same generic error message to
  // avoid leaking whether the email exists.
  if (!user || !verifyPassword(password, user.password)) {
    res.status(401).json({ error: "Email o contraseña incorrectos" })
    return
  }

  const token = generateToken()
  authTokens.set(token, user.id)

  res.json({
    message: "Sesión iniciada",
    token,
    user: sanitizeUser(user),
  })
})

// GET /api/users/me
router.get("/me", (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token de autenticación requerido" })
    return
  }

  const token = authHeader.slice(7)
  const user = getUserByToken(token)

  if (!user) {
    res.status(401).json({ error: "Token inválido o sesión expirada" })
    return
  }

  res.json({ user: sanitizeUser(user) })
})

// PUT /api/users/me/avatar
router.put("/me/avatar", (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token de autenticación requerido" })
    return
  }

  const token = authHeader.slice(7)
  const user = getUserByToken(token)

  if (!user) {
    res.status(401).json({ error: "Token inválido o sesión expirada" })
    return
  }

  const { avatarUrl } = req.body

  if (!avatarUrl || typeof avatarUrl !== "string") {
    res.status(400).json({ error: "avatarUrl es obligatorio y debe ser un string" })
    return
  }

  // Reject overly long strings up-front — even before base64 decoding —
  // to bound CPU spent parsing huge inputs. Base64 expands ~4/3 vs raw
  // bytes, plus the data-URL prefix.
  if (avatarUrl.length > Math.ceil((MAX_AVATAR_BYTES * 4) / 3) + 64) {
    res.status(413).json({ error: "El avatar excede el tamaño máximo permitido" })
    return
  }

  // Strict data-URL parse: must be base64-encoded with a recognized MIME.
  const match = DATA_URL_RE.exec(avatarUrl)
  if (!match) {
    res
      .status(400)
      .json({ error: "El avatar debe ser una data URL base64 válida" })
    return
  }

  const mime = match[1].toLowerCase()
  const base64Payload = match[2]

  if (!ALLOWED_AVATAR_MIME.has(mime)) {
    res.status(400).json({
      error: "Tipo de imagen no permitido (usa PNG, JPEG, WEBP o GIF)",
    })
    return
  }

  // Decode and validate actual byte size and basic magic-byte signatures.
  let buffer: Buffer
  try {
    buffer = Buffer.from(base64Payload, "base64")
  } catch {
    res.status(400).json({ error: "Avatar base64 inválido" })
    return
  }

  if (buffer.length === 0) {
    res.status(400).json({ error: "Avatar vacío" })
    return
  }

  if (buffer.length > MAX_AVATAR_BYTES) {
    res.status(413).json({
      error: `El avatar excede el tamaño máximo (${Math.floor(
        MAX_AVATAR_BYTES / 1024,
      )} KB)`,
    })
    return
  }

  // Verify the decoded bytes actually match the claimed image MIME type by
  // checking standard magic-byte signatures. This prevents attackers from
  // disguising arbitrary content (e.g. HTML, scripts, executables) as an
  // image by simply lying in the data-URL header.
  if (!matchesImageSignature(mime, buffer)) {
    res.status(400).json({
      error: "El contenido no coincide con el tipo de imagen declarado",
    })
    return
  }

  // NOTE: We do not perform full image decoding / dimension validation /
  // virus scanning here — that would require additional dependencies or a
  // dedicated upload service. For a production deployment, avatars should
  // be uploaded to an object-storage service (S3, GCS, etc.) with proper
  // image processing and AV scanning rather than stored as data URLs.
  user.avatarUrl = avatarUrl

  res.json({
    message: "Avatar actualizado",
    user: sanitizeUser(user),
  })
})

// Validate that the decoded payload's first bytes match the claimed MIME
// type's well-known signature (magic numbers).
function matchesImageSignature(mime: string, buf: Buffer): boolean {
  if (buf.length < 4) return false
  switch (mime) {
    case "image/png":
      // 89 50 4E 47 0D 0A 1A 0A
      return (
        buf.length >= 8 &&
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47 &&
        buf[4] === 0x0d &&
        buf[5] === 0x0a &&
        buf[6] === 0x1a &&
        buf[7] === 0x0a
      )
    case "image/jpeg":
    case "image/jpg":
      // FF D8 FF
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
    case "image/gif":
      // "GIF87a" or "GIF89a"
      return (
        buf.length >= 6 &&
        buf[0] === 0x47 &&
        buf[1] === 0x49 &&
        buf[2] === 0x46 &&
        buf[3] === 0x38 &&
        (buf[4] === 0x37 || buf[4] === 0x39) &&
        buf[5] === 0x61
      )
    case "image/webp":
      // "RIFF" .... "WEBP"
      return (
        buf.length >= 12 &&
        buf[0] === 0x52 &&
        buf[1] === 0x49 &&
        buf[2] === 0x46 &&
        buf[3] === 0x46 &&
        buf[8] === 0x57 &&
        buf[9] === 0x45 &&
        buf[10] === 0x42 &&
        buf[11] === 0x50
      )
    default:
      return false
  }
}

// DELETE /api/users/me/avatar
router.delete("/me/avatar", (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token de autenticación requerido" })
    return
  }

  const token = authHeader.slice(7)
  const user = getUserByToken(token)

  if (!user) {
    res.status(401).json({ error: "Token inválido o sesión expirada" })
    return
  }

  user.avatarUrl = null

  res.json({
    message: "Avatar eliminado",
    user: sanitizeUser(user),
  })
})

// POST /api/users/logout
router.post("/logout", (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token de autenticación requerido" })
    return
  }

  const token = authHeader.slice(7)
  authTokens.delete(token)

  res.json({ message: "Sesión cerrada" })
})

export default router
