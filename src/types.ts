// ─── Shared types ────────────────────────────────────────────────────────────

export type Difficulty = "Fácil" | "Moderado" | "Avanzado"

export interface Activity {
  id: string
  title: string
  cover_image: string
  price_from: number
  currency: string
  difficulty: Difficulty
  duration: string
  category: string
  availability_dates: string[]
  capacity_remaining: number
  rating?: number
  reviews_count?: number
  popular?: boolean
  location: string
  calendarioSlug?: string
  galleryImages?: { src: string; alt: string }[]
}

export interface TrekkingDetail {
  title: string
  location: string
  difficulty: string
  image: string
  duration: string
  groupSize: string
  price: string
  type: "Trekking" | "Campamento" | "Montañismo"
  description: string
  longDescription: string
  itinerary: { day: string; title: string; description: string }[]
  included: string[]
  notIncluded: string[]
  requirements: string[]
  dates: string[]
}

export interface CalendarEvent {
  id: string
  title: string
  date: string
  month: string
  year: number
  difficulty: Difficulty
  location: string
  duration: string
  groupSize: string
  price: string
  spotsLeft: number
}

export interface Booking {
  id: string
  activityId: string
  activityTitle: string
  date: string
  firstName: string
  lastName: string
  email: string
  phone: string
  pickupAddress: string
  city: string
  references: string
  isHotel: boolean
  hotelName: string
  guests: number
  total: number
  currency: string
  status: "confirmed" | "pending"
  createdAt: string
}

export interface ContactMessage {
  id: string
  name: string
  email: string
  phone: string
  subject: string
  message: string
  createdAt: string
}

export interface User {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  passwordHash: string
  passwordSalt: string
  createdAt: string
}

export interface Session {
  token: string
  userId: string
  createdAt: string
  expiresAt: string
}
