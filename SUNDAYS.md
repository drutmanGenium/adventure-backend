# Adventure Backend

Express + TypeScript REST API for the Adventure Website (Ushuaia trekking/tourism platform). Serves activity listings, calendar events, bookings, contact messages, and user authentication.

## Tech Stack

- **Runtime**: Node.js with TypeScript (ES2022, NodeNext modules)
- **Framework**: Express 4.x
- **Validation**: Zod 3.x for request body schemas
- **Authentication**: JWT (jsonwebtoken 9.x) + bcryptjs for password hashing
- **Dev tooling**: tsx (watch mode), TypeScript 5.x
- **No database**: All data is in-memory (static seed data + runtime stores)

## Project Structure

```
src/
  index.ts              # Express app setup, middleware, route mounting
  types.ts              # Shared TypeScript interfaces (Activity, Booking, User, etc.)
  data/
    activities.ts       # Static seed data: ACTIVITIES array
    calendar.ts         # Static seed data: CALENDAR_EVENTS array
    trekkings.ts        # Static seed data: TREKKING_DETAILS lookup
    store.ts            # In-memory runtime stores (bookings, contactMessages, users) + ID generators
  middleware/
    auth.ts             # JWT authentication middleware and token generation
  routes/
    activities.ts       # GET /api/activities, GET /api/activities/:id
    calendar.ts         # GET /api/calendar
    bookings.ts         # POST /api/bookings, GET /api/bookings, GET /api/bookings/:id
    contact.ts          # POST /api/contact, GET /api/contact
    auth.ts             # POST /api/auth/register, POST /api/auth/login, GET /api/auth/me
```

## Scripts

```bash
npm run dev     # tsx watch src/index.ts  (hot-reload development server)
npm run build   # npx tsc                 (compile to dist/)
npm start       # node dist/index.js      (run compiled output)
```

## Environment Variables

| Variable       | Default                      | Description                           |
|----------------|------------------------------|---------------------------------------|
| `PORT`         | `3001`                       | Server listen port                    |
| `FRONTEND_URL` | `http://localhost:3000`      | CORS allowed origin                   |
| `JWT_SECRET`   | `adventure-secret-key-dev`   | Secret key for signing JWT tokens     |

## TypeScript Configuration

The project uses strict mode with NodeNext module resolution. Source files live in `src/`, compiled output goes to `dist/`.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

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

export interface User {
  id: string
  firstName: string
  lastName: string
  email: string
  password: string
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

`src/data/store.ts` holds runtime mutable state. All data resets on server restart.

```typescript
import type { Booking, ContactMessage, User } from "../types.js"

export const bookings: Booking[] = []
export const contactMessages: ContactMessage[] = []
export const users: User[] = []

let bookingCounter = 0
let contactCounter = 0
let userCounter = 0

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

ID format conventions: `BK-0001` for bookings, `CT-0001` for contacts, `US-0001` for users.

## Authentication System

### Middleware (`src/middleware/auth.ts`)

JWT-based authentication using Bearer tokens. Tokens expire after 7 days.

```typescript
import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.JWT_SECRET || "adventure-secret-key-dev"

export interface AuthRequest extends Request {
  userId?: string
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) {
    res.status(401).json({ error: "Token de autenticacion requerido" })
    return
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string }
    req.userId = decoded.userId
    next()
  } catch {
    res.status(403).json({ error: "Token invalido o expirado" })
  }
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" })
}
```

### Auth Routes (`src/routes/auth.ts`)

Three endpoints for user authentication:

**POST /api/auth/register** -- Create a new user account. Validates with Zod, hashes password with bcrypt (cost factor 10), returns JWT token.

Request body:
```json
{
  "firstName": "Juan",
  "lastName": "Perez",
  "email": "juan@example.com",
  "password": "secret123"
}
```

Validation schema:
```typescript
const RegisterSchema = z.object({
  firstName: z.string().min(1, "Nombre es obligatorio"),
  lastName: z.string().min(1, "Apellido es obligatorio"),
  email: z.string().email("Email invalido"),
  password: z.string().min(6, "La contrasena debe tener al menos 6 caracteres"),
})
```

Response (201):
```json
{
  "message": "Cuenta creada exitosamente",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": "US-0001", "firstName": "Juan", "lastName": "Perez", "email": "juan@example.com" }
}
```

**POST /api/auth/login** -- Authenticate an existing user. Returns JWT token on success.

Request body:
```json
{ "email": "juan@example.com", "password": "secret123" }
```

Response (200):
```json
{
  "message": "Inicio de sesion exitoso",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": "US-0001", "firstName": "Juan", "lastName": "Perez", "email": "juan@example.com" }
}
```

**GET /api/auth/me** -- Get current authenticated user profile. Requires Bearer token.

Headers: `Authorization: Bearer <token>`

Response (200):
```json
{
  "user": { "id": "US-0001", "firstName": "Juan", "lastName": "Perez", "email": "juan@example.com", "createdAt": "2026-04-29T..." }
}
```

Error responses:
- 400: Zod validation errors with `{ error, details }` structure
- 401: Missing token or invalid credentials
- 403: Expired or invalid token
- 409: Email already registered (register only)

## API Endpoints

### Activities

**GET /api/activities** -- List activities with optional filters.

Query parameters:
- `category` -- Filter by category (skip if `"all"` or `"Todas"`)
- `difficulty` -- Filter by difficulty level
- `dateFrom` / `dateTo` -- Filter by availability date range (YYYY-MM-DD)
- `guests` -- Minimum capacity remaining
- `popular` -- Set to `"true"` to show only popular activities

Response: `{ count: number, data: Activity[] }`

**GET /api/activities/:id** -- Get a single activity with full trekking detail.

Response: `{ activity: Activity | null, detail: TrekkingDetail | null }`

### Calendar

**GET /api/calendar** -- List calendar events with optional filters.

Query parameters:
- `month` -- Filter by month name (skip if `"Todos"`)
- `year` -- Filter by year number
- `activity` -- Filter by activity title (skip if `"Todas"`)
- `difficulty` -- Comma-separated difficulty levels

Results are sorted by date ascending.

Response: `{ count: number, data: CalendarEvent[] }`

### Bookings

**POST /api/bookings** -- Create a new booking. Validates activity exists, date is available, and capacity is sufficient. Decreases `capacity_remaining` on the activity.

Request body validated with Zod `BookingSchema`:
```typescript
const BookingSchema = z.object({
  activityId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(7),
  pickupAddress: z.string().min(1),
  city: z.string().min(1),
  references: z.string().optional().default(""),
  isHotel: z.boolean().default(false),
  hotelName: z.string().optional().default(""),
  guests: z.number().int().min(1),
})
```

**GET /api/bookings** -- List all bookings. Response: `{ count, data }`

**GET /api/bookings/:id** -- Get a single booking by ID.

### Contact

**POST /api/contact** -- Submit a contact message. Validated with Zod (name, email, subject required; message min 10 chars).

**GET /api/contact** -- List all contact messages.

### Health Check

**GET /api/health** -- Returns `{ status: "ok", timestamp: "..." }`

## Validation Pattern

All POST endpoints follow the same Zod validation pattern:

```typescript
const parsed = Schema.safeParse(req.body)

if (!parsed.success) {
  res.status(400).json({
    error: "Datos invalidos",
    details: parsed.error.flatten().fieldErrors,
  })
  return
}

const data = parsed.data
// ... proceed with validated data
```

The `details` field contains per-field error arrays, e.g. `{ "email": ["Email invalido"] }`.

## Route Mounting

All routes are mounted under `/api` in `src/index.ts`:

```typescript
app.use("/api/auth", authRouter)
app.use("/api/activities", activitiesRouter)
app.use("/api/calendar", calendarRouter)
app.use("/api/bookings", bookingsRouter)
app.use("/api/contact", contactRouter)
```

CORS is configured to accept requests from `FRONTEND_URL` (defaults to `http://localhost:3000`).

A catch-all 404 handler returns `{ error: "Ruta no encontrada" }` for unmatched routes.

## Adding New Routes

1. Create a new file in `src/routes/` with a `Router()` instance
2. Define Zod schemas for any POST body validation
3. If the route needs persistent state, add an array and ID generator to `src/data/store.ts`
4. If the route needs auth, apply `authenticateToken` middleware from `src/middleware/auth.ts`
5. Mount the router in `src/index.ts` under the `/api` prefix

## Protecting Routes with Authentication

To protect any route, import and use the `authenticateToken` middleware:

```typescript
import { authenticateToken, type AuthRequest } from "../middleware/auth"

router.get("/protected", authenticateToken, (req: AuthRequest, res) => {
  const userId = req.userId // extracted from JWT
  // ...
})
```

The middleware extracts the `userId` from the JWT payload and attaches it to `req.userId`. If the token is missing or invalid, the request is rejected with 401/403 before reaching the handler.
