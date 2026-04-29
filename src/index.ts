import "dotenv/config"
import express from "express"
import cors from "cors"
import activitiesRouter from "./routes/activities"
import calendarRouter from "./routes/calendar"
import bookingsRouter from "./routes/bookings"
import contactRouter from "./routes/contact"
import avatarsRouter from "./routes/avatars"

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }))
app.use(express.json({ limit: "5mb" }))

// Routes
app.use("/api/activities", activitiesRouter)
app.use("/api/calendar", calendarRouter)
app.use("/api/bookings", bookingsRouter)
app.use("/api/contact", contactRouter)
app.use("/api/avatars", avatarsRouter)

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() })
})

// 404
app.use((_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" })
})

app.listen(PORT, () => {
  console.log(`Adventure backend corriendo en http://localhost:${PORT}`)
  console.log(`Endpoints disponibles:`)
  console.log(`  GET  /api/health`)
  console.log(`  GET  /api/activities`)
  console.log(`  GET  /api/activities/:id`)
  console.log(`  GET  /api/calendar`)
  console.log(`  POST /api/bookings`)
  console.log(`  GET  /api/bookings`)
  console.log(`  GET  /api/bookings/:id`)
  console.log(`  POST /api/contact`)
  console.log(`  GET  /api/contact`)
  console.log(`  POST /api/avatars`)
  console.log(`  GET  /api/avatars`)
  console.log(`  GET  /api/avatars/:id`)
  console.log(`  PUT  /api/avatars/:id`)
  console.log(`  GET  /api/avatars/:id/image`)
  console.log(`  DELETE /api/avatars/:id`)
})

export default app