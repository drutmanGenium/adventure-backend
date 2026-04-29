import { Router } from "express"
import { authMiddleware } from "../middleware/auth.js"
import type { Request } from "express"
import type { User } from "../types.js"
import { randomUUID } from "crypto"
import path from "path"
import fs from "fs"

const router = Router()

const UPLOADS_DIR = path.join(process.cwd(), "uploads", "avatars")

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
}

// POST /api/upload/avatar
// Accepts base64 encoded image in JSON body
router.post("/avatar", authMiddleware, (req, res) => {
  const user = (req as Request & { user: User }).user

  const { image, mimeType } = req.body as { image?: string; mimeType?: string }

  if (!image || !mimeType) {
    res.status(400).json({ error: "image (base64) y mimeType son obligatorios" })
    return
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"]
  if (!allowedTypes.includes(mimeType)) {
    res.status(400).json({ error: "Tipo de imagen no permitido. Usa JPEG, PNG, WebP o GIF" })
    return
  }

  const ext = mimeType.split("/")[1] === "jpeg" ? "jpg" : mimeType.split("/")[1]
  const filename = `${user.id}-${randomUUID()}.${ext}`

  try {
    const buffer = Buffer.from(image, "base64")

    // Limit file size to 2MB
    if (buffer.length > 2 * 1024 * 1024) {
      res.status(400).json({ error: "La imagen no debe superar los 2MB" })
      return
    }

    // Remove old avatar file if exists
    if (user.avatarUrl) {
      const oldFilename = user.avatarUrl.split("/").pop()
      if (oldFilename) {
        const oldPath = path.join(UPLOADS_DIR, oldFilename)
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath)
        }
      }
    }

    fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer)

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
