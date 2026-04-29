# Adventure Backend

Express.js API backend for the Adventure website (Ushuaia trekking and outdoor activities platform). Provides endpoints for activities, bookings, calendar events, contact messages, and user authentication with rate limiting.

## Tech Stack

- **Runtime**: Node.js with TypeScript (ES2022 target, NodeNext modules)
- **Framework**: Express 4.x
- **Validation**: Zod 3.x for request body validation
- **Dev tooling**: tsx (watch mode), TypeScript 5.6+
- **Storage**: In-memory arrays (no database; data resets on server restart)

## Project Structure

```
src/
  index.ts              # Express app setup, middleware, route mounting
  types.ts              # Shared TypeScript interfaces (User, Activity, Booking, etc.)
  data/
    activities.ts       # Static activity catalog (ACTIVITIES array)
    calendar.ts         # Calendar event data
    trekkings.ts        # Trekking detail data (TREKKING_DETAILS map)
    store.ts            # In-memory stores and ID generators
  middleware/
    rate-limiter.ts     # Rate limiting middleware factory
  routes/
    auth.ts             # POST /register, POST /login (rate limited)
    activities.ts       # GET / (with filters), GET /:id
    bookings.ts         # POST /, GET /, GET /:id
    calendar.ts         # Calendar endpoints
    contact.ts          # POST /, GET /
```

## Running the Server

```bash
# Development with hot reload
npm run dev

# Build TypeScript
npm run build

# Production
npm start
```

The server starts on port 3001 by default (configurable via `PORT` env var). CORS is configured to allow requests from `http://localhost:3000` (configurable via `FRONTEND_URL` env var).

## API Endpoints

| Method | Path                  | Description                   | Rate Limited |
|--------|-----------------------|-------------------------------|-------------|
| GET    | /api/health           | Health check                  | No          |
| POST   | /api/auth/register    | User registration             | Yes (3/hour)|
| POST   | /api/auth/login       | User login                    | Yes (5/15min)|
| GET    | /api/activities       | List activities (with filters)| No          |
| GET    | /api/activities/:id   | Activity detail               | No          |
| GET    | /api/calendar         | Calendar events               | No          |
| POST   | /api/bookings         | Create booking                | No          |
| GET    | /api/bookings         | List all bookings             | No          |
| GET    | /api/bookings/:id     | Get booking by ID             | No          |
| POST   | /api/contact          | Submit contact message        | No          |
| GET    | /api/contact          | List contact messages          | No          |

## Type System

All shared types are defined in `src/types.ts`. Key interfaces:

```typescript
export interface User {
  id: string
  firstName: string
  lastName: string
  email: string
  password: string       // Stored in plaintext (production should use bcrypt)
  createdAt: string
}

export interface Activity {
  id: string
  title: string
  cover_image: string
  price_from: number
  currency: string
  difficulty: Difficulty  // "Facil" | "Moderado" | "Avanzado"
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
```

## In-Memory Data Store

`src/data/store.ts` provides mutable arrays and sequential ID generators. All data is lost on server restart.

```typescript
import type { Booking, ContactMessage, User } from "../types.js"

export const bookings: Booking[] = []
export const contactMessages: ContactMessage[] = []
export const users: User[] = []

// ID generators produce prefixed, zero-padded strings:
// nextBookingId()  -> "BK-0001", "BK-0002", ...
// nextContactId()  -> "CT-0001", "CT-0002", ...
// nextUserId()     -> "US-0001", "US-0002", ...
```

## Rate Limiting Middleware

The rate limiter is implemented as a middleware factory in `src/middleware/rate-limiter.ts`. It tracks request counts per IP address using an in-memory `Map` with automatic cleanup of expired entries.

### Configuration Interface

```typescript
export interface RateLimitConfig {
  maxAttempts: number   // Max requests allowed within the time window
  windowMs: number      // Time window in milliseconds
  message?: string      // Custom message for 429 responses
}
```

### Default Limits for Auth Endpoints

```typescript
export const AUTH_RATE_LIMITS = {
  login: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,  // 15 minutes
    message: "Demasiados intentos de inicio de sesion. Por favor, intenta de nuevo en 15 minutos.",
  },
  register: {
    maxAttempts: 3,
    windowMs: 60 * 60 * 1000,  // 1 hour
    message: "Demasiados intentos de registro. Por favor, intenta de nuevo en 1 hora.",
  },
}
```

### Creating a Rate Limiter

```typescript
import { createRateLimiter, AUTH_RATE_LIMITS } from "../middleware/rate-limiter"

const loginLimiter = createRateLimiter(AUTH_RATE_LIMITS.login)
const registerLimiter = createRateLimiter(AUTH_RATE_LIMITS.register)

// Apply as Express middleware on specific routes
router.post("/login", loginLimiter, (req, res) => { /* ... */ })
router.post("/register", registerLimiter, (req, res) => { /* ... */ })
```

### Rate Limit Response Headers

Every request to a rate-limited endpoint receives these headers:

- `X-RateLimit-Limit` -- maximum attempts allowed
- `X-RateLimit-Remaining` -- attempts remaining in current window
- `Retry-After` -- seconds until window resets (only when remaining > 0 used)

When the limit is exceeded, the middleware returns HTTP 429:

```json
{
  "error": "Too Many Requests",
  "message": "Demasiados intentos de inicio de sesion. Por favor, intenta de nuevo en 15 minutos.",
  "retryAfter": 842
}
```

### How the Rate Limiter Works Internally

1. Client IP is extracted from `req.ip` or `req.socket.remoteAddress`
2. A `Map<string, RateLimitEntry>` stores `{ count, firstAttempt }` per IP
3. If no entry exists or the window has expired, a fresh entry is created with `count: 1`
4. Otherwise, `count` is incremented; if `count > maxAttempts`, the request is blocked with 429
5. A periodic `setInterval` cleans up expired entries (interval equals `windowMs`); `unref()` is called so the timer does not prevent process exit

## Authentication Routes

Defined in `src/routes/auth.ts`. Both endpoints use Zod for input validation and the rate limiter middleware.

### POST /api/auth/register

Request body:

```json
{
  "firstName": "Juan",
  "lastName": "Perez",
  "email": "juan@example.com",
  "password": "securepass123"
}
```

Validation rules (Zod):
- `firstName`: non-empty string
- `lastName`: non-empty string
- `email`: valid email format
- `password`: minimum 8 characters

Responses:
- `201` -- registration successful, returns user object (without password)
- `400` -- validation errors with field-level details
- `409` -- email already registered
- `429` -- rate limit exceeded (3 attempts per hour per IP)

### POST /api/auth/login

Request body:

```json
{
  "email": "juan@example.com",
  "password": "securepass123"
}
```

Responses:
- `200` -- login successful, returns user object (without password)
- `400` -- validation errors
- `401` -- invalid credentials
- `429` -- rate limit exceeded (5 attempts per 15 minutes per IP)

## Bookings Route

`POST /api/bookings` validates against a Zod schema and performs business logic checks:

1. Activity must exist in `ACTIVITIES`
2. Requested date must be in `activity.availability_dates`
3. `guests` count must not exceed `capacity_remaining`
4. If `isHotel` is true, `hotelName` is required

On success, `capacity_remaining` is decremented and a booking with status `"confirmed"` is returned.

## Activities Route

`GET /api/activities` supports query parameter filters:

| Param      | Type   | Description                                  |
|------------|--------|----------------------------------------------|
| category   | string | Filter by category (ignores "all"/"Todas")   |
| difficulty | string | Filter by difficulty level                   |
| dateFrom   | string | Start date (YYYY-MM-DD) for availability     |
| dateTo     | string | End date; defaults to dateFrom if omitted    |
| guests     | number | Minimum capacity remaining                   |
| popular    | "true" | Only return popular activities                |

`GET /api/activities/:id` returns both the activity card data and the trekking detail object (either may be null).

## Validation Pattern

All POST endpoints follow the same Zod validation pattern:

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
// ... business logic
```

Error responses always include `details` with per-field error arrays, e.g.:

```json
{
  "error": "Datos invalidos",
  "details": {
    "email": ["Email invalido"],
    "password": ["La contrasena debe tener al menos 8 caracteres"]
  }
}
```

## Environment Variables

| Variable                     | Default                  | Description                                |
|------------------------------|--------------------------|--------------------------------------------|
| PORT                         | 3001                     | Server port                                |
| FRONTEND_URL                 | http://localhost:3000     | Allowed CORS origin                        |
| AUTH_LOGIN_MAX_ATTEMPTS      | 5                        | Login rate limit (logged at startup)       |
| AUTH_REGISTER_MAX_ATTEMPTS   | 3                        | Register rate limit (logged at startup)    |

## Adding New Routes

1. Create a new file in `src/routes/` with an Express `Router`
2. Define a Zod schema for request validation
3. Add the route handler following the validation pattern above
4. If mutable state is needed, add a store array and ID generator in `src/data/store.ts`
5. Import and mount the router in `src/index.ts` under `/api/<name>`
6. If the endpoint needs rate limiting, use `createRateLimiter()` from `src/middleware/rate-limiter.ts`

## Adding Rate Limiting to New Endpoints

```typescript
import { createRateLimiter } from "../middleware/rate-limiter"

const customLimiter = createRateLimiter({
  maxAttempts: 10,
  windowMs: 15 * 60 * 1000,
  message: "Too many requests, please try again later.",
})

router.post("/some-endpoint", customLimiter, (req, res) => {
  // handler
})
```

## Known Limitations

- All data is stored in memory and lost on restart; there is no database
- Passwords are stored in plaintext (should use bcrypt in production)
- Rate limiting is per-process; not shared across multiple server instances
- No authentication tokens (JWT or sessions) are issued; login just verifies credentials
- No test suite is included
