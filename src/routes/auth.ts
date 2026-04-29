import { Router, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import {
  users,
  sessions,
  nextUserId,
  generateToken,
  hashPassword,
  verifyPassword,
  findUserByEmail,
  findSessionByToken,
  findUserById,
  SESSION_TTL_MS,
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

// ─── Rate limiting ───────────────────────────────────────────────────────────
// Simple fixed-window in-memory rate limiter. Intentionally implemented
// without an external dependency to avoid expanding the dependency surface.
// Note: this state is per-process. If the service is ever scaled
// horizontally, swap this for a shared store (e.g. Redis) so an attacker
// cannot just spread requests across instances.

interface RateBucket {
  count: number
  resetAt: number
}

interface RateLimiterOptions {
  windowMs: number
  max: number
  // How a request maps to a bucket key. Defaults to client IP.
  keyFn?: (req: Request) => string
  message?: string
}

function clientIp(req: Request): string {
  // express's req.ip honors trust proxy settings; fall back to socket
  // remote address if for some reason it's not populated.
  return (
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown"
  )
}

function createRateLimiter(opts: RateLimiterOptions) {
  const buckets = new Map<string, RateBucket>()

  return function rateLimiter(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const now = Date.now()
    const key = (opts.keyFn ?? clientIp)(req)

    // Opportunistic cleanup so the map can't grow unbounded.
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) {
        if (b.resetAt <= now) buckets.delete(k)
      }
    }

    let bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + opts.windowMs }
      buckets.set(key, bucket)
    }

    bucket.count += 1

    if (bucket.count > opts.max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      res.setHeader("Retry-After", String(retryAfterSec))
      res
        .status(429)
        .json({
          error:
            opts.message ??
            "Demasiadas solicitudes. Intenta nuevamente más tarde.",
        })
      return
    }

    next()
  }
}

// Login: stricter limit per IP to deter brute force / credential stuffing.
// Combined with the per-(IP+email) limiter below, this protects against
// both wide spraying and targeted attacks against a single account.
const loginIpLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Demasiados intentos de inicio de sesión. Intenta más tarde.",
})

const loginIpEmailLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Demasiados intentos de inicio de sesión. Intenta más tarde.",
  keyFn: (req) => {
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.toLowerCase()
        : ""
    return `${clientIp(req)}|${email}`
  },
})

// Register: deter automated account creation.
const registerIpLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "Demasiados registros desde esta dirección. Intenta más tarde.",
})

// POST /api/auth/register
router.post("/register", registerIpLimiter, (req, res) => {
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
  const now = new Date()
  sessions.push({
    token,
    userId: user.id,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
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
router.post("/login", loginIpLimiter, loginIpEmailLimiter, (req, res) => {
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

  if (!verifyPassword(data.password, user.password)) {
    res.status(401).json({ error: "Email o contraseña incorrectos" })
    return
  }

  // Create session
  const token = generateToken()
  const now = new Date()
  sessions.push({
    token,
    userId: user.id,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
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
