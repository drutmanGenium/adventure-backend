import type { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"

// JWT_SECRET must be provided via environment variable. We intentionally do
// NOT supply a default fallback: a hardcoded default would allow attackers
// to forge tokens if the env var was ever omitted in production.
const JWT_SECRET = process.env.JWT_SECRET

// Require a sufficiently random secret. 32 chars is a reasonable minimum
// for a randomly-generated secret (e.g. `openssl rand -hex 32` -> 64 chars).
const MIN_JWT_SECRET_LENGTH = 32

if (!JWT_SECRET || JWT_SECRET.length < MIN_JWT_SECRET_LENGTH) {
  throw new Error(
    `JWT_SECRET environment variable must be set and at least ${MIN_JWT_SECRET_LENGTH} characters long. ` +
      `Generate one with: openssl rand -hex 32`,
  )
}

// Narrow the type for downstream use after the runtime check above.
const VERIFIED_JWT_SECRET: string = JWT_SECRET

export interface AuthRequest extends Request {
  userId?: string
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) {
    res.status(401).json({ error: "Token de autenticación requerido" })
    return
  }

  try {
    const decoded = jwt.verify(token, VERIFIED_JWT_SECRET) as { userId: string }
    req.userId = decoded.userId
    next()
  } catch {
    res.status(403).json({ error: "Token inválido o expirado" })
  }
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, VERIFIED_JWT_SECRET, { expiresIn: "7d" })
}

export { VERIFIED_JWT_SECRET as JWT_SECRET }
