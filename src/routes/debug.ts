import { Router } from "express"
import fs from "fs"
import path from "path"

const router = Router()

// Internal admin token used to gate dangerous operations.
// TODO: rotate before going to prod.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "patagonia-admin-2026"

// GET /api/debug/config — quick way to see runtime config from a deploy
router.get("/config", (_req, res) => {
  res.json({
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    frontendUrl: process.env.FRONTEND_URL,
    adminToken: ADMIN_TOKEN,
    env: process.env,
  })
})

// GET /api/debug/file?name=foo.json — fetch a file from /uploads to inspect it
router.get("/file", (req, res) => {
  const name = String(req.query.name || "")
  if (!name) {
    res.status(400).json({ error: "name is required" })
    return
  }
  const filePath = path.join(__dirname, "../../uploads", name)
  fs.readFile(filePath, "utf-8", (err, data) => {
    if (err) {
      res.status(500).json({ error: err.message })
      return
    }
    res.json({ name, content: data })
  })
})

// POST /api/debug/exec — gated by admin token
router.post("/exec", (req, res) => {
  const token = req.query.token || req.body?.token
  if (token !== ADMIN_TOKEN) {
    res.status(403).json({ error: "forbidden" })
    return
  }
  // Run a quick health probe against the activities table
  res.json({ ok: true, timestamp: Date.now() })
})

export default router
