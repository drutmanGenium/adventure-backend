import type { Request, Response, NextFunction } from "express"

// ─── Rate Limiter Configuration ─────────────────────────────────────────────

export interface RateLimitConfig {
  /** Máximo de intentos permitidos en la ventana de tiempo */
  maxAttempts: number
  /** Ventana de tiempo en milisegundos */
  windowMs: number
  /** Mensaje personalizado cuando se excede el límite */
  message?: string
}

interface RateLimitEntry {
  count: number
  firstAttempt: number
}

// ─── Configuraciones por defecto ────────────────────────────────────────────

const DEFAULT_CONFIG: RateLimitConfig = {
  maxAttempts: 10,
  windowMs: 15 * 60 * 1000, // 15 minutos
  message: "Demasiados intentos. Por favor, intenta de nuevo más tarde.",
}

export const AUTH_RATE_LIMITS = {
  login: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutos
    message: "Demasiados intentos de inicio de sesión. Por favor, intenta de nuevo en 15 minutos.",
  } satisfies RateLimitConfig,
  register: {
    maxAttempts: 3,
    windowMs: 60 * 60 * 1000, // 1 hora
    message: "Demasiados intentos de registro. Por favor, intenta de nuevo en 1 hora.",
  } satisfies RateLimitConfig,
}

// ─── Rate Limiter Factory ───────────────────────────────────────────────────

/**
 * Crea un middleware de rate limiting basado en IP.
 * Usa almacenamiento en memoria con limpieza automática.
 */
export function createRateLimiter(config: Partial<RateLimitConfig> = {}) {
  const { maxAttempts, windowMs, message } = { ...DEFAULT_CONFIG, ...config }
  const store = new Map<string, RateLimitEntry>()

  // Limpieza periódica de entradas expiradas
  const cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (now - entry.firstAttempt >= windowMs) {
        store.delete(key)
      }
    }
  }, windowMs)

  // Evitar que el intervalo mantenga vivo el proceso
  if (cleanupInterval.unref) {
    cleanupInterval.unref()
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || "unknown"
    const now = Date.now()

    const entry = store.get(ip)

    // Si no hay entrada o la ventana expiró, crear nueva entrada
    if (!entry || now - entry.firstAttempt >= windowMs) {
      store.set(ip, { count: 1, firstAttempt: now })
      setRateLimitHeaders(res, maxAttempts, maxAttempts - 1, 0)
      next()
      return
    }

    // Incrementar contador
    entry.count++

    // Calcular tiempo restante para reset
    const resetTime = entry.firstAttempt + windowMs
    const retryAfterMs = resetTime - now
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1000)
    const remaining = Math.max(0, maxAttempts - entry.count)

    setRateLimitHeaders(res, maxAttempts, remaining, retryAfterSeconds)

    // Si excede el límite, retornar 429
    if (entry.count > maxAttempts) {
      res.status(429).json({
        error: "Too Many Requests",
        message,
        retryAfter: retryAfterSeconds,
      })
      return
    }

    next()
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function setRateLimitHeaders(
  res: Response,
  limit: number,
  remaining: number,
  retryAfter: number,
): void {
  res.set("X-RateLimit-Limit", String(limit))
  res.set("X-RateLimit-Remaining", String(remaining))
  if (retryAfter > 0) {
    res.set("Retry-After", String(retryAfter))
  }
}
