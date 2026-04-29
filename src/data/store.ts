import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"
import type { Booking, ContactMessage, User } from "../types.js"

// In-memory stores (se reinician al reiniciar el server)
export const bookings: Booking[] = []
export const contactMessages: ContactMessage[] = []
export const users: User[] = []

// Token -> userId mapping for simple auth
export const authTokens: Map<string, string> = new Map()

let bookingCounter = 0
let contactCounter = 0
let userCounter = 0

export function nextBookingId(): string {
  return `BK-${String(++bookingCounter).padStart(4, "0")}`
}

export function nextContactId(): string {
  return `CT-${String(++contactCounter).padStart(4, "0")}`
}

export function nextUserId(): string {
  return `US-${String(++userCounter).padStart(4, "0")}`
}

// Cryptographically secure token generation.
// Uses crypto.randomBytes() instead of Math.random() so tokens are not
// predictable / guessable by attackers.
export function generateToken(): string {
  // 48 random bytes -> 64-char base64url string
  return randomBytes(48).toString("base64url")
}

// ─── Password hashing (scrypt) ───────────────────────────────────────────────
// We use Node's built-in crypto.scrypt — a memory-hard KDF designed for
// password hashing — to avoid storing plaintext passwords. bcrypt/argon2
// would require an additional dependency; scrypt is part of Node core and
// is a widely-accepted secure choice.
const SCRYPT_KEYLEN = 64
const SCRYPT_SALT_LEN = 16

export function hashPassword(password: string): string {
  const salt = randomBytes(SCRYPT_SALT_LEN)
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN)
  // Format: scrypt$<saltHex>$<hashHex>
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$")
  if (parts.length !== 3 || parts[0] !== "scrypt") return false
  const salt = Buffer.from(parts[1], "hex")
  const expected = Buffer.from(parts[2], "hex")
  if (expected.length !== SCRYPT_KEYLEN) return false
  let derived: Buffer
  try {
    derived = scryptSync(password, salt, SCRYPT_KEYLEN)
  } catch {
    return false
  }
  // Constant-time comparison to prevent timing attacks.
  return timingSafeEqual(derived, expected)
}

export function getUserByToken(token: string): User | undefined {
  const userId = authTokens.get(token)
  if (!userId) return undefined
  return users.find((u) => u.id === userId)
}
