import { Router } from "express"
import { z } from "zod"
import { contactMessages, nextContactId } from "../data/store"

const router = Router()

const ContactSchema = z.object({
  name: z.string().min(1, "Nombre es obligatorio"),
  email: z.string().email("Email inválido"),
  phone: z.string().optional().default(""),
  subject: z.string().min(1, "Asunto es obligatorio"),
  message: z.string().min(10, "El mensaje debe tener al menos 10 caracteres"),
})

// POST /api/contact
router.post("/", (req, res) => {
  const parsed = ContactSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({
      error: "Datos inválidos",
      details: parsed.error.flatten().fieldErrors,
    })
    return
  }

  const data = parsed.data

  const message = {
    id: nextContactId(),
    name: data.name,
    email: data.email,
    phone: data.phone,
    subject: data.subject,
    message: data.message,
    createdAt: new Date().toISOString(),
  }

  contactMessages.push(message)

  res.status(201).json({
    message: "Mensaje recibido. Te contactaremos pronto.",
    id: message.id,
  })
})

// GET /api/contact (admin - ver mensajes)
router.get("/", (_req, res) => {
  res.json({
    count: contactMessages.length,
    data: contactMessages,
  })
})

export default router