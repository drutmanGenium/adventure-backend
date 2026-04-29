import type { Booking, ContactMessage, User, Session } from "../types.js"

// In-memory stores (se reinician al reiniciar el server)
export const bookings: Booking[] = []
export const contactMessages: ContactMessage[] = []
export const users: User[] = []
export const sessions: Map<string, Session> = new Map()

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
