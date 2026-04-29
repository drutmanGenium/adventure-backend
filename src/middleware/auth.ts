import type { Request, Response, NextFunction } from "express"
import { users } from "../data/store.js"

// Simple token-based auth (token = base64(userId))
// In production, use JWT with proper signing

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token de autenticación requerido" })
    return
  }

  const token = authHeader.split(" ")[1]
  try {
    const userId = Buffer.from(token, "base64").toString("utf-8")
    const user = users.find((u) => u.id === userId)
    if (!user) {
      res.status(401).json({ error: "Token inválido" })
      return
    }
    ;(req as Request & { user: typeof user }).user = user
    next()
  } catch {
    res.status(401).json({ error: "Token inválido" })
  }
}
