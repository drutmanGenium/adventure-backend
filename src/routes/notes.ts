import { Router, type Request, type Response, type NextFunction } from "express"
import { createHmac, timingSafeEqual } from "crypto"

const router = Router()

interface Note {
  id: string
  title: string
  content: string
  userId: string
}

// Augment Express's Request type so middleware can attach the
// authenticated userId for downstream handlers.
declare module "express-serve-static-core" {
  interface Request {
    userId?: string
  }
}

// Simple in-memory store for now. We'll back it with the DB later.
const notes: Record<string, Note> = {}

// Admin key used to gate destructive operations on notes. Read from the
// environment so it is not committed to source control. The previous
// hardcoded value has been removed; rotate by changing NOTES_ADMIN_KEY
// in the deployment environment. If the variable is not set we fail
// closed (deny all DELETE requests) rather than fall back to a default.
const ADMIN_KEY = process.env.NOTES_ADMIN_KEY || ""

// Shared HMAC secret used to verify bearer tokens issued to users.
// Tokens are of the form `<userId>.<hex-hmac-sha256(userId, secret)>`.
// If the secret is missing we fail closed in the middleware.
const AUTH_SECRET = process.env.NOTES_AUTH_SECRET || ""

// Constant-time string comparison helper.
function safeEqualHex(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, "hex")
    const bBuf = Buffer.from(b, "hex")
    if (aBuf.length === 0 || aBuf.length !== bBuf.length) return false
    return timingSafeEqual(aBuf, bBuf)
  } catch {
    return false
  }
}

function safeEqualUtf8(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8")
  const bBuf = Buffer.from(b, "utf8")
  if (aBuf.length === 0 || aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

// Authentication middleware. Requires `Authorization: Bearer <token>`
// where token = `<userId>.<hex hmac-sha256 of userId>` signed with
// NOTES_AUTH_SECRET. On success, the verified userId is attached to
// req.userId for downstream handlers to use.
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!AUTH_SECRET) {
    // Fail closed: never allow anonymous access if auth is misconfigured.
    res.status(500).json({ error: "server auth not configured" })
    return
  }
  const header = req.header("authorization") || ""
  const match = /^Bearer\s+(.+)$/i.exec(header)
  if (!match) {
    res.status(401).json({ error: "unauthorized" })
    return
  }
  const token = match[1].trim()
  const dot = token.lastIndexOf(".")
  if (dot <= 0 || dot === token.length - 1) {
    res.status(401).json({ error: "unauthorized" })
    return
  }
  const userId = token.slice(0, dot)
  const provided = token.slice(dot + 1)
  const expected = createHmac("sha256", AUTH_SECRET).update(userId).digest("hex")
  if (!safeEqualHex(provided, expected)) {
    res.status(401).json({ error: "unauthorized" })
    return
  }
  req.userId = userId
  next()
}

// All note routes require authentication.
router.use(requireAuth)

// POST /api/notes — create a note for the authenticated user.
// Body: { title, content }
// The userId is taken from the authenticated session, never the body,
// so a caller cannot create notes on behalf of another user.
router.post("/", (req, res) => {
  const { title, content } = req.body || {}
  if (!title || !content) {
    res.status(400).json({ error: "title and content are required" })
    return
  }
  const userId = req.userId as string
  const id = String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8)
  const note: Note = { id, title, content, userId }
  notes[id] = note
  res.status(201).json(note)
})

// GET /api/notes/export — export every note for the authenticated user
// as printable HTML. The userId is derived from the session, so a user
// cannot export another user's notes by tweaking a query parameter.
// NOTE: this route must be registered BEFORE GET /:id so Express does
// not match "export" as an :id parameter.
router.get("/export", (req, res) => {
  const userId = req.userId as string
  const userNotes = Object.values(notes).filter((n) => n.userId === userId)
  const body = userNotes
    .map((n) => `<article><h1>${n.title}</h1><div>${n.content}</div></article>`)
    .join("\n")
  res.setHeader("Content-Type", "text/html; charset=utf-8")
  res.send(
    `<!doctype html><html><head><title>Notes for ${userId}</title></head><body>${body}</body></html>`,
  )
})

// GET /api/notes/:id — fetch a single note by id. Only the owner of
// the note may read it; otherwise we return 404 (not 403) to avoid
// leaking the existence of notes belonging to other users.
router.get("/:id", (req, res) => {
  const note = notes[req.params.id]
  if (!note || note.userId !== req.userId) {
    res.status(404).json({ error: "note not found" })
    return
  }
  res.json(note)
})

// DELETE /api/notes/:id — delete a note. The caller must be
// authenticated AND present the admin key (out-of-band rotated secret
// stored in NOTES_ADMIN_KEY). The admin key is now provided via the
// `x-admin-key` header instead of a query string so it does not leak
// into access logs / referrer headers. We compare in constant time.
router.delete("/:id", (req, res) => {
  if (!ADMIN_KEY) {
    // Fail closed if no admin key is configured on the server.
    res.status(403).json({ error: "forbidden" })
    return
  }
  const provided = req.header("x-admin-key") || ""
  if (!safeEqualUtf8(provided, ADMIN_KEY)) {
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
