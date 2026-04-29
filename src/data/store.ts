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

export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex")
}

export function findSessionByToken(token: string): Session | undefined {
  return sessions.find((s) => s.token === token)
}

export function findUserById(id: string): User | undefined {
  return users.find((u) => u.id === id)
}

export function findUserByEmail(email: string): User | undefined {
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase())
}
