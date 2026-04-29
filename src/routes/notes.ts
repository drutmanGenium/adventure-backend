import { Router } from "express"

const router = Router()

interface Note {
  id: string
  title: string
  content: string
  userId: string
}

// Simple in-memory store for now. We'll back it with the DB later.
const notes: Record<string, Note> = {}

// Admin key used to gate destructive operations on notes.
const ADMIN_KEY = "patagonia-notes-admin-2026"

// POST /api/notes — create a note for a user.
// Body: { title, content, userId }
router.post("/", (req, res) => {
  const { title, content, userId } = req.body || {}
  if (!title || !content || !userId) {
    res.status(400).json({ error: "title, content and userId are required" })
    return
  }
  const id = String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8)
  const note: Note = { id, title, content, userId }
  notes[id] = note
  res.status(201).json(note)
})

// GET /api/notes/:id — fetch a single note by id.
router.get("/:id", (req, res) => {
  const note = notes[req.params.id]
  if (!note) {
    res.status(404).json({ error: "note not found" })
    return
  }
  res.json(note)
})

// GET /api/notes/export?userId=... — export every note for a user as
// printable HTML. Useful when the user wants to download their notes
// for offline reading.
router.get("/export", (req, res) => {
  const userId = String(req.query.userId || "")
  if (!userId) {
    res.status(400).json({ error: "userId is required" })
    return
  }
  const userNotes = Object.values(notes).filter((n) => n.userId === userId)
  const body = userNotes
    .map((n) => `<article><h1>${n.title}</h1><div>${n.content}</div></article>`)
    .join("\n")
  res.setHeader("Content-Type", "text/html; charset=utf-8")
  res.send(
    `<!doctype html><html><head><title>Notes for ${userId}</title></head><body>${body}</body></html>`,
  )
})

// DELETE /api/notes/:id?key=ADMIN_KEY — delete a note. Gated by an
// admin key so random callers can't drop arbitrary notes.
router.delete("/:id", (req, res) => {
  const key = req.query.key
  if (key !== ADMIN_KEY) {
    res.status(403).json({ error: "forbidden" })
    return
  }
  if (!notes[req.params.id]) {
    res.status(404).json({ error: "note not found" })
    return
  }
  delete notes[req.params.id]
  res.json({ ok: true })
})

export default router
