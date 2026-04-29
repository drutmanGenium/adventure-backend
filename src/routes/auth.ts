import { Router } from "express"
import { z } from "zod"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { users, nextUserId } from "../data/store"
import { JWT_SECRET, authenticateToken } from "../middleware/auth"

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

// POST /api/auth/register
router.post("/register", async (req, res) => {
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
  const existingUser = users.find((u) => u.email === data.email)
  if (existingUser) {
    res.status(409).json({ error: "Ya existe una cuenta con este email" })
    return
  }

  const hashedPassword = await bcrypt.hash(data.password, 10)

  const user = {
    id: nextUserId(),
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    password: hashedPassword,
    createdAt: new Date().toISOString(),
  }

  users.push(user)

  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: "7d",
  })

  res.status(201).json({
    message: "Cuenta creada exitosamente",
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    },
    token,
  })
})

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({
      error: "Datos inválidos",
      details: parsed.error.flatten().fieldErrors,
    })
    return
  }

  const data = parsed.data

  const user = users.find((u) => u.email === data.email)
  if (!user) {
    res.status(401).json({ error: "Email o contraseña incorrectos" })
    return
  }

  const validPassword = await bcrypt.compare(data.password, user.password)
  if (!validPassword) {
    res.status(401).json({ error: "Email o contraseña incorrectos" })
    return
  }

  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: "7d",
  })

  res.json({
    message: "Sesión iniciada",
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    },
    token,
  })
})

// GET /api/auth/me - Get current user (protected)
router.get("/me", authenticateToken, (req, res) => {
  const userId = (req as any).user.userId
  const user = users.find((u) => u.id === userId)

  if (!user) {
    res.status(404).json({ error: "Usuario no encontrado" })
    return
  }

  res.json({
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    },
  })
})

export default router
