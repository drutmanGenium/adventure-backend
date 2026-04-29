import { Router } from "express"
import { z } from "zod"
import {
  users,
  sessions,
  nextUserId,
  generateToken,
  hashPassword,
  findUserByEmail,
  findSessionByToken,
  findUserById,
} from "../data/store"

const router = Router()

const RegisterSchema = z.object({
  firstName: z.string().min(1, "Nombre es obligatorio"),
  lastName: z.string().min(1, "Apellido es obligatorio"),
  email: z.string().email("Email inválido"),
  password: z
    .string()
    .min(6, "La contraseña debe tener al menos 6 caracteres"),
  phone: z.string().optional().default(""),
})

const LoginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Contraseña es obligatoria"),
})

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
  const existing = findUserByEmail(data.email)
  if (existing) {
    res.status(409).json({ error: "Ya existe una cuenta con este email" })
    return
  }

  const user = {
    id: nextUserId(),
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email.toLowerCase(),
    password: hashPassword(data.password),
    phone: data.phone,
    createdAt: new Date().toISOString(),
  }

  users.push(user)

  // Create session
  const token = generateToken()
  sessions.push({
    token,
    userId: user.id,
    createdAt: new Date().toISOString(),
  })

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

  const data = parsed.data

  const user = findUserByEmail(data.email)
  if (!user) {
    res.status(401).json({ error: "Email o contraseña incorrectos" })
    return
  }

  if (user.password !== hashPassword(data.password)) {
    res.status(401).json({ error: "Email o contraseña incorrectos" })
    return
  }

  // Create session
  const token = generateToken()
  sessions.push({
    token,
    userId: user.id,
    createdAt: new Date().toISOString(),
  })

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

// GET /api/auth/me
router.get("/me", (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "No autenticado" })
    return
  }

  const token = authHeader.slice(7)
  const session = findSessionByToken(token)
  if (!session) {
    res.status(401).json({ error: "Sesión inválida o expirada" })
    return
  }

  const user = findUserById(session.userId)
  if (!user) {
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

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "No autenticado" })
    return
  }

  const token = authHeader.slice(7)
  const sessionIndex = sessions.findIndex((s) => s.token === token)
  if (sessionIndex !== -1) {
    sessions.splice(sessionIndex, 1)
  }

  res.json({ message: "Sesión cerrada exitosamente" })
})

export default router
