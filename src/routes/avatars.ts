import { Router } from "express"
import { z } from "zod"
import { userProfiles, nextUserProfileId } from "../data/store"
import { requireAuth } from "../middleware/auth"

const router = Router()

// All avatar endpoints require authentication. Per-resource authorization is
// enforced below by matching the profile's email against the authenticated
// user's email (req.authUserEmail) to prevent IDOR via /:id manipulation.
//
// LIMITATION: This codebase has no real user store, so ownership is keyed off
// the unique `email` field on UserProfile. A proper user/session system
// should bind credentials to a stable user id server-side.
router.use(requireAuth)

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]
const MAX_AVATAR_SIZE = 2 * 1024 * 1024 // 2MB en base64

const CreateProfileSchema = z.object({
  name: z.string().min(1, "Nombre es obligatorio"),
  email: z.string().email("Email inválido"),
  avatarData: z
    .string()
    .min(1, "Datos del avatar son obligatorios")
    .refine(
      (val) => val.length <= MAX_AVATAR_SIZE,
      "El avatar no debe superar 2MB"
    ),
  avatarMimeType: z
    .string()
    .refine(
      (val) => ALLOWED_MIME_TYPES.includes(val),
      `Tipo de imagen inválido. Permitidos: ${ALLOWED_MIME_TYPES.join(", ")}`
    ),
})

const UpdateAvatarSchema = z.object({
  avatarData: z
    .string()
    .min(1, "Datos del avatar son obligatorios")
    .refine(
      (val) => val.length <= MAX_AVATAR_SIZE,
      "El avatar no debe superar 2MB"
    ),
  avatarMimeType: z
    .string()
    .refine(
      (val) => ALLOWED_MIME_TYPES.includes(val),
      `Tipo de imagen inválido. Permitidos: ${ALLOWED_MIME_TYPES.join(", ")}`
    ),
})

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// POST /api/avatars - Crear perfil con avatar
router.post("/", (req, res) => {
  const parsed = CreateProfileSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({
      error: "Datos inválidos",
      details: parsed.error.flatten().fieldErrors,
    })
    return
  }

  const data = parsed.data
  const requestEmail = normalizeEmail(data.email)

  // Authorization: the authenticated user can only create/update their own
  // profile. Reject requests where the body email differs from the
  // authenticated identity.
  if (!req.authUserEmail || requestEmail !== req.authUserEmail) {
    res.status(403).json({ error: "Prohibido" })
    return
  }

  // Verificar si ya existe un perfil con ese email
  const existing = userProfiles.find(
    (p) => normalizeEmail(p.email) === requestEmail
  )
  if (existing) {
    // Actualizar el perfil existente
    existing.name = data.name
    existing.avatarData = data.avatarData
    existing.avatarMimeType = data.avatarMimeType
    existing.updatedAt = new Date().toISOString()

    res.json({
      message: "Perfil actualizado",
      profile: {
        id: existing.id,
        name: existing.name,
        email: existing.email,
        avatarUrl: `/api/avatars/${existing.id}/image`,
        updatedAt: existing.updatedAt,
      },
    })
    return
  }

  const now = new Date().toISOString()
  const profile = {
    id: nextUserProfileId(),
    name: data.name,
    email: data.email,
    avatarData: data.avatarData,
    avatarMimeType: data.avatarMimeType,
    createdAt: now,
    updatedAt: now,
  }

  userProfiles.push(profile)

  res.status(201).json({
    message: "Perfil creado con avatar",
    profile: {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      avatarUrl: `/api/avatars/${profile.id}/image`,
      createdAt: profile.createdAt,
    },
  })
})

// PUT /api/avatars/:id - Actualizar avatar de un perfil
router.put("/:id", (req, res) => {
  const profile = userProfiles.find((p) => p.id === req.params.id)
  // Return 404 (rather than 403) for profiles the caller does not own to
  // avoid leaking which profile ids exist.
  if (!profile || normalizeEmail(profile.email) !== req.authUserEmail) {
    res.status(404).json({ error: "Perfil no encontrado" })
    return
  }

  const parsed = UpdateAvatarSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({
      error: "Datos inválidos",
      details: parsed.error.flatten().fieldErrors,
    })
    return
  }

  profile.avatarData = parsed.data.avatarData
  profile.avatarMimeType = parsed.data.avatarMimeType
  profile.updatedAt = new Date().toISOString()

  res.json({
    message: "Avatar actualizado",
    profile: {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      avatarUrl: `/api/avatars/${profile.id}/image`,
      updatedAt: profile.updatedAt,
    },
  })
})

// GET /api/avatars/:id/image - Servir la imagen del avatar
router.get("/:id/image", (req, res) => {
  const profile = userProfiles.find((p) => p.id === req.params.id)
  if (!profile || normalizeEmail(profile.email) !== req.authUserEmail) {
    res.status(404).json({ error: "Avatar no encontrado" })
    return
  }

  const buffer = Buffer.from(profile.avatarData, "base64")
  res.set("Content-Type", profile.avatarMimeType)
  res.set("Cache-Control", "private, max-age=3600")
  res.send(buffer)
})

// GET /api/avatars/:id - Obtener perfil por ID
router.get("/:id", (req, res) => {
  const profile = userProfiles.find((p) => p.id === req.params.id)
  if (!profile || normalizeEmail(profile.email) !== req.authUserEmail) {
    res.status(404).json({ error: "Perfil no encontrado" })
    return
  }

  res.json({
    id: profile.id,
    name: profile.name,
    email: profile.email,
    avatarUrl: `/api/avatars/${profile.id}/image`,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  })
})

// GET /api/avatars - Listar perfiles del usuario autenticado
router.get("/", (req, res) => {
  // Scope the listing to the authenticated user's own profile(s) so this
  // endpoint cannot be used to enumerate other users' emails.
  const data = userProfiles
    .filter((p) => normalizeEmail(p.email) === req.authUserEmail)
    .map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      avatarUrl: `/api/avatars/${p.id}/image`,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }))

  res.json({
    count: data.length,
    data,
  })
})

// DELETE /api/avatars/:id - Eliminar perfil y avatar
router.delete("/:id", (req, res) => {
  const index = userProfiles.findIndex((p) => p.id === req.params.id)
  if (
    index === -1 ||
    normalizeEmail(userProfiles[index].email) !== req.authUserEmail
  ) {
    res.status(404).json({ error: "Perfil no encontrado" })
    return
  }

  userProfiles.splice(index, 1)

  res.json({ message: "Perfil y avatar eliminados" })
})

export default router
