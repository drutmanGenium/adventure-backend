import type { Request, Response, NextFunction } from "express"
import { sessions, users } from "../data/store"

// Extiende Request para incluir usuario autenticado
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        firstName: string
        lastName: string
        email: string
        phone: string
      }
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
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

  req.user = {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
  }

  next()
}
