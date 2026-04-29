# SUNDAYS.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

- **Package name:** adventure-backend
- **Version:** 1.0.0
- **Description:** Mini backend para adventure-website (Ushuaia trekking)
- **Primary language:** TypeScript
- **Runtime:** Node.js (ES2022 target, NodeNext module resolution)
- **Framework:** Express 4.21
- **Validation:** Zod 3.25
- **Purpose:** REST API backend serving activity listings, calendar events, bookings, and contact form submissions for an outdoor adventure tourism website based in Ushuaia, Tierra del Fuego, Argentina.

### Core Dependencies

| Package    | Version  | Purpose                                    |
|------------|----------|--------------------------------------------|
| express    | ^4.21.0  | HTTP server and routing                    |
| cors       | ^2.8.5   | Cross-origin resource sharing middleware   |
| dotenv     | ^17.4.1  | Environment variable loading from .env     |
| zod        | ^3.25.0  | Runtime schema validation for request data |

### Dev Dependencies

| Package         | Version  | Purpose                          |
|-----------------|----------|----------------------------------|
| typescript      | ^5.6.0   | TypeScript compiler              |
| tsx             | ^4.19.0  | TypeScript execution (dev watch) |
| @types/express  | ^5.0.0   | Express type definitions         |
| @types/cors     | ^2.8.17  | CORS type definitions            |
| @types/node     | ^22.0.0  | Node.js type definitions         |

## Commands

```bash
# Install dependencies
npm install

# Start development server with hot reload (tsx watch)
npm run dev

# Compile TypeScript to JavaScript (output to dist/)
npm run build

# Start production server from compiled JS
npm start
```

There is no test script configured. The `.sundaysrc` file defines the deployment pipeline:

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
  .sundaysrc              # Deployment configuration (runtime, install, build, start)
  package.json
  package-lock.json
  tsconfig.json
  src/
    index.ts              # Express app entry point, middleware setup, route mounting
    types.ts              # Shared TypeScript interfaces and types
    data/
      activities.ts       # Static activity catalog (8 activities)
      calendar.ts         # Static calendar events (34 events across Nov 2026 - Feb 2027)
      store.ts            # In-memory runtime stores for bookings and contact messages
      trekkings.ts        # Detailed trekking descriptions (8 trekking detail records)
    middleware/
      rate-limiter.ts     # IP-based rate limiting middleware factory with configurable presets
    routes/
      activities.ts       # GET /api/activities, GET /api/activities/:id
      bookings.ts         # POST /api/bookings (rate-limited), GET /api/bookings, GET /api/bookings/:id
      calendar.ts         # GET /api/calendar
      contact.ts          # POST /api/contact (rate-limited), GET /api/contact
```

### Key Files

- **`src/index.ts`** -- Application entry point. Creates the Express app, sets `trust proxy` to 1 for correct client IP resolution behind reverse proxies, applies CORS and JSON body parsing middleware, mounts all four route modules, defines a health check endpoint, and a 404 catch-all handler. Listens on `PORT` (default 3001).

- **`src/types.ts`** -- Central type definitions shared across the entire application. Defines `Activity`, `TrekkingDetail`, `CalendarEvent`, `Booking`, `ContactMessage`, and the `Difficulty` union type.

- **`src/middleware/rate-limiter.ts`** -- Custom IP-based rate limiting middleware. Exports a `createRateLimiter` factory function and `RATE_LIMIT_PRESETS` with pre-configured limits for different endpoint types (auth, booking, contact, general). Uses an in-memory store with automatic cleanup of expired entries every 5 minutes. Sets standard `X-RateLimit-*` response headers and returns HTTP 429 with a Spanish-language error message when limits are exceeded.

- **`src/data/store.ts`** -- Runtime in-memory data store for bookings and contact messages. Data is lost on server restart. Contains auto-incrementing ID generators for both entities.

- **`src/data/activities.ts`** -- Static catalog of 8 adventure activities offered in Ushuaia, including Laguna Esmeralda treks, Glaciar Vinciguerra, Canal Beagle navigation, a city tour, and national park visits.

- **`src/data/trekkings.ts`** -- Extended detail records for trekking activities. Contains full descriptions, day-by-day itineraries, included/not-included lists, and requirements. Keyed by activity slug.

- **`src/data/calendar.ts`** -- Scheduled event instances across November 2026 through February 2027 with spot availability tracking.

- **`src/routes/bookings.ts`** -- Booking creation with rate limiting (10 requests per 15 minutes per IP), Zod validation, activity existence checks, date availability verification, capacity enforcement, and automatic price calculation.

- **`src/routes/contact.ts`** -- Contact message submission with rate limiting (5 messages per 15 minutes per IP), Zod validation, and message storage.

- **`src/routes/activities.ts`** -- Activity listing with multi-parameter filtering (category, difficulty, date range, guest count, popularity) and detail retrieval combining activity card data with trekking detail data.

### Design Patterns

**IP-based rate limiting middleware:**

Write endpoints are protected by a custom rate limiting middleware that tracks request counts per client IP within a configurable time window. The middleware is built as a factory function that accepts a configuration object and a unique store key, allowing independent rate limits per endpoint:

```typescript
// src/middleware/rate-limiter.ts
export interface RateLimitConfig {
  maxAttempts: number
  windowMs: number
  message?: string
}

export const RATE_LIMIT_PRESETS = {
  auth: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    message: "Demasiados intentos de autenticacion. Por favor, intente nuevamente en 15 minutos.",
  },
  booking: {
    maxAttempts: 10,
    windowMs: 15 * 60 * 1000,
    message: "Demasiadas solicitudes de reserva. Por favor, intente nuevamente en 15 minutos.",
  },
  contact: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
    message: "Demasiados mensajes enviados. Por favor, intente nuevamente en 15 minutos.",
  },
  general: {
    maxAttempts: 100,
    windowMs: 15 * 60 * 1000,
    message: "Demasiadas solicitudes. Por favor, intente nuevamente mas tarde.",
  },
} as const satisfies Record<string, RateLimitConfig>
```

Each rate-limited endpoint creates its own middleware instance with a preset:

```typescript
// src/routes/bookings.ts
import { createRateLimiter, RATE_LIMIT_PRESETS } from "../middleware/rate-limiter"

const bookingRateLimiter = createRateLimiter(RATE_LIMIT_PRESETS.booking, "bookings-post")

router.post("/", bookingRateLimiter, (req, res) => {
  // ... handler logic
})
```

```typescript
// src/routes/contact.ts
import { createRateLimiter, RATE_LIMIT_PRESETS } from "../middleware/rate-limiter"

const contactRateLimiter = createRateLimiter(RATE_LIMIT_PRESETS.contact, "contact-post")

router.post("/", contactRateLimiter, (req, res) => {
  // ... handler logic
})
```

When a client exceeds the limit, the middleware returns HTTP 429 with a JSON body containing the error message, retry delay, limit, and window duration:

```json
{
  "error": "Demasiadas solicitudes de reserva. Por favor, intente nuevamente en 15 minutos.",
  "retryAfter": 842,
  "limit": 10,
  "windowMs": 900000
}
```

Every response from a rate-limited endpoint includes standard headers:
- `X-RateLimit-Limit` -- Maximum allowed requests in the window
- `X-RateLimit-Remaining` -- Requests remaining before the limit is reached
- `X-RateLimit-Reset` -- Seconds until the current window resets
- `Retry-After` -- (only on 429 responses) Seconds until the client can retry

Client IP resolution supports reverse proxies via `X-Forwarded-For` header parsing, with `app.set("trust proxy", 1)` configured in `src/index.ts`. The rate limit store is kept in memory using nested `Map` structures (one per endpoint key), with a global cleanup interval that runs every 5 minutes to purge expired entries.

**In-memory data store with ID generation:**

The application uses a simple in-memory pattern for mutable data. Static reference data is stored as exported const arrays, while runtime-generated data (bookings, contact messages) lives in mutable arrays with auto-incrementing counters:

```typescript
// src/data/store.ts
export const bookings: Booking[] = []
export const contactMessages: ContactMessage[] = []

let bookingCounter = 0
let contactCounter = 0

export function nextBookingId(): string {
  return `BK-${String(++bookingCounter).padStart(4, "0")}`
}

export function nextContactId(): string {
  return `CT-${String(++contactCounter).padStart(4, "0")}`
}
```

**Zod schema validation on POST routes:**

All write endpoints validate incoming request bodies using Zod schemas with Spanish-language error messages. The pattern uses `safeParse` and returns flattened field errors on failure:

```typescript
// src/routes/bookings.ts
const BookingSchema = z.object({
  activityId: z.string().min(1, "activityId es obligatorio"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
  firstName: z.string().min(1, "Nombre es obligatorio"),
  lastName: z.string().min(1, "Apellido es obligatorio"),
  email: z.string().email("Email inválido"),
  phone: z.string().min(7, "Teléfono inválido (mín. 7 dígitos)"),
  pickupAddress: z.string().min(1, "Dirección es obligatoria"),
  city: z.string().min(1, "Ciudad es obligatoria"),
  references: z.string().optional().default(""),
  isHotel: z.boolean().default(false),
  hotelName: z.string().optional().default(""),
  guests: z.number().int().min(1, "Mínimo 1 persona"),
})

router.post("/", bookingRateLimiter, (req, res) => {
  const parsed = BookingSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({
      error: "Datos inválidos",
      details: parsed.error.flatten().fieldErrors,
    })
    return
  }
  // ... business logic
})
```

**Multi-parameter query filtering:**

List endpoints accept multiple optional query parameters and filter results by chaining conditional array filters:

```typescript
// src/routes/activities.ts
router.get("/", (req, res) => {
  let results = [...ACTIVITIES]
  const { category, difficulty, dateFrom, dateTo, guests, popular } = req.query

  if (category && category !== "all" && category !== "Todas") {
    results = results.filter((a) => a.category === category)
  }
  if (difficulty) {
    results = results.filter((a) => a.difficulty === difficulty)
  }
  if (dateFrom) {
    const from = String(dateFrom)
    const to = dateTo ? String(dateTo) : from
    results = results.filter((a) =>
      a.availability_dates.some((d) => d >= from && d <= to)
    )
  }
  if (guests) {
    const g = Number(guests)
    if (!isNaN(g)) {
      results = results.filter((a) => a.capacity_remaining >= g)
    }
  }
  if (popular === "true") {
    results = results.filter((a) => a.popular)
  }
  res.json({ count: results.length, data: results })
})
```

**Route module pattern:**

Each domain has its own route file that creates an Express `Router()`, defines handlers, and exports it as default. The main `index.ts` mounts each router under a prefixed path:

```typescript
// src/index.ts
app.use("/api/activities", activitiesRouter)
app.use("/api/calendar", calendarRouter)
app.use("/api/bookings", bookingsRouter)
app.use("/api/contact", contactRouter)
```

## Data Model

### Activity

Represents an available adventure activity in the catalog:

```typescript
export interface Activity {
  id: string
  title: string
  cover_image: string
  price_from: number
  currency: string
  difficulty: Difficulty           // "Facil" | "Moderado" | "Avanzado"
  duration: string
  category: string
  availability_dates: string[]     // ["2026-11-08", "2026-11-15", ...]
  capacity_remaining: number       // Mutable -- decremented on booking
  rating?: number
  reviews_count?: number
  popular?: boolean
  location: string
  calendarioSlug?: string
  galleryImages?: { src: string; alt: string }[]
}
```

### TrekkingDetail

Extended detail for trekking activities, keyed by activity ID in a `Record<string, TrekkingDetail>`:

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

### CalendarEvent

A scheduled event instance with availability tracking:

```typescript
export interface CalendarEvent {
  id: string
  title: string
  date: string
  month: string
  year: number
  difficulty: Difficulty
  location: string
  duration: string
  groupSize: string
  price: string
  spotsLeft: number
}
```

### Booking

A confirmed reservation created via POST /api/bookings:

```typescript
export interface Booking {
  id: string                       // Auto-generated: "BK-0001", "BK-0002", ...
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
  total: number                    // Computed: price_from * guests
  currency: string
  status: "confirmed" | "pending"
  createdAt: string
}
```

### ContactMessage

A message submitted via the contact form:

```typescript
export interface ContactMessage {
  id: string                       // Auto-generated: "CT-0001", "CT-0002", ...
  name: string
  email: string
  phone: string
  subject: string
  message: string
  createdAt: string
}
```

## API Endpoints

### Health Check

| Method | Path           | Description                              |
|--------|----------------|------------------------------------------|
| GET    | /api/health    | Returns `{ status: "ok", timestamp }` |

### Activities

| Method | Path                  | Description                                              |
|--------|-----------------------|----------------------------------------------------------|
| GET    | /api/activities       | List activities with optional filters (see query params) |
| GET    | /api/activities/:id   | Get activity card data and trekking detail by ID         |

**Query parameters for GET /api/activities:**

- `category` -- Filter by category string (e.g., "Trekking", "Laguna Esmeralda"). Values "all" and "Todas" are ignored.
- `difficulty` -- Filter by difficulty level ("Facil", "Moderado", "Avanzado")
- `dateFrom` -- Filter activities available on or after this date (YYYY-MM-DD)
- `dateTo` -- Filter activities available on or before this date (YYYY-MM-DD). Defaults to `dateFrom` if omitted.
- `guests` -- Filter activities with at least this many remaining spots
- `popular` -- Set to "true" to return only popular activities

### Calendar

| Method | Path           | Description                                        |
|--------|----------------|----------------------------------------------------|
| GET    | /api/calendar  | List calendar events with optional filters, sorted by date |

**Query parameters for GET /api/calendar:**

- `month` -- Filter by month name in Spanish (e.g., "Noviembre", "Diciembre"). Value "Todos" is ignored.
- `year` -- Filter by year (number)
- `activity` -- Filter by activity title. Value "Todas" is ignored.
- `difficulty` -- Comma-separated difficulty levels (e.g., "Facil,Moderado")

### Bookings

| Method | Path                | Description                                               |
|--------|---------------------|-----------------------------------------------------------|
| POST   | /api/bookings       | Create a booking (rate-limited, validates activity, date, capacity) |
| GET    | /api/bookings       | List all bookings                                         |
| GET    | /api/bookings/:id   | Get a single booking by ID                                |

**Rate limiting on POST /api/bookings:** 10 requests per 15-minute window per client IP. Returns HTTP 429 when exceeded.

**POST /api/bookings request body:**

```json
{
  "activityId": "laguna-esmeralda-express",
  "date": "2026-11-08",
  "firstName": "Juan",
  "lastName": "Perez",
  "email": "juan@example.com",
  "phone": "+5412345678",
  "pickupAddress": "Av. San Martin 123",
  "city": "Ushuaia",
  "references": "Frente al puerto",
  "isHotel": true,
  "hotelName": "Hotel Los Acebos",
  "guests": 2
}
```

**Business rules enforced:**
1. Activity must exist in the catalog
2. Requested date must be in the activity's `availability_dates` array
3. `guests` must not exceed `capacity_remaining`
4. If `isHotel` is true, `hotelName` is required
5. Total is computed server-side as `price_from * guests`
6. On success, `capacity_remaining` is decremented on the activity

### Contact

| Method | Path           | Description                                    |
|--------|----------------|------------------------------------------------|
| POST   | /api/contact   | Submit a contact message (rate-limited)        |
| GET    | /api/contact   | List all contact messages (admin)              |

**Rate limiting on POST /api/contact:** 5 requests per 15-minute window per client IP. Returns HTTP 429 when exceeded.

**POST /api/contact request body:**

```json
{
  "name": "Maria Lopez",
  "email": "maria@example.com",
  "phone": "+5498765432",
  "subject": "Consulta sobre Glaciar Vinciguerra",
  "message": "Hola, queria saber si la excursion incluye equipo de trekking."
}
```

### Rate Limit Response (HTTP 429)

When a client exceeds the rate limit on any protected endpoint, the response has this format:

```json
{
  "error": "Demasiadas solicitudes de reserva. Por favor, intente nuevamente en 15 minutos.",
  "retryAfter": 842,
  "limit": 10,
  "windowMs": 900000
}
```

All rate-limited responses include the `Retry-After` header (in seconds). All requests to rate-limited endpoints include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.

## Rate Limiting

The application includes a custom, zero-dependency rate limiting system implemented in `src/middleware/rate-limiter.ts`. It does not use `express-rate-limit` or any external package.

### Current Rate Limit Configuration

| Endpoint         | Preset    | Max Attempts | Window    | Store Key       |
|------------------|-----------|--------------|-----------|-----------------|
| POST /api/bookings | booking | 10           | 15 min    | bookings-post   |
| POST /api/contact  | contact | 5            | 15 min    | contact-post    |

Additional presets are available but not currently applied to any route:

| Preset   | Max Attempts | Window  | Intended Use                        |
|----------|--------------|---------|-------------------------------------|
| auth     | 5            | 15 min  | Authentication endpoints (login/register) |
| general  | 100          | 15 min  | General-purpose high-throughput endpoints |

### Adding Rate Limiting to a New Endpoint

```typescript
import { createRateLimiter, RATE_LIMIT_PRESETS } from "../middleware/rate-limiter"

// Use a preset
const limiter = createRateLimiter(RATE_LIMIT_PRESETS.auth, "my-endpoint")

// Or use a custom configuration
const customLimiter = createRateLimiter(
  { maxAttempts: 3, windowMs: 60000, message: "Demasiadas solicitudes." },
  "my-custom-endpoint"
)

router.post("/my-route", limiter, (req, res) => {
  // handler
})
```

The `storeKey` parameter must be unique per rate-limited route so that each endpoint tracks its request counts independently.

### Implementation Details

- Client IP is resolved via `X-Forwarded-For` header (first IP in the chain) with fallback to `req.ip` and `req.socket.remoteAddress`. The Express app is configured with `app.set("trust proxy", 1)` to support deployments behind a single reverse proxy.
- Rate limit state is stored in nested `Map<string, Map<string, RateLimitEntry>>` structures in memory. The outer map is keyed by store key (endpoint identifier), the inner map by client IP.
- A global cleanup interval runs every 5 minutes (via `setInterval(...).unref()`) to purge expired entries from all stores, preventing memory leaks from accumulated IP entries.
- Rate limit state is lost on server restart, same as the booking and contact message stores.

## Environment Variables

| Variable       | Default                    | Description                                |
|----------------|----------------------------|--------------------------------------------|
| PORT           | 3001                       | Port the Express server listens on         |
| FRONTEND_URL   | http://localhost:3000      | Allowed CORS origin for the frontend app   |

These are loaded via `dotenv/config` at the top of `src/index.ts`. The `.gitignore` excludes `.env`.

## Important Notes

- **All data is in-memory.** Bookings and contact messages are lost on server restart. The static catalog data (activities, trekkings, calendar events) is hardcoded in TypeScript files. Rate limit counters are also in-memory and reset on restart.

- **Capacity is mutable at runtime.** When a booking is created, `activity.capacity_remaining` is directly decremented on the in-memory object. This means capacity changes persist only until the process restarts.

- **Spanish-language UI strings.** All error messages, validation messages, and API responses are in Spanish. The `Difficulty` type uses Spanish values: `"Facil"`, `"Moderado"`, `"Avanzado"`. Activity categories also use Spanish names. Rate limit error messages are also in Spanish.

- **No authentication or authorization.** All endpoints are publicly accessible, including admin-like endpoints (GET /api/bookings, GET /api/contact). Write endpoints (POST /api/bookings, POST /api/contact) are protected by IP-based rate limiting to prevent abuse.

- **No database.** This is designed as a lightweight API that serves mostly static data. If persistence is needed, a database layer would need to be added.

- **CORS is restricted.** The CORS middleware only allows requests from `FRONTEND_URL`. When developing locally, the frontend is expected at `http://localhost:3000` and this backend at `http://localhost:3001`.

- **Reverse proxy support.** The app sets `trust proxy` to 1, meaning it trusts the first proxy in the `X-Forwarded-For` chain for client IP resolution. This is required for rate limiting to work correctly when deployed behind a load balancer or reverse proxy (e.g., on Vercel, Heroku, or behind Nginx).

- **TypeScript strict mode is enabled.** The tsconfig has `"strict": true` along with `esModuleInterop`, `skipLibCheck`, and `resolveJsonModule`.

- **Module system is NodeNext.** Both `module` and `moduleResolution` are set to `NodeNext`. Some data file imports use `.js` extensions (e.g., `from "../types.js"`), which is required by NodeNext resolution, while others omit them (e.g., `from "../data/activities"`). This inconsistency works because tsx handles both forms in development.

- **The activity detail endpoint merges two data sources.** GET /api/activities/:id returns both the `Activity` (card data from `activities.ts`) and the `TrekkingDetail` (full description from `trekkings.ts`). Not every activity has a corresponding trekking detail, and the two data sets use different ID slugs in some cases.

- **Calendar events are independent from activities.** The calendar data in `calendar.ts` and the activity catalog in `activities.ts` are separate data sets. They share some IDs but are not formally linked. Calendar events have their own pricing in ARS (Argentine pesos) while activities use USD.

- **Response format convention.** List endpoints return `{ count: number, data: T[] }`. Single-item endpoints return the object directly or a `{ error: string }` with appropriate HTTP status. Rate-limited endpoints return `{ error, retryAfter, limit, windowMs }` on HTTP 429.
