# Adventure Backend

Express.js REST API backend for an adventure tourism website based in Ushuaia, Tierra del Fuego. Provides endpoints for activities, bookings, calendar events, contact messages, user authentication, and avatar management.

## Tech Stack

- **Runtime**: Node.js with TypeScript (ES2022 target, NodeNext modules)
- **Framework**: Express 4.21
- **Validation**: Zod 3.25
- **Dev Server**: tsx (watch mode)
- **Build**: TypeScript compiler (`npx tsc`)
- **Storage**: In-memory arrays (no database; data resets on server restart)

## Project Structure

```
src/
  index.ts              # Express app setup, middleware, route mounting
  types.ts              # Shared TypeScript interfaces
  data/
    activities.ts       # Static activity catalog (ACTIVITIES array)
    calendar.ts         # Static calendar events (CALENDAR_EVENTS array)
    trekkings.ts        # Trekking detail records (TREKKING_DETAILS map)
    store.ts            # In-memory stores and ID generators
  middleware/
    auth.ts             # Token-based authentication middleware
  routes/
    activities.ts       # GET /api/activities, GET /api/activities/:id
    bookings.ts         # POST /api/bookings, GET /api/bookings, GET /api/bookings/:id
    calendar.ts         # GET /api/calendar
    contact.ts          # POST /api/contact, GET /api/contact
    auth.ts             # POST /api/auth/register, POST /api/auth/login, GET /api/auth/me, PUT /api/auth/avatar, DELETE /api/auth/avatar
    upload.ts           # POST /api/upload/avatar
uploads/
  avatars/              # Uploaded avatar images (created at runtime)
```

## Running the Server

```bash
# Development with hot reload
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

The server runs on `PORT` from environment (default `3001`). CORS is configured to allow requests from `FRONTEND_URL` (default `http://localhost:3000`).

## Environment Variables

| Variable       | Default                 | Description                    |
|----------------|-------------------------|--------------------------------|
| `PORT`         | `3001`                  | Server listen port             |
| `FRONTEND_URL` | `http://localhost:3000`  | Allowed CORS origin            |

## Core Types

All shared interfaces are defined in `src/types.ts`:

```typescript
export type Difficulty = "Facil" | "Moderado" | "Avanzado"

export interface Activity {
  id: string
  title: string
  cover_image: string
  price_from: number
  currency: string
  difficulty: Difficulty
  duration: string
  category: string
  availability_dates: string[]
  capacity_remaining: number
  rating?: number
  reviews_count?: number
  popular?: boolean
  location: string
  calendarioSlug?: string
  galleryImages?: { src: string; alt: string }[]
}

export interface TrekkingDetail {
  title: string
  location: string
  difficulty: string
  image: string
  duration: string
  groupSize: string
  price: string
  type: "Trekking" | "Campamento" | "Montanismo"
  description: string
  longDescription: string
  itinerary: { day: string; title: string; description: string }[]
  included: string[]
  notIncluded: string[]
  requirements: string[]
  dates: string[]
}

export interface Booking {
  id: string
  activityId: string
  activityTitle: string
  date: string
  firstName: string
  lastName: string
  email: string
  phone: string
  pickupAddress: string
  city: string
  references: string
  isHotel: boolean
  hotelName: string
  guests: number
  total: number
  currency: string
  status: "confirmed" | "pending"
  createdAt: string
}

export interface ContactMessage {
  id: string
  name: string
  email: string
  phone: string
  subject: string
  message: string
  createdAt: string
}

export interface User {
  id: string
  firstName: string
  lastName: string
  email: string
  password: string
  avatarUrl: string | null
  createdAt: string
}
```

## In-Memory Data Store

`src/data/store.ts` manages runtime state with auto-incrementing ID generators:

```typescript
import type { Booking, ContactMessage, User } from "../types.js"

export const bookings: Booking[] = []
export const contactMessages: ContactMessage[] = []
export const users: User[] = []

export function nextBookingId(): string {
  return `BK-${String(++bookingCounter).padStart(4, "0")}`
}

export function nextContactId(): string {
  return `CT-${String(++contactCounter).padStart(4, "0")}`
}

export function nextUserId(): string {
  return `US-${String(++userCounter).padStart(4, "0")}`
}
```

ID format patterns: `BK-0001`, `CT-0001`, `US-0001`.

Static data lives in `src/data/activities.ts`, `src/data/calendar.ts`, and `src/data/trekkings.ts`. These are hardcoded arrays/maps exported as constants (`ACTIVITIES`, `CALENDAR_EVENTS`, `TREKKING_DETAILS`).

## API Endpoints

### Health Check

```
GET /api/health
Response: { status: "ok", timestamp: "2026-04-29T..." }
```

### Activities

```
GET /api/activities
  Query params: ?category=string&difficulty=string&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&guests=number&popular=true
  Response: { count: number, data: Activity[] }

GET /api/activities/:id
  Response: { activity: Activity | null, detail: TrekkingDetail | null }
  Error 404: { error: "Actividad no encontrada" }
```

The activities endpoint returns both the activity card data and the detailed trekking information when available.

### Calendar

```
GET /api/calendar
  Query params: ?month=string&year=number&activity=string&difficulty=string
  Response: { count: number, data: CalendarEvent[] }
```

Results are sorted by date ascending. The `difficulty` param accepts comma-separated values.

### Bookings

```
POST /api/bookings
  Body (validated with Zod):
    activityId: string (required)
    date: string YYYY-MM-DD (required)
    firstName, lastName, email, phone: string (required)
    pickupAddress, city: string (required)
    references: string (optional)
    isHotel: boolean (default false)
    hotelName: string (required if isHotel)
    guests: number >= 1 (required)
  Response 201: { message, booking: { id, status, activityTitle, date, guests, total, currency, createdAt } }
  Validates: activity exists, date is available, capacity sufficient

GET /api/bookings
  Response: { count: number, data: Booking[] }

GET /api/bookings/:id
  Response: Booking
  Error 404: { error: "Reserva no encontrada" }
```

Creating a booking decreases `capacity_remaining` on the activity.

### Contact

```
POST /api/contact
  Body (validated with Zod):
    name: string (required)
    email: string (required)
    phone: string (optional)
    subject: string (required)
    message: string min 10 chars (required)
  Response 201: { message, id }

GET /api/contact
  Response: { count: number, data: ContactMessage[] }
```

### Authentication

Token-based authentication using base64-encoded user IDs. In production, this should be replaced with JWT.

```
POST /api/auth/register
  Body (validated with Zod):
    firstName: string (required)
    lastName: string (required)
    email: string (required, unique)
    password: string min 6 chars (required)
  Response 201: { message, token, user }
  Error 409: { error: "El email ya esta registrado" }

POST /api/auth/login
  Body (validated with Zod):
    email: string (required)
    password: string (required)
  Response: { message, token, user }
  Error 401: { error: "Email o contrasena incorrectos" }

GET /api/auth/me          [requires auth]
  Response: { user }

PUT /api/auth/avatar      [requires auth]
  Body: { avatarUrl: string }
  Response: { message, user }

DELETE /api/auth/avatar    [requires auth]
  Response: { message, user }
```

The `user` object returned by auth endpoints is sanitized (password excluded):

```typescript
function sanitizeUser(user: User) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  }
}
```

Token generation (development only):

```typescript
function generateToken(userId: string): string {
  return Buffer.from(userId).toString("base64")
}
```

### Avatar Upload

```
POST /api/upload/avatar    [requires auth]
  Body (JSON):
    image: string (base64-encoded image data)
    mimeType: string (one of: image/jpeg, image/png, image/webp, image/gif)
  Response: { message, avatarUrl }
  Constraints:
    - Max file size: 2MB (after base64 decode)
    - Allowed types: JPEG, PNG, WebP, GIF
    - Old avatar file is deleted when uploading a new one
```

Uploaded avatars are saved to `uploads/avatars/` with the naming pattern `{userId}-{uuid}.{ext}` and served as static files at `/uploads/avatars/{filename}`.

The JSON body limit is set to 5MB on the Express app to accommodate base64-encoded images:

```typescript
app.use(express.json({ limit: "5mb" }))
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")))
```

## Authentication Middleware

`src/middleware/auth.ts` extracts and validates Bearer tokens from the `Authorization` header:

```typescript
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token de autenticacion requerido" })
    return
  }

  const token = authHeader.split(" ")[1]
  try {
    const userId = Buffer.from(token, "base64").toString("utf-8")
    const user = users.find((u) => u.id === userId)
    if (!user) {
      res.status(401).json({ error: "Token invalido" })
      return
    }
    ;(req as Request & { user: typeof user }).user = user
    next()
  } catch {
    res.status(401).json({ error: "Token invalido" })
  }
}
```

Protected routes access the authenticated user via type assertion:

```typescript
const user = (req as Request & { user: User }).user
```

## Validation Pattern

All POST/PUT endpoints use Zod schemas for input validation. The pattern is consistent:

```typescript
const parsed = SomeSchema.safeParse(req.body)
if (!parsed.success) {
  res.status(400).json({
    error: "Datos invalidos",
    details: parsed.error.flatten().fieldErrors,
  })
  return
}
const data = parsed.data
```

## Static Data

The backend ships with hardcoded data for the adventure catalog:

- **8 activities** in `ACTIVITIES` array (Laguna Esmeralda variants, Glaciar Vinciguerra, Ojo del Albino, Campamento Vinciguerra, Parque Nacional, Canal Beagle, City Tour)
- **8 trekking details** in `TREKKING_DETAILS` record, keyed by activity slug
- **34 calendar events** spanning November 2026 through February 2027

Activities include categories: Laguna Esmeralda, Trekking, Parque Nacional, Navegacion / Canal Beagle, City tour.

## Important Notes

- All data is in-memory and resets when the server restarts
- Passwords are stored in plain text (development only; use bcrypt in production)
- Authentication tokens are base64-encoded user IDs (use JWT in production)
- The `uploads/avatars/` directory is created automatically at startup if missing
- Error responses are in Spanish to match the frontend locale
- The `.gitignore` excludes `node_modules`, `dist`, and `.env`
