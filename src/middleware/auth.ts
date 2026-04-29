import type { Request, Response, NextFunction } from "express"
import { findSessionByToken, findUserById } from "../data/store"

// Extiende Request para incluir user autenticado
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        firstName: string
        lastName: string
        email: string
      }
    }
  }
}

/**
 * Middleware que requiere autenticación.
 * Busca el token en el header Authorization: Bearer <token>
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "No autenticado. Se requiere token de sesión." })
    return
  }

  const token = authHeader.slice(7)
  const session = findSessionByToken(token)

  if (!session) {
    res.status(401).json({ error: "Sesión inválida o expirada." })
    return
  }

  const user = findUserById(session.userId)

  if (!user) {
    res.status(401).json({ error: "Usuario no encontrado." })
    return
  }

  req.user = {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
  }

  next()
}
