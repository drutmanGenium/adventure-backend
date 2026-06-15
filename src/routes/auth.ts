import { Router } from "express"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { users, nextUserId } from "../data/store"
import { authenticateToken, generateToken, type AuthRequest } from "../middleware/auth"

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

  const token = generateToken(user.id)

  res.status(201).json({
    message: "Cuenta creada exitosamente",
    token,
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    },
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

  const { email, password } = parsed.data

  const user = users.find((u) => u.email === email)
  if (!user) {
    res.status(401).json({ error: "Email o contraseña incorrectos" })
    return
  }

  const validPassword = await bcrypt.compare(password, user.password)
  if (!validPassword) {
    res.status(401).json({ error: "Email o contraseña incorrectos" })
    return
  }

  const token = generateToken(user.id)

  res.json({
    message: "Inicio de sesión exitoso",
    token,
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    },
  })
})

// GET /api/auth/me
router.get("/me", authenticateToken, (req: AuthRequest, res) => {
  const user = users.find((u) => u.id === req.userId)
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
      createdAt: user.createdAt,
    },
  })
})

export default router
