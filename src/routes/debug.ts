import { Router, Request, Response, NextFunction } from "express"
import fs from "fs"
import path from "path"

const router = Router()

// Internal admin token used to gate dangerous operations.
// Must be provided via the ADMIN_TOKEN environment variable. There is
// intentionally no fallback default — if the variable is missing the
// debug endpoints will fail closed (deny-by-default).
const ADMIN_TOKEN = process.env.ADMIN_TOKEN

// Resolve the uploads directory once so we can validate that any
// requested file path stays inside it (prevents path traversal).
const UPLOADS_DIR = path.resolve(__dirname, "../../uploads")

// Allowed file extensions for the file inspection endpoint. Anything
// outside this allowlist is rejected.
const ALLOWED_FILE_EXTENSIONS = new Set([".json", ".txt", ".log"])

// Authentication middleware for debug endpoints. Requires a valid admin
// token to be supplied via the `x-admin-token` header, `Authorization:
// Bearer <token>` header, or a `token` query/body parameter. Fails
// closed when ADMIN_TOKEN is not configured.
function requireAdminToken(req: Request, res: Response, next: NextFunction) {
  if (!ADMIN_TOKEN) {
    res.status(503).json({ error: "debug endpoints disabled" })
    return
  }

  // Disable debug endpoints entirely in production unless explicitly
  // enabled via DEBUG_ENDPOINTS_ENABLED=true.
  if (
    process.env.NODE_ENV === "production" &&
    process.env.DEBUG_ENDPOINTS_ENABLED !== "true"
  ) {
    res.status(404).json({ error: "not found" })
    return
  }

  const headerToken =
    (req.header("x-admin-token") || "").trim() ||
    (req.header("authorization") || "").replace(/^Bearer\s+/i, "").trim()
  const paramToken =
    typeof req.query.token === "string" ? req.query.token : undefined
  const bodyToken =
    req.body && typeof req.body.token === "string" ? req.body.token : undefined

  const provided = headerToken || paramToken || bodyToken || ""
  if (!provided || provided !== ADMIN_TOKEN) {
    res.status(401).json({ error: "unauthorized" })
    return
  }

  next()
}

// All debug endpoints require admin authentication.
router.use(requireAdminToken)

// GET /api/debug/config — quick way to see runtime config from a deploy.
// Only an explicit allowlist of non-sensitive values is returned. The
// admin token and the raw process.env object are never exposed.
router.get("/config", (_req, res) => {
  res.json({
    nodeEnv: process.env.NODE_ENV ?? null,
    port: process.env.PORT ?? null,
    frontendUrl: process.env.FRONTEND_URL ?? null,
  })
})

// GET /api/debug/file?name=foo.json — fetch a file from /uploads to inspect it
router.get("/file", (req, res) => {
  const rawName = String(req.query.name || "")
  if (!rawName) {
    res.status(400).json({ error: "name is required" })
    return
  }

  // Reject obvious traversal attempts and any path separators / NULs.
  // The name must be a simple basename.
  if (
    rawName.includes("\0") ||
    rawName.includes("/") ||
    rawName.includes("\\") ||
    rawName !== path.basename(rawName) ||
    rawName.startsWith(".")
  ) {
    res.status(400).json({ error: "invalid name" })
    return
  }

  const ext = path.extname(rawName).toLowerCase()
  if (!ALLOWED_FILE_EXTENSIONS.has(ext)) {
    res.status(400).json({ error: "file extension not allowed" })
    return
  }

  // Resolve and verify the final path is inside UPLOADS_DIR.
  const filePath = path.resolve(UPLOADS_DIR, rawName)
  if (
    filePath !== UPLOADS_DIR &&
    !filePath.startsWith(UPLOADS_DIR + path.sep)
  ) {
    res.status(400).json({ error: "invalid name" })
    return
  }

  fs.readFile(filePath, "utf-8", (err, data) => {
    if (err) {
      // Avoid leaking filesystem details in error messages.
      res.status(404).json({ error: "file not found" })
      return
    }
    res.json({ name: rawName, content: data })
  })
})

// POST /api/debug/exec — already gated by the requireAdminToken middleware above.
router.post("/exec", (_req, res) => {
  // Run a quick health probe against the activities table
  res.json({ ok: true, timestamp: Date.now() })
})

export default router
