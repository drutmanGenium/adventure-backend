import { Router } from "express"
import { ACTIVITIES } from "../data/activities.js"
import { TREKKING_DETAILS } from "../data/trekkings.js"

const router = Router()

// GET /api/activities
// Query params: ?category=string &difficulty=string &dateFrom=YYYY-MM-DD &dateTo=YYYY-MM-DD &guests=number &popular=true
router.get("/", (req, res) => {
  let results = [...ACTIVITIES]

  const { category, difficulty, dateFrom, dateTo, guests, popular } = req.query

  if (category && category !== "all" && category !== "Todas") {
    results = results.filter((a) => a.category === category)
  }

  if (difficulty) {
    results = results.filter((a) => a.difficulty === difficulty)
  }

  if (dateFrom) {
    const from = String(dateFrom)
    const to = dateTo ? String(dateTo) : from
    results = results.filter((a) =>
      a.availability_dates.some((d) => d >= from && d <= to)
    )
  }

  if (guests) {
    const g = Number(guests)
    if (!isNaN(g)) {
      results = results.filter((a) => a.capacity_remaining >= g)
    }
  }

  if (popular === "true") {
    results = results.filter((a) => a.popular)
  }

  res.json({
    count: results.length,
    data: results,
  })
})

// GET /api/activities/:id
// Returns both the activity card data and the trekking detail
router.get("/:id", (req, res) => {
  const { id } = req.params

  const activity = ACTIVITIES.find((a) => a.id === id)
  const detail = TREKKING_DETAILS[id]

  if (!activity && !detail) {
    res.status(404).json({ error: "Actividad no encontrada" })
    return
  }

  res.json({
    activity: activity ?? null,
    detail: detail ?? null,
  })
})

export default router
