import { Router } from "express"
import { authMiddleware } from "../middleware/auth.js"
import type { Request } from "express"
import type { User } from "../types.js"
import { randomUUID } from "crypto"
import path from "path"
import fs from "fs"

const router = Router()

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads", "avatars")

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
}

// Strict allowlist mapping — extensions are NEVER derived from user input.
// Adding a MIME type requires adding both sides of this map intentionally.
const ALLOWED_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}

// Filenames we generate match this strict pattern. Used to validate any path
// derived from a stored avatarUrl before we touch the filesystem.
const SAFE_FILENAME_RE = /^[A-Za-z0-9._-]+$/

function isFilenameWithinUploadsDir(filename: string): boolean {
  if (!filename || filename === "." || filename === "..") return false
  if (!SAFE_FILENAME_RE.test(filename)) return false
  // Reject anything that path.basename would strip — this also catches "/", "\", "..".
  if (path.basename(filename) !== filename) return false
  const resolved = path.resolve(UPLOADS_DIR, filename)
  // Defence-in-depth: ensure the resolved path is *strictly* inside UPLOADS_DIR.
  return (
    resolved !== UPLOADS_DIR &&
    resolved.startsWith(UPLOADS_DIR + path.sep)
  )
}

// POST /api/upload/avatar
// Accepts base64 encoded image in JSON body
router.post("/avatar", authMiddleware, (req, res) => {
  const user = (req as Request & { user: User }).user

  const { image, mimeType } = req.body as { image?: string; mimeType?: string }

  if (!image || !mimeType || typeof image !== "string" || typeof mimeType !== "string") {
    res.status(400).json({ error: "image (base64) y mimeType son obligatorios" })
    return
  }

  const ext = ALLOWED_MIME_EXT[mimeType]
  if (!ext) {
    res.status(400).json({ error: "Tipo de imagen no permitido. Usa JPEG, PNG, WebP o GIF" })
    return
  }

  // Filename is built entirely from server-controlled values: the user's id
  // (which is server-generated, e.g. "US-0001") and a random UUID. The
  // extension comes from the allowlist above, never from the request.
  const filename = `${user.id}-${randomUUID()}.${ext}`

  try {
    const buffer = Buffer.from(image, "base64")

    // Limit file size to 2MB
    if (buffer.length > 2 * 1024 * 1024) {
      res.status(400).json({ error: "La imagen no debe superar los 2MB" })
      return
    }

    // Remove old avatar file if exists. The avatarUrl is user-controllable
    // (set via PUT /api/auth/avatar), so we MUST treat the embedded filename
    // as untrusted input and reject anything that escapes UPLOADS_DIR.
    if (user.avatarUrl) {
      const rawName = user.avatarUrl.split("/").pop() ?? ""
      const candidate = path.basename(rawName)
      if (isFilenameWithinUploadsDir(candidate)) {
        const oldPath = path.resolve(UPLOADS_DIR, candidate)
        if (
          oldPath.startsWith(UPLOADS_DIR + path.sep) &&
          fs.existsSync(oldPath)
        ) {
          fs.unlinkSync(oldPath)
        }
      }
    }

    const targetPath = path.resolve(UPLOADS_DIR, filename)
    if (!targetPath.startsWith(UPLOADS_DIR + path.sep)) {
      // Should be impossible since `filename` is built from server-controlled
      // values, but fail closed if anything ever changes upstream.
      res.status(500).json({ error: "Error al procesar la imagen" })
      return
    }
    fs.writeFileSync(targetPath, buffer)

    const avatarUrl = `/uploads/avatars/${filename}`
    user.avatarUrl = avatarUrl

    res.json({
      message: "Avatar subido exitosamente",
      avatarUrl,
    })
  } catch {
    res.status(500).json({ error: "Error al procesar la imagen" })
  }
})

export default router
