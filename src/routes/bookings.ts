import { Router } from "express"
import { z } from "zod"
import { ACTIVITIES } from "../data/activities"
import { bookings, nextBookingId } from "../data/store"
import { createRateLimiter, RATE_LIMIT_PRESETS } from "../middleware/rate-limiter"

const router = Router()

// Rate limiting para creación de reservas
const bookingRateLimiter = createRateLimiter(RATE_LIMIT_PRESETS.booking, "bookings-post")

const BookingSchema = z.object({
  activityId: z.string().min(1, "activityId es obligatorio"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
  firstName: z.string().min(1, "Nombre es obligatorio"),
  lastName: z.string().min(1, "Apellido es obligatorio"),
  email: z.string().email("Email inválido"),
  phone: z.string().min(7, "Teléfono inválido (mín. 7 dígitos)"),
  pickupAddress: z.string().min(1, "Dirección es obligatoria"),
  city: z.string().min(1, "Ciudad es obligatoria"),
  references: z.string().optional().default(""),
  isHotel: z.boolean().default(false),
  hotelName: z.string().optional().default(""),
  guests: z.number().int().min(1, "Mínimo 1 persona"),
})

// POST /api/bookings
router.post("/", bookingRateLimiter, (req, res) => {
  const parsed = BookingSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({
      error: "Datos inválidos",
      details: parsed.error.flatten().fieldErrors,
    })
    return
  }

  const data = parsed.data

  // Validate activity exists
  const activity = ACTIVITIES.find((a) => a.id === data.activityId)
  if (!activity) {
    res.status(404).json({ error: "Actividad no encontrada" })
    return
  }

  // Validate date is available
  if (!activity.availability_dates.includes(data.date)) {
    res.status(400).json({ error: "La fecha seleccionada no está disponible para esta actividad" })
    return
  }

  // Validate capacity
  if (data.guests > activity.capacity_remaining) {
    res.status(400).json({
      error: `No hay suficientes lugares. Disponibles: ${activity.capacity_remaining}`,
    })
    return
  }

  // Validate hotel name if isHotel
  if (data.isHotel && !data.hotelName) {
    res.status(400).json({ error: "Nombre del hotel es obligatorio" })
    return
  }

  const total = activity.price_from * data.guests

  const booking = {
    id: nextBookingId(),
    activityId: data.activityId,
    activityTitle: activity.title,
    date: data.date,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    phone: data.phone,
    pickupAddress: data.pickupAddress,
    city: data.city,
    references: data.references,
    isHotel: data.isHotel,
    hotelName: data.hotelName,
    guests: data.guests,
    total,
    currency: activity.currency,
    status: "confirmed" as const,
    createdAt: new Date().toISOString(),
  }

  bookings.push(booking)

  // Decrease capacity
  activity.capacity_remaining -= data.guests

  res.status(201).json({
    message: "Reserva confirmada",
    booking: {
      id: booking.id,
      status: booking.status,
      activityTitle: booking.activityTitle,
      date: booking.date,
      guests: booking.guests,
      total: booking.total,
      currency: booking.currency,
      createdAt: booking.createdAt,
    },
  })
})

// GET /api/bookings
router.get("/", (_req, res) => {
  res.json({
    count: bookings.length,
    data: bookings,
  })
})

// GET /api/bookings/:id
router.get("/:id", (req, res) => {
  const booking = bookings.find((b) => b.id === req.params.id)
  if (!booking) {
    res.status(404).json({ error: "Reserva no encontrada" })
    return
  }
  res.json(booking)
})

export default router