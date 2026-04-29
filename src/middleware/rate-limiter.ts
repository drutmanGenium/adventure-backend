import { Request, Response, NextFunction } from "express"

// ─── Rate Limiter Configuration ──────────────────────────────────────────────

export interface RateLimitConfig {
  /** Máximo número de intentos permitidos en la ventana de tiempo */
  maxAttempts: number
  /** Ventana de tiempo en milisegundos */
  windowMs: number
  /** Mensaje de error personalizado (opcional) */
  message?: string
}

interface RateLimitEntry {
  count: number
  firstAttempt: number
}

// ─── Default configurations per endpoint type ────────────────────────────────

export const RATE_LIMIT_PRESETS = {
  /** Para endpoints de autenticación (login/register) - más estricto */
  auth: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutos
    message: "Demasiados intentos de autenticación. Por favor, intente nuevamente en 15 minutos.",
  },
  /** Para endpoints de reservas */
  booking: {
    maxAttempts: 10,
    windowMs: 15 * 60 * 1000, // 15 minutos
    message: "Demasiadas solicitudes de reserva. Por favor, intente nuevamente en 15 minutos.",
  },
  /** Para endpoints de contacto */
  contact: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutos
    message: "Demasiados mensajes enviados. Por favor, intente nuevamente en 15 minutos.",
  },
  /** Configuración general - más permisiva */
  general: {
    maxAttempts: 100,
    windowMs: 15 * 60 * 1000, // 15 minutos
    message: "Demasiadas solicitudes. Por favor, intente nuevamente más tarde.",
  },
} as const satisfies Record<string, RateLimitConfig>

// ─── In-memory rate limit store ──────────────────────────────────────────────

const rateLimitStores = new Map<string, Map<string, RateLimitEntry>>()

/**
 * Limpia entradas expiradas del store de rate limiting.
 * Se ejecuta periódicamente para evitar fugas de memoria.
 */
function cleanupExpiredEntries(store: Map<string, RateLimitEntry>, windowMs: number): void {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now - entry.firstAttempt >= windowMs) {
      store.delete(key)
    }
  }
}

// Ejecutar limpieza cada 5 minutos
setInterval(() => {
  for (const [, store] of rateLimitStores) {
    // Limpiar con la ventana más corta posible para asegurar limpieza
    cleanupExpiredEntries(store, 0)
  }
}, 5 * 60 * 1000).unref()

// ─── Middleware factory ──────────────────────────────────────────────────────

/**
 * Obtiene la IP del cliente, considerando proxies inversos.
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"]
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim()
  }
  return req.ip || req.socket.remoteAddress || "unknown"
}

/**
 * Crea un middleware de rate limiting con la configuración especificada.
 *
 * @param config - Configuración del rate limiter
 * @param storeKey - Clave única para el store (permite rate limits independientes por endpoint)
 * @returns Express middleware
 *
 * @example
 * // Usar un preset
 * router.post("/login", createRateLimiter(RATE_LIMIT_PRESETS.auth, "auth-login"), handler)
 *
 * // Usar configuración personalizada
 * router.post("/register", createRateLimiter({ maxAttempts: 3, windowMs: 60000 }, "auth-register"), handler)
 */
export function createRateLimiter(config: RateLimitConfig, storeKey: string) {
  const { maxAttempts, windowMs, message } = config
  const defaultMessage = "Demasiadas solicitudes. Por favor, intente nuevamente más tarde."

  // Crear o recuperar el store para este endpoint
  if (!rateLimitStores.has(storeKey)) {
    rateLimitStores.set(storeKey, new Map())
  }
  const store = rateLimitStores.get(storeKey)!

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = getClientIp(req)
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

    // Verificar si se excedió el límite
    if (entry.count > maxAttempts) {
      const retryAfterSeconds = Math.ceil((entry.firstAttempt + windowMs - now) / 1000)
      setRateLimitHeaders(res, maxAttempts, 0, retryAfterSeconds)
      res.set("Retry-After", String(retryAfterSeconds))

      res.status(429).json({
        error: message || defaultMessage,
        retryAfter: retryAfterSeconds,
        limit: maxAttempts,
        windowMs,
      })
      return
    }

    const remaining = maxAttempts - entry.count
    const resetSeconds = Math.ceil((entry.firstAttempt + windowMs - now) / 1000)
    setRateLimitHeaders(res, maxAttempts, remaining, resetSeconds)
    next()
  }
}

/**
 * Establece headers estándar de rate limiting en la respuesta.
 */
function setRateLimitHeaders(
  res: Response,
  limit: number,
  remaining: number,
  resetSeconds: number
): void {
  res.set("X-RateLimit-Limit", String(limit))
  res.set("X-RateLimit-Remaining", String(Math.max(0, remaining)))
  res.set("X-RateLimit-Reset", String(resetSeconds))
}
