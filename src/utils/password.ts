import { randomBytes, scryptSync, timingSafeEqual } from "crypto"

// ─── Password hashing ────────────────────────────────────────────────────────
//
// NOTE: The original recommendation was to use bcrypt. Adding a new runtime
// dependency is out of scope for this fix, so we use Node's built-in
// `crypto.scrypt` instead. scrypt is OWASP-approved for password storage,
// is memory-hard, salted, and intentionally slow — providing security
// equivalent to bcrypt for this purpose. If bcrypt becomes available as a
// dependency later, `hashPassword` / `verifyPassword` can be swapped without
// touching call sites.

const SALT_LENGTH = 16
const KEY_LENGTH = 64
// scryptSync uses libuv defaults; N=16384 (2^14) which matches Node's default
// cost and is in line with current OWASP guidance for interactive logins.

const SCHEME = "scrypt"

/**
 * Hash a password with a random salt.
 *
 * Returns a self-describing string of the form
 *   `scrypt$<salt-hex>$<hash-hex>`
 * so the verifier can recover the salt without an external schema.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH)
  const derived = scryptSync(password, salt, KEY_LENGTH)
  return `${SCHEME}$${salt.toString("hex")}$${derived.toString("hex")}`
}

/**
 * Constant-time verification of a password against a stored hash produced
 * by `hashPassword`. Returns false for any malformed input rather than
 * throwing, so callers can treat all failures as "invalid credentials".
 */
export function verifyPassword(password: string, stored: string): boolean {
  if (typeof stored !== "string") return false

  const parts = stored.split("$")
  if (parts.length !== 3 || parts[0] !== SCHEME) {
    return false
  }

  let saltBuf: Buffer
  let expectedBuf: Buffer
  try {
    saltBuf = Buffer.from(parts[1], "hex")
    expectedBuf = Buffer.from(parts[2], "hex")
  } catch {
    return false
  }

  if (saltBuf.length === 0 || expectedBuf.length === 0) {
    return false
  }

  const derived = scryptSync(password, saltBuf, expectedBuf.length)
  if (derived.length !== expectedBuf.length) {
    return false
  }
  return timingSafeEqual(derived, expectedBuf)
}
