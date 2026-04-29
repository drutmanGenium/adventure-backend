import { Router } from "express"
import { z } from "zod"
import crypto from "node:crypto"
import {
  users,
  sessions,
  nextUserId,
  findUserByEmail,
  findSessionByToken,
  findUserById,
  removeSession,
} from "../data/store"
import { requireAuth } from "../middleware/auth"

const router = Router()

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex")
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

function createSession(userId: string): string {
  const token = generateToken()
  const now = new Date()
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 días

  sessions.push({
    token,
    userId,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  })

  return token
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const RegisterSchema = z.object({
  firstName: z.string().min(1, "Nombre es obligatorio"),
  lastName: z.string().min(1, "Apellido es obligatorio"),
  email: z.string().email("Email inválido"),
  password: z
    .string()
    .min(6, "La contraseña debe tener al menos 6 caracteres"),
})

const LoginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Contraseña es obligatoria"),
})

// ─── POST /api/auth/register ─────────────────────────────────────────────────

router.post("/register", (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({
      error: "Datos inválidos",
      details: parsed.error.flatten().fieldErrors,
    })
    return
  }

  const { firstName, lastName, email, password } = parsed.data

  // Verificar si el email ya existe
  if (findUserByEmail(email)) {
    res.status(409).json({ error: "Ya existe una cuenta con ese email." })
    return
  }

  const user = {
    id: nextUserId(),
    firstName,
    lastName,
    email: email.toLowerCase(),
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  }

  users.push(user)

  const token = createSession(user.id)

  res.status(201).json({
    message: "Cuenta creada exitosamente.",
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    },
    token,
  })
})

// ─── POST /api/auth/login ────────────────────────────────────────────────────

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

  const user = findUserByEmail(email)

  if (!user || user.passwordHash !== hashPassword(password)) {
    res.status(401).json({ error: "Email o contraseña incorrectos." })
    return
  }

  const token = createSession(user.id)

  res.json({
    message: "Inicio de sesión exitoso.",
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    },
    token,
  })
})

// ─── POST /api/auth/logout ───────────────────────────────────────────────────

router.post("/logout", (req, res) => {
  const authHeader = req.headers.authorization

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7)
    removeSession(token)
  }

  res.json({ message: "Sesión cerrada exitosamente." })
})

// ─── GET /api/auth/me ────────────────────────────────────────────────────────

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user })
})

export default router
