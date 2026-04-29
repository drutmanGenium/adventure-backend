import type { Booking, ContactMessage, User, Session } from "../types.js"
import crypto from "crypto"

// In-memory stores (se reinician al reiniciar el server)
export const bookings: Booking[] = []
export const contactMessages: ContactMessage[] = []
export const users: User[] = []
export const sessions: Session[] = []

let bookingCounter = 0
let contactCounter = 0
let userCounter = 0

// Session lifetime: 7 days. Tokens older than this are considered expired
// and will be rejected/purged on access.
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

// Password hashing parameters (scrypt is built-in to Node.js crypto, so
// no extra dependencies are required). N=2^15 keeps it relatively fast on
// commodity hardware while still being many orders of magnitude slower
// than a plain SHA-256 hash.
const SCRYPT_KEYLEN = 64
const SCRYPT_SALT_BYTES = 16
const SCRYPT_COST = 1 << 15 // N
const SCRYPT_BLOCK_SIZE = 8 // r
const SCRYPT_PARALLELIZATION = 1 // p
// maxmem must be large enough to fit 128 * N * r bytes (~32MB at N=2^15, r=8).
const SCRYPT_MAXMEM = 64 * 1024 * 1024

export function nextBookingId(): string {
  return `BK-${String(++bookingCounter).padStart(4, "0")}`
}

export function nextContactId(): string {
  return `CT-${String(++contactCounter).padStart(4, "0")}`
}

export function nextUserId(): string {
  return `US-${String(++userCounter).padStart(4, "0")}`
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

// Hash a password with scrypt + a per-password random salt. The returned
// string encodes the algorithm parameters, salt, and hash so that future
// changes to the parameters can be applied without breaking existing
// stored hashes.
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SCRYPT_SALT_BYTES)
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: SCRYPT_MAXMEM,
  })
  return `scrypt$${SCRYPT_COST}$${SCRYPT_BLOCK_SIZE}$${SCRYPT_PARALLELIZATION}$${salt.toString("hex")}$${hash.toString("hex")}`
}

// Verify a candidate password against a stored hash. Uses a constant-time
// comparison to avoid leaking information through timing differences.
export function verifyPassword(password: string, stored: string): boolean {
  if (typeof stored !== "string") return false
  const parts = stored.split("$")
  if (parts.length !== 6 || parts[0] !== "scrypt") return false
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts
  const N = Number(nStr)
  const r = Number(rStr)
  const p = Number(pStr)
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false
  }
  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(saltHex, "hex")
    expected = Buffer.from(hashHex, "hex")
  } catch {
    return false
  }
  if (salt.length === 0 || expected.length === 0) return false
  const candidate = crypto.scryptSync(password, salt, expected.length, {
    N,
    r,
    p,
    maxmem: SCRYPT_MAXMEM,
  })
  if (candidate.length !== expected.length) return false
  return crypto.timingSafeEqual(candidate, expected)
}

// Remove sessions whose expiresAt has passed. Called opportunistically on
// every session lookup so expired tokens cannot be used and don't grow
// the in-memory store unboundedly.
export function purgeExpiredSessions(now: number = Date.now()): void {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const expiresAt = Date.parse(sessions[i].expiresAt)
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      sessions.splice(i, 1)
    }
  }
}

export function findSessionByToken(token: string): Session | undefined {
  purgeExpiredSessions()
  return sessions.find((s) => s.token === token)
}

export function findUserById(id: string): User | undefined {
  return users.find((u) => u.id === id)
}

export function findUserByEmail(email: string): User | undefined {
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase())
}
