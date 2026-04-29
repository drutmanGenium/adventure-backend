import { Router } from "express"
import { z } from "zod"
import crypto from "crypto"
import { users, sessions, nextUserId } from "../data/store"

const router = Router()

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex")
}

function generateToken(): string {
  return crypto.randomBytes(48).toString("hex")
}

// Sesiones expiran en 7 dias
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000

// ─── Schemas ─────────────────────────────────────────────────────────────────

const RegisterSchema = z.object({
  firstName: z.string().min(1, "Nombre es obligatorio"),
  lastName: z.string().min(1, "Apellido es obligatorio"),
  email: z.string().email("Email inválido"),
  phone: z.string().min(7, "Teléfono inválido (min. 7 digitos)"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
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

  const data = parsed.data

  // Verificar si el email ya existe
  const existingUser = users.find(
    (u) => u.email.toLowerCase() === data.email.toLowerCase()
  )
  if (existingUser) {
    res.status(409).json({
      error: "Ya existe una cuenta con ese email",
    })
    return
  }

  // Crear usuario
  const salt = crypto.randomBytes(16).toString("hex")
  const passwordHash = hashPassword(data.password, salt)

  const user = {
    id: nextUserId(),
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email.toLowerCase(),
    phone: data.phone,
    passwordHash,
    passwordSalt: salt,
    createdAt: new Date().toISOString(),
  }

  users.push(user)

  // Crear sesion
  const token = generateToken()
  const now = new Date()
  const session = {
    token,
    userId: user.id,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_DURATION_MS).toISOString(),
  }

  sessions.set(token, session)

  res.status(201).json({
    message: "Cuenta creada exitosamente",
    token,
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
    },
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

  const data = parsed.data

  // Buscar usuario
  const user = users.find(
    (u) => u.email.toLowerCase() === data.email.toLowerCase()
  )

  if (!user) {
    res.status(401).json({
      error: "Email o contraseña incorrectos",
    })
    return
  }

  // Verificar contraseña
  const hash = hashPassword(data.password, user.passwordSalt)
  if (hash !== user.passwordHash) {
    res.status(401).json({
      error: "Email o contraseña incorrectos",
    })
    return
  }

  // Crear sesion
  const token = generateToken()
  const now = new Date()
  const session = {
    token,
    userId: user.id,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_DURATION_MS).toISOString(),
  }

  sessions.set(token, session)

  res.json({
    message: "Inicio de sesión exitoso",
    token,
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
    },
  })
})

// ─── GET /api/auth/me ────────────────────────────────────────────────────────

router.get("/me", (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token de autenticación requerido" })
    return
  }

  const token = authHeader.slice(7)
  const session = sessions.get(token)

  if (!session) {
    res.status(401).json({ error: "Sesión inválida o expirada" })
    return
  }

  // Verificar expiración
  if (new Date(session.expiresAt) < new Date()) {
    sessions.delete(token)
    res.status(401).json({ error: "Sesión expirada" })
    return
  }

  const user = users.find((u) => u.id === session.userId)
  if (!user) {
    sessions.delete(token)
    res.status(401).json({ error: "Usuario no encontrado" })
    return
  }

  res.json({
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
    },
  })
})

// ─── POST /api/auth/logout ───────────────────────────────────────────────────

router.post("/logout", (req, res) => {
  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7)
    sessions.delete(token)
  }

  res.json({ message: "Sesión cerrada exitosamente" })
})

export default router
