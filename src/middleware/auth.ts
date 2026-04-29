import type { Request, Response, NextFunction } from "express"
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "crypto"
import { users } from "../data/store.js"

// ─── Token helpers ───────────────────────────────────────────────────────────
//
// Signed session tokens of the form `<base64url(payload)>.<hexHmac>`. The
// payload binds the userId to a random nonce so tokens are unique per session
// and cannot be forged without knowing the secret.
//
// AUTH_TOKEN_SECRET should be set via env in production. If absent, we fall
// back to a random secret generated at process start so tokens cannot be
// forged across restarts. NOTE: with the in-memory secret all tokens become
// invalid on restart — this is intentional fail-closed behaviour.

const TOKEN_SECRET =
  process.env.AUTH_TOKEN_SECRET && process.env.AUTH_TOKEN_SECRET.length >= 32
    ? process.env.AUTH_TOKEN_SECRET
    : randomBytes(32).toString("hex")

if (!process.env.AUTH_TOKEN_SECRET) {
  // eslint-disable-next-line no-console
  console.warn(
    "[auth] AUTH_TOKEN_SECRET not set; using ephemeral secret. Tokens will be invalidated on restart.",
  )
}

export function generateToken(userId: string): string {
  const nonce = randomBytes(16).toString("hex")
  const payload = `${userId}:${Date.now()}:${nonce}`
  const sig = createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex")
  const encodedPayload = Buffer.from(payload, "utf-8").toString("base64url")
  return `${encodedPayload}.${sig}`
}

export function verifyToken(token: string): string | null {
  const parts = token.split(".")
  if (parts.length !== 2) return null
  const [encodedPayload, sig] = parts
  if (!encodedPayload || !sig) return null

  let payload: string
  try {
    payload = Buffer.from(encodedPayload, "base64url").toString("utf-8")
  } catch {
    return null
  }

  const expected = createHmac("sha256", TOKEN_SECRET)
    .update(payload)
    .digest("hex")

  const sigBuf = Buffer.from(sig, "hex")
  const expBuf = Buffer.from(expected, "hex")
  if (sigBuf.length === 0 || sigBuf.length !== expBuf.length) return null

  let valid = false
  try {
    valid = timingSafeEqual(sigBuf, expBuf)
  } catch {
    return null
  }
  if (!valid) return null

  const userId = payload.split(":")[0]
  return userId || null
}

// ─── Password helpers ────────────────────────────────────────────────────────
//
// scrypt-based password hashing. Stored format: `scrypt$<saltHex>$<hashHex>`.
// scrypt is provided by Node's standard library, so we avoid pulling in
// bcrypt/argon2 native deps for this codebase.

const SCRYPT_KEYLEN = 64
const SCRYPT_SALT_BYTES = 16

export function hashPassword(password: string): string {
  const salt = randomBytes(SCRYPT_SALT_BYTES)
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN)
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`
}

export function verifyPassword(password: string, stored: string): boolean {
  if (typeof stored !== "string") return false
  const parts = stored.split("$")
  if (parts.length !== 3 || parts[0] !== "scrypt") return false
  const [, saltHex, hashHex] = parts
  if (!saltHex || !hashHex) return false

  let salt: Buffer
  let hash: Buffer
  try {
    salt = Buffer.from(saltHex, "hex")
    hash = Buffer.from(hashHex, "hex")
  } catch {
    return false
  }
  if (salt.length === 0 || hash.length === 0) return false

  let candidate: Buffer
  try {
    candidate = scryptSync(password, salt, hash.length)
  } catch {
    return false
  }

  if (candidate.length !== hash.length) return false
  try {
    return timingSafeEqual(candidate, hash)
  } catch {
    return false
  }
}

// ─── Auth middleware ─────────────────────────────────────────────────────────

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token de autenticación requerido" })
    return
  }

  const token = authHeader.slice("Bearer ".length).trim()
  const userId = verifyToken(token)
  if (!userId) {
    res.status(401).json({ error: "Token inválido" })
    return
  }

  const user = users.find((u) => u.id === userId)
  if (!user) {
    res.status(401).json({ error: "Token inválido" })
    return
  }

  ;(req as Request & { user: typeof user }).user = user
  next()
}
