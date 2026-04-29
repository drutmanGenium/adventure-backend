import type { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.JWT_SECRET || "adventure-secret-key-2026"

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) {
    res.status(401).json({ error: "Token de autenticación requerido" })
    return
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string }
    ;(req as any).user = decoded
    next()
  } catch {
    res.status(403).json({ error: "Token inválido o expirado" })
  }
}

export { JWT_SECRET }
