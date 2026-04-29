import type { Booking, ContactMessage, User, Session } from "../types.js"

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

export function findUserByEmail(email: string): User | undefined {
  return users.find((u) => u.email === email.toLowerCase())
}

export function findSessionByToken(token: string): Session | undefined {
  const session = sessions.find((s) => s.token === token)
  if (!session) return undefined
  if (new Date(session.expiresAt) < new Date()) {
    // Sesión expirada – limpiar
    const idx = sessions.indexOf(session)
    sessions.splice(idx, 1)
    return undefined
  }
  return session
}

export function findUserById(id: string): User | undefined {
  return users.find((u) => u.id === id)
}

export function removeSession(token: string): void {
  const idx = sessions.findIndex((s) => s.token === token)
  if (idx !== -1) sessions.splice(idx, 1)
}
