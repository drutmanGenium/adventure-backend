import { Router } from "express"
import { z } from "zod"
import { users, nextUserId } from "../data/store"
import { createRateLimiter, AUTH_RATE_LIMITS } from "../middleware/rate-limiter"
import { hashPassword, verifyPassword } from "../utils/password"

const router = Router()

// ─── Rate limiters para endpoints de autenticación ──────────────────────────

const loginLimiter = createRateLimiter(AUTH_RATE_LIMITS.login)
const registerLimiter = createRateLimiter(AUTH_RATE_LIMITS.register)

// ─── Schemas de validación ──────────────────────────────────────────────────

const RegisterSchema = z.object({
  firstName: z.string().min(1, "Nombre es obligatorio"),
  lastName: z.string().min(1, "Apellido es obligatorio"),
  email: z.string().email("Email inválido"),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres"),
})

const LoginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Contraseña es obligatoria"),
})

// ─── POST /api/auth/register ────────────────────────────────────────────────

router.post("/register", registerLimiter, (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({
      error: "Datos inválidos",
      details: parsed.error.flatten().fieldErrors,
    })
    return
  }

  const { firstName, lastName, email, password } = parsed.data

  // Verificar si el email ya está registrado
  const existing = users.find((u) => u.email === email)
  if (existing) {
    res.status(409).json({ error: "El email ya está registrado" })
    return
  }

  // Hash the password before storage. The plaintext is never persisted.
  const passwordHash = hashPassword(password)

  const user = {
    id: nextUserId(),
    firstName,
    lastName,
    email,
    password: passwordHash,
    createdAt: new Date().toISOString(),
  }

  users.push(user)

  res.status(201).json({
    message: "Registro exitoso",
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      createdAt: user.createdAt,
    },
  })
})

// ─── POST /api/auth/login ───────────────────────────────────────────────────

router.post("/login", loginLimiter, (req, res) => {
  const parsed = LoginSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({
      error: "Datos inválidos",
      details: parsed.error.flatten().fieldErrors,
    })
    return
  }

  const { email, password } = parsed.data

  // Look up by email first, then verify the password against the stored
  // hash with a constant-time comparison. We deliberately return the same
  // generic error for "no such user" and "wrong password" to avoid leaking
  // which emails are registered.
  const user = users.find((u) => u.email === email)
  if (!user || !verifyPassword(password, user.password)) {
    res.status(401).json({ error: "Credenciales inválidas" })
    return
  }

  res.json({
    message: "Inicio de sesión exitoso",
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    },
  })
})

export default router
