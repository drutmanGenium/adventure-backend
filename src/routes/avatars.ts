import { Router } from "express"
import { z } from "zod"
import { userProfiles, nextUserProfileId } from "../data/store"

const router = Router()

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

  // Verificar si ya existe un perfil con ese email
  const existing = userProfiles.find((p) => p.email === data.email)
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
  if (!profile) {
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
  if (!profile) {
    res.status(404).json({ error: "Avatar no encontrado" })
    return
  }

  const buffer = Buffer.from(profile.avatarData, "base64")
  res.set("Content-Type", profile.avatarMimeType)
  res.set("Cache-Control", "public, max-age=3600")
  res.send(buffer)
})

// GET /api/avatars/:id - Obtener perfil por ID
router.get("/:id", (req, res) => {
  const profile = userProfiles.find((p) => p.id === req.params.id)
  if (!profile) {
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

// GET /api/avatars - Listar todos los perfiles
router.get("/", (_req, res) => {
  const data = userProfiles.map((p) => ({
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
  if (index === -1) {
    res.status(404).json({ error: "Perfil no encontrado" })
    return
  }

  userProfiles.splice(index, 1)

  res.json({ message: "Perfil y avatar eliminados" })
})

export default router
