import { Router } from "express"
import { z } from "zod"
import { users, authTokens, nextUserId, generateToken, getUserByToken } from "../data/store"

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
    password: data.password,
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

  const user = users.find((u) => u.email === email && u.password === password)
  if (!user) {
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

  // Validate it's a data URL (base64 image)
  if (!avatarUrl.startsWith("data:image/")) {
    res.status(400).json({ error: "El avatar debe ser una imagen válida (data URL)" })
    return
  }

  user.avatarUrl = avatarUrl

  res.json({
    message: "Avatar actualizado",
    user: sanitizeUser(user),
  })
})

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
