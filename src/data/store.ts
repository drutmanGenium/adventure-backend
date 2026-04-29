import type { Booking, ContactMessage, User } from "../types.js"

// In-memory stores (se reinician al reiniciar el server)
export const bookings: Booking[] = []
export const contactMessages: ContactMessage[] = []

let bookingCounter = 0
let contactCounter = 0

export function nextBookingId(): string {
  return `BK-${String(++bookingCounter).padStart(4, "0")}`
}

export function nextContactId(): string {
  return `CT-${String(++contactCounter).padStart(4, "0")}`
}

export const users: User[] = []

let userCounter = 0

export function nextUserId(): string {
  return `US-${String(++userCounter).padStart(4, "0")}`
}
