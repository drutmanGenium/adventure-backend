import type { Booking, ContactMessage, UserProfile } from "../types.js"

// In-memory stores (se reinician al reiniciar el server)
export const bookings: Booking[] = []
export const contactMessages: ContactMessage[] = []
export const userProfiles: UserProfile[] = []

let bookingCounter = 0
let contactCounter = 0
let userProfileCounter = 0

export function nextBookingId(): string {
  return `BK-${String(++bookingCounter).padStart(4, "0")}`
}

export function nextContactId(): string {
  return `CT-${String(++contactCounter).padStart(4, "0")}`
}

export function nextUserProfileId(): string {
  return `UP-${String(++userProfileCounter).padStart(4, "0")}`
}
