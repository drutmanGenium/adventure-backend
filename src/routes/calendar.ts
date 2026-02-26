import { Router } from "express"
import { CALENDAR_EVENTS } from "../data/calendar.js"

const router = Router()

// GET /api/calendar
// Query params: ?month=string &year=number &activity=string &difficulty=string
router.get("/", (req, res) => {
  let results = [...CALENDAR_EVENTS]

  const { month, year, activity, difficulty } = req.query

  if (month && month !== "Todos") {
    results = results.filter((e) => e.month === month)
  }

  if (year) {
    const y = Number(year)
    if (!isNaN(y)) {
      results = results.filter((e) => e.year === y)
    }
  }

  if (activity && activity !== "Todas") {
    results = results.filter((e) => e.title === activity)
  }

  if (difficulty) {
    const diffs = String(difficulty).split(",")
    results = results.filter((e) => diffs.includes(e.difficulty))
  }

  // Sort by date
  results.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  res.json({
    count: results.length,
    data: results,
  })
})

export default router
