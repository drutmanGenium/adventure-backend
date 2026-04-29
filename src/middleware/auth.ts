import type { Request, Response, NextFunction } from "express"
import { timingSafeEqual } from "crypto"

declare global {
  // Augment Express's Request so route handlers can read the authenticated
  // user identity that this middleware attaches.
  namespace Express {
    interface Request {
      authUserEmail?: string
    }
  }
}

/**
 * Minimal request authentication middleware for the avatar endpoints.
 *
 * LIMITATION: This codebase does not have a real user/session system, so a
 * full authentication redesign is out of scope for this security fix. The
 * middleware below is an interim, deny-by-default layer that:
 *
 *   1. Requires `API_AUTH_TOKEN` to be configured server-side. If unset, all
 *      requests are rejected (fail closed) instead of silently allowed.
 *   2. Requires the caller to present `Authorization: Bearer <API_AUTH_TOKEN>`
 *      using a constant-time comparison.
 *   3. Requires the caller to identify themselves with an `x-user-email`
 *      header. Routes use this value to enforce per-resource ownership and
 *      mitigate IDOR — operations are scoped to records owned by this email.
 *
 * This should be replaced with a proper authentication system (JWT/OAuth/
 * sessions backed by a real user store) so that the user identity is bound
 * to the credential server-side rather than supplied alongside it.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const expectedToken = process.env.API_AUTH_TOKEN

  // Fail closed: refuse to serve protected routes if no token is configured.
  if (!expectedToken || expectedToken.length === 0) {
    res
      .status(503)
      .json({ error: "Autenticación no configurada en el servidor" })
    return
  }

  const header = req.headers.authorization
  if (typeof header !== "string" || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "No autorizado" })
    return
  }

  const provided = header.slice("Bearer ".length).trim()
  const providedBuf = Buffer.from(provided, "utf8")
  const expectedBuf = Buffer.from(expectedToken, "utf8")

  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    res.status(401).json({ error: "No autorizado" })
    return
  }

  const rawEmail = req.headers["x-user-email"]
  const userEmail = Array.isArray(rawEmail) ? rawEmail[0] : rawEmail
  if (typeof userEmail !== "string" || userEmail.trim().length === 0) {
    res.status(401).json({ error: "Encabezado x-user-email requerido" })
    return
  }

  req.authUserEmail = userEmail.trim().toLowerCase()
  next()
}
