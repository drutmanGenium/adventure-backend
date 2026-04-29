import { Router } from "express"
import { z } from "zod"
import { users, nextUserId } from "../data/store.js"
import {
  authMiddleware,
  generateToken,
  hashPassword,
  verifyPassword,
} from "../middleware/auth.js"
import type { User } from "../types.js"
import type { Request } from "express"

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

function sanitizeUser(user: User) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  }
}

// POST /api/auth/register
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
  if (users.find((u) => u.email === data.email)) {
    res.status(409).json({ error: "El email ya está registrado" })
    return
  }

  const user: User = {
    id: nextUserId(),
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    // Passwords are stored as scrypt hashes (salted) — never plaintext.
    password: hashPassword(data.password),
    avatarUrl: null,
    createdAt: new Date().toISOString(),
  }

  users.push(user)

  res.status(201).json({
    message: "Usuario registrado exitosamente",
    token: generateToken(user.id),
    user: sanitizeUser(user),
  })
})

// POST /api/auth/login
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

  if (!user || !verifyPassword(password, user.password)) {
    res.status(401).json({ error: "Email o contraseña incorrectos" })
    return
  }

  res.json({
    message: "Inicio de sesión exitoso",
    token: generateToken(user.id),
    user: sanitizeUser(user),
  })
})

// GET /api/auth/me
router.get("/me", authMiddleware, (req, res) => {
  const user = (req as Request & { user: User }).user
  res.json({ user: sanitizeUser(user) })
})

// PUT /api/auth/avatar
router.put("/avatar", authMiddleware, (req, res) => {
  const user = (req as Request & { user: User }).user

  const { avatarUrl } = req.body
  if (!avatarUrl || typeof avatarUrl !== "string") {
    res.status(400).json({ error: "avatarUrl es obligatorio" })
    return
  }

  user.avatarUrl = avatarUrl
  res.json({
    message: "Avatar actualizado",
    user: sanitizeUser(user),
  })
})

// DELETE /api/auth/avatar
router.delete("/avatar", authMiddleware, (req, res) => {
  const user = (req as Request & { user: User }).user
  user.avatarUrl = null
  res.json({
    message: "Avatar eliminado",
    user: sanitizeUser(user),
  })
})

export default router
