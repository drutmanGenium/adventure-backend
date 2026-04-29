# SUNDAYS.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

- **Package name:** `adventure-backend`
- **Version:** 1.0.0
- **Description:** Mini backend para adventure-website (Ushuaia trekking) -- a REST API serving activity listings, calendar events, bookings, contact messages, and user profile avatars for an adventure tourism company based in Ushuaia, Tierra del Fuego, Argentina.
- **Runtime:** Node.js with TypeScript (ES2022 target, NodeNext module resolution)
- **Framework:** Express 4.21
- **Validation:** Zod 3.25
- **Data storage:** In-memory arrays (no database; data resets on server restart)
- **Language:** All UI-facing strings and error messages are in Spanish

## Commands

```bash
# Install dependencies
npm install

# Run development server with hot-reload (tsx watch)
npm run dev

# Compile TypeScript to JavaScript (output in dist/)
npm run build

# Start production server from compiled output
npm start
# equivalent to: node dist/index.js
```

There are no test scripts, lint scripts, or CI/CD scripts configured in package.json.

The `.sundaysrc` file configures the deployment runtime:

```json
{
  "runtime": "node",
  "install": "npm install",
  "build": "npm run build",
  "start": "npm start"
}
```

## Architecture

### Directory Structure

```
adventure-backend/
  .gitignore
  .sundaysrc            # Deployment runtime configuration
  package.json
  package-lock.json
  tsconfig.json
  src/
    index.ts            # Express app entry point, middleware, route mounting
    types.ts            # Shared TypeScript interfaces and types
    data/
      activities.ts     # Static activity catalog (8 activities)
      calendar.ts       # Static calendar events (Nov 2026 - Feb 2027)
      store.ts          # In-memory stores for bookings, contacts, and user profiles
      trekkings.ts      # Detailed trekking descriptions (8 trekking details)
    routes/
      activities.ts     # GET /api/activities, GET /api/activities/:id
      avatars.ts        # POST/GET/PUT/DELETE /api/avatars -- user profile avatar management
      bookings.ts       # POST /api/bookings, GET /api/bookings, GET /api/bookings/:id
      calendar.ts       # GET /api/calendar
      contact.ts        # POST /api/contact, GET /api/contact
```

### Key Files

- **`src/index.ts`** -- Express application setup. Configures CORS (origin from `FRONTEND_URL` env var, defaults to `http://localhost:3000`), JSON body parsing with a 5MB limit (to support base64-encoded avatar uploads), route mounting under `/api/*`, a health check endpoint, and a 404 fallback handler. The server listens on `PORT` (default 3001).

- **`src/types.ts`** -- All shared TypeScript interfaces: `Activity`, `TrekkingDetail`, `CalendarEvent`, `Booking`, `ContactMessage`, `UserProfile`, and the `Difficulty` union type.

- **`src/data/store.ts`** -- In-memory runtime store. Exports mutable arrays (`bookings`, `contactMessages`, `userProfiles`) and sequential ID generators (`nextBookingId`, `nextContactId`, `nextUserProfileId`) that produce IDs like `BK-0001`, `CT-0001`, and `UP-0001`.

- **`src/data/activities.ts`** -- Static catalog of 8 adventure activities in Ushuaia. Each entry includes pricing in USD, difficulty level, duration, availability dates, capacity, ratings, and gallery images.

- **`src/data/trekkings.ts`** -- Detailed trekking descriptions keyed by slug. Includes full itineraries, included/not-included lists, requirements, and available dates. Prices are in Argentine pesos.

- **`src/data/calendar.ts`** -- Pre-populated calendar events spanning November 2026 through February 2027 for recurring activities (Laguna Esmeralda, Glaciar Martial, Ojo del Albino, Vinciguerra, Campamento Vinciguerra).

- **`src/routes/bookings.ts`** -- Booking creation with Zod validation, activity existence checks, date availability validation, capacity enforcement, and hotel name requirement when `isHotel` is true. Booking creation decrements `capacity_remaining` on the activity.

- **`src/routes/contact.ts`** -- Contact form submission with Zod validation. Minimum message length of 10 characters.

- **`src/routes/avatars.ts`** -- User profile and avatar management. Supports creating profiles with base64-encoded avatar images, updating avatars, serving avatar images as binary responses with proper MIME types, listing all profiles, and deleting profiles. Uses Zod validation for create and update operations. Avatar images are limited to 2MB and must be one of: `image/jpeg`, `image/png`, `image/webp`, `image/gif`. Creating a profile with an existing email updates the existing profile instead of creating a duplicate.

### Design Patterns

**Static data with in-memory mutation.** Activities are defined as a static array but are mutated at runtime when bookings reduce capacity. User profiles and avatars are stored entirely in memory:

```typescript
// src/data/store.ts
export const bookings: Booking[] = []
export const contactMessages: ContactMessage[] = []
export const userProfiles: UserProfile[] = []

let bookingCounter = 0
let contactCounter = 0
let userProfileCounter = 0

export function nextBookingId(): string {
  return `BK-${String(++bookingCounter).padStart(4, "0")}`
}

export function nextContactId(): string {
  return `CT-${String(++contactCounter).padStart(4, "0")}`
}

export function nextUserProfileId(): string {
  return `UP-${String(++userProfileCounter).padStart(4, "0")}`
}
```

**Zod schemas for request validation.** The booking, contact, and avatar routes define inline Zod schemas and use `safeParse` with structured error responses:

```typescript
// src/routes/bookings.ts
const BookingSchema = z.object({
  activityId: z.string().min(1, "activityId es obligatorio"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
  firstName: z.string().min(1, "Nombre es obligatorio"),
  lastName: z.string().min(1, "Apellido es obligatorio"),
  email: z.string().email("Email inválido"),
  phone: z.string().min(7, "Teléfono inválido (min. 7 digitos)"),
  pickupAddress: z.string().min(1, "Direccion es obligatoria"),
  city: z.string().min(1, "Ciudad es obligatoria"),
  references: z.string().optional().default(""),
  isHotel: z.boolean().default(false),
  hotelName: z.string().optional().default(""),
  guests: z.number().int().min(1, "Minimo 1 persona"),
})
```

```typescript
// src/routes/avatars.ts
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]
const MAX_AVATAR_SIZE = 2 * 1024 * 1024 // 2MB en base64

const CreateProfileSchema = z.object({
  name: z.string().min(1, "Nombre es obligatorio"),
  email: z.string().email("Email inválido"),
  avatarData: z
    .string()
    .min(1, "Datos del avatar son obligatorios")
    .refine(
      (val) => val.length <= MAX_AVATAR_SIZE,
      "El avatar no debe superar 2MB"
    ),
  avatarMimeType: z
    .string()
    .refine(
      (val) => ALLOWED_MIME_TYPES.includes(val),
      `Tipo de imagen inválido. Permitidos: ${ALLOWED_MIME_TYPES.join(", ")}`
    ),
})

const UpdateAvatarSchema = z.object({
  avatarData: z
    .string()
    .min(1, "Datos del avatar son obligatorios")
    .refine(
      (val) => val.length <= MAX_AVATAR_SIZE,
      "El avatar no debe superar 2MB"
    ),
  avatarMimeType: z
    .string()
    .refine(
      (val) => ALLOWED_MIME_TYPES.includes(val),
      `Tipo de imagen inválido. Permitidos: ${ALLOWED_MIME_TYPES.join(", ")}`
    ),
})
```

**Express Router pattern.** Each route domain is defined in its own file using `Router()` and exported as a default, then mounted in `src/index.ts`:

```typescript
// src/index.ts
app.use("/api/activities", activitiesRouter)
app.use("/api/calendar", calendarRouter)
app.use("/api/bookings", bookingsRouter)
app.use("/api/contact", contactRouter)
app.use("/api/avatars", avatarsRouter)
```

**Dual-layer activity data.** Activity listings (`Activity`) and detailed trekking info (`TrekkingDetail`) are stored separately. The `GET /api/activities/:id` endpoint merges both:

```typescript
// src/routes/activities.ts
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
```

**Filtering via query parameters.** List endpoints support flexible filtering without requiring all params:

```typescript
// src/routes/activities.ts - supports category, difficulty, dateFrom, dateTo, guests, popular
if (category && category !== "all" && category !== "Todas") {
  results = results.filter((a) => a.category === category)
}

// src/routes/calendar.ts - supports month, year, activity, difficulty (comma-separated)
if (difficulty) {
  const diffs = String(difficulty).split(",")
  results = results.filter((e) => diffs.includes(e.difficulty))
}
```

**Email-based upsert for avatars.** The `POST /api/avatars` endpoint uses email as a natural key. If a profile with the given email already exists, it updates that profile rather than creating a duplicate:

```typescript
// src/routes/avatars.ts
const existing = userProfiles.find((p) => p.email === data.email)
if (existing) {
  existing.name = data.name
  existing.avatarData = data.avatarData
  existing.avatarMimeType = data.avatarMimeType
  existing.updatedAt = new Date().toISOString()
  // Returns 200 with "Perfil actualizado"
  return
}
// Otherwise creates new profile with 201
```

**Binary image serving from base64.** The avatar image endpoint decodes base64 data and serves it as a binary response with the correct Content-Type and caching headers:

```typescript
// src/routes/avatars.ts
router.get("/:id/image", (req, res) => {
  const profile = userProfiles.find((p) => p.id === req.params.id)
  if (!profile) {
    res.status(404).json({ error: "Avatar no encontrado" })
    return
  }

  const buffer = Buffer.from(profile.avatarData, "base64")
  res.set("Content-Type", profile.avatarMimeType)
  res.set("Cache-Control", "public, max-age=3600")
  res.send(buffer)
})
```

## Data Model

### Activity

```typescript
export interface Activity {
  id: string
  title: string
  cover_image: string
  price_from: number
  currency: string
  difficulty: Difficulty          // "Facil" | "Moderado" | "Avanzado"
  duration: string
  category: string
  availability_dates: string[]
  capacity_remaining: number      // Mutable -- decremented on booking
  rating?: number
  reviews_count?: number
  popular?: boolean
  location: string
  calendarioSlug?: string
  galleryImages?: { src: string; alt: string }[]
}
```

### TrekkingDetail

```typescript
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
```

### Booking

```typescript
export interface Booking {
  id: string                          // Format: BK-0001
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
  total: number                       // Calculated: price_from * guests
  currency: string
  status: "confirmed" | "pending"
  createdAt: string
}
```

### ContactMessage

```typescript
export interface ContactMessage {
  id: string                          // Format: CT-0001
  name: string
  email: string
  phone: string
  subject: string
  message: string
  createdAt: string
}
```

### UserProfile

```typescript
export interface UserProfile {
  id: string                          // Format: UP-0001
  name: string
  email: string                       // Used as natural key for upsert behavior
  avatarData: string                  // base64-encoded image data
  avatarMimeType: string              // e.g. "image/png", "image/jpeg"
  createdAt: string
  updatedAt: string
}
```

## API Endpoints

### Health Check

| Method | Path           | Description                              |
|--------|----------------|------------------------------------------|
| GET    | /api/health    | Returns `{ status: "ok", timestamp }`.   |

### Activities

| Method | Path                 | Description                                              |
|--------|----------------------|----------------------------------------------------------|
| GET    | /api/activities      | List all activities. Returns `{ count, data }`.          |
| GET    | /api/activities/:id  | Get one activity + trekking detail. Returns `{ activity, detail }`. |

**Query parameters for GET /api/activities:**

| Param      | Type   | Description                                       |
|------------|--------|---------------------------------------------------|
| category   | string | Filter by category (ignored if "all" or "Todas")  |
| difficulty | string | Exact match on difficulty level                    |
| dateFrom   | string | ISO date lower bound for availability              |
| dateTo     | string | ISO date upper bound (defaults to dateFrom)        |
| guests     | number | Filter activities with enough remaining capacity   |
| popular    | string | If "true", return only popular activities          |

### Calendar

| Method | Path           | Description                                       |
|--------|----------------|---------------------------------------------------|
| GET    | /api/calendar  | List calendar events. Returns `{ count, data }`.  |

**Query parameters for GET /api/calendar:**

| Param      | Type   | Description                                          |
|------------|--------|------------------------------------------------------|
| month      | string | Spanish month name (e.g. "Noviembre"); "Todos" = all |
| year       | number | Filter by year                                       |
| activity   | string | Filter by event title; "Todas" = all                 |
| difficulty | string | Comma-separated difficulty levels                    |

Results are sorted by date ascending.

### Bookings

| Method | Path               | Description                                     |
|--------|--------------------|-------------------------------------------------|
| POST   | /api/bookings      | Create a booking. Returns confirmation + summary. |
| GET    | /api/bookings      | List all bookings. Returns `{ count, data }`.   |
| GET    | /api/bookings/:id  | Get one booking by ID.                          |

**POST /api/bookings** validates:
1. All required fields via Zod schema
2. Activity exists in the catalog
3. Selected date is in the activity's `availability_dates`
4. `guests` does not exceed `capacity_remaining`
5. `hotelName` is provided when `isHotel` is true

On success, returns HTTP 201 with booking ID, status, total, and creation timestamp.

### Contact

| Method | Path           | Description                                      |
|--------|----------------|--------------------------------------------------|
| POST   | /api/contact   | Submit a contact message. Returns confirmation.  |
| GET    | /api/contact   | List all messages (admin). Returns `{ count, data }`. |

**POST /api/contact** validates name, email, subject (required), phone (optional), and message (min 10 chars).

### Avatars (User Profiles)

| Method | Path                    | Description                                                   |
|--------|-------------------------|---------------------------------------------------------------|
| POST   | /api/avatars            | Create a user profile with avatar. Returns profile summary.   |
| GET    | /api/avatars            | List all profiles (without avatar data). Returns `{ count, data }`. |
| GET    | /api/avatars/:id        | Get one profile by ID (without avatar data).                  |
| PUT    | /api/avatars/:id        | Update avatar image on an existing profile.                   |
| GET    | /api/avatars/:id/image  | Serve the avatar as a binary image with correct Content-Type. |
| DELETE | /api/avatars/:id        | Delete a profile and its avatar.                              |

**POST /api/avatars** validates:
1. `name` (required, min 1 char)
2. `email` (required, valid email format)
3. `avatarData` (required, base64-encoded string, max 2MB)
4. `avatarMimeType` (required, must be one of `image/jpeg`, `image/png`, `image/webp`, `image/gif`)

If a profile with the same email already exists, the endpoint updates it (upsert behavior) and returns HTTP 200 with "Perfil actualizado". Otherwise it creates a new profile and returns HTTP 201 with "Perfil creado con avatar".

**PUT /api/avatars/:id** validates only avatar fields (`avatarData` and `avatarMimeType`) with the same constraints.

**GET /api/avatars/:id/image** decodes the stored base64 data, sets `Content-Type` to the stored MIME type, sets `Cache-Control: public, max-age=3600`, and sends the image as a binary buffer. Profile listing and detail endpoints return an `avatarUrl` field (e.g., `/api/avatars/UP-0001/image`) instead of the raw base64 data.

## Environment Variables

| Variable      | Default                  | Description                            |
|---------------|--------------------------|----------------------------------------|
| PORT          | 3001                     | Port the Express server listens on     |
| FRONTEND_URL  | http://localhost:3000     | Allowed CORS origin for the frontend   |

The `.gitignore` excludes `.env`, so environment variables should be set in a local `.env` file (loaded via `dotenv/config`).

## Important Notes

- **No persistent storage.** All bookings, contact messages, and user profiles (including avatar data) are stored in-memory arrays and are lost when the server restarts. The static activity data (including `capacity_remaining`) is also reset.

- **Capacity mutation is not thread-safe.** When a booking is created, `activity.capacity_remaining` is decremented directly on the imported array object. There is no locking or transaction mechanism.

- **Dual price systems.** Activities in `src/data/activities.ts` have prices in USD (`price_from` as a number), while trekking details in `src/data/trekkings.ts` have prices in Argentine pesos (`price` as a formatted string like "$165.000"). The booking total is calculated from the USD `price_from` value.

- **Spanish-language API.** All error messages, field validation messages, and some response texts are in Spanish (e.g., "Reserva confirmada", "Actividad no encontrada", "Perfil no encontrado", "Ruta no encontrada").

- **No authentication.** All endpoints are publicly accessible, including admin-style listing endpoints for bookings, contact messages, and user profiles.

- **Avatar storage as base64.** Avatar images are stored as base64-encoded strings in the `UserProfile.avatarData` field. The JSON body parser limit is set to 5MB (`express.json({ limit: "5mb" })`) to accommodate avatar upload payloads. Individual avatar images are capped at 2MB (measured as base64 string length). Allowed MIME types are `image/jpeg`, `image/png`, `image/webp`, and `image/gif`.

- **Date format.** Activities use ISO date strings (`YYYY-MM-DD`) in `availability_dates`. Calendar events additionally store `month` as a Spanish month name and `year` as a number. Trekking detail dates use a different format: `"15 Nov 2025"`.

- **ID keys between data layers.** The activity `id` field (e.g., `"laguna-esmeralda-express"`) is used to look up both the `ACTIVITIES` array and the `TREKKING_DETAILS` record. Not all activities have a corresponding trekking detail entry, and vice versa.

- **TypeScript config.** Strict mode is enabled. Output goes to `dist/`. Declaration files are generated (`declaration: true`). The project uses `NodeNext` module resolution, so `.js` extensions appear in some imports from `.ts` files (e.g., `from "../types.js"`).

- **No tests exist.** There are no test files or testing frameworks configured.

- **Development uses tsx.** The `dev` script uses `tsx watch` for hot-reloading TypeScript files without a separate compilation step.
