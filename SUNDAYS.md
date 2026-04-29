# Adventure Backend

REST API backend for the Adventure Website (Ushuaia trekking and outdoor activities platform). Built with Express, TypeScript, and Zod validation. Uses in-memory data storage.

## Tech Stack

- **Runtime**: Node.js with TypeScript (ES2022 target, NodeNext modules)
- **Framework**: Express 4.21
- **Validation**: Zod 3.25
- **Authentication**: JSON Web Tokens (`jsonwebtoken` 9.x) + bcryptjs for password hashing
- **Dev tooling**: tsx (watch mode), TypeScript 5.6+
- **Environment**: dotenv for configuration

## Project Structure

```
src/
  index.ts              # Express app setup, middleware, route registration
  types.ts              # Shared TypeScript interfaces (Activity, Booking, User, etc.)
  data/
    activities.ts       # Static activity catalog (ACTIVITIES array)
    calendar.ts         # Calendar events data (CALENDAR_EVENTS array)
    trekkings.ts        # Trekking detail records (TREKKING_DETAILS map)
    store.ts            # In-memory mutable stores (bookings, contactMessages, users)
  middleware/
    auth.ts             # JWT authentication middleware (authenticateToken)
  routes/
    activities.ts       # GET /api/activities, GET /api/activities/:id
    bookings.ts         # POST /api/bookings, GET /api/bookings, GET /api/bookings/:id
    calendar.ts         # GET /api/calendar
    contact.ts          # POST /api/contact, GET /api/contact
    auth.ts             # POST /api/auth/register, POST /api/auth/login, GET /api/auth/me
```

## Scripts

```bash
npm run dev     # Start dev server with tsx watch (auto-reload)
npm run build   # Compile TypeScript to dist/
npm start       # Run compiled output from dist/index.js
```

The dev server runs on `PORT` (default `3001`). CORS is configured to accept requests from `FRONTEND_URL` (default `http://localhost:3000`).

## Environment Variables

| Variable       | Default                        | Description                      |
|----------------|--------------------------------|----------------------------------|
| `PORT`         | `3001`                         | Server listening port            |
| `FRONTEND_URL` | `http://localhost:3000`        | Allowed CORS origin              |
| `JWT_SECRET`   | `adventure-secret-key-2026`    | Secret key for signing JWTs      |

## API Endpoints

### Health Check

```
GET /api/health
```

Returns `{ status: "ok", timestamp: "..." }`.

### Activities

```
GET /api/activities
```

Query parameters (all optional):
- `category` - Filter by category string (ignored if `"all"` or `"Todas"`)
- `difficulty` - Filter by difficulty (`"Facil"`, `"Moderado"`, `"Avanzado"`)
- `dateFrom` / `dateTo` - Filter activities with availability in date range (YYYY-MM-DD)
- `guests` - Filter by minimum `capacity_remaining`
- `popular` - Set to `"true"` to return only popular activities

Response shape:

```json
{
  "count": 5,
  "data": [{ "id": "laguna-esmeralda-express", "title": "...", ... }]
}
```

```
GET /api/activities/:id
```

Returns both the activity card data and the trekking detail for a given ID:

```json
{
  "activity": { "id": "laguna-esmeralda-express", "title": "...", ... },
  "detail": { "title": "...", "itinerary": [...], "included": [...], ... }
}
```

Returns 404 if neither the activity nor the detail is found.

### Calendar

```
GET /api/calendar
```

Query parameters (all optional):
- `month` - Filter by month name (ignored if `"Todos"`)
- `year` - Filter by numeric year
- `activity` - Filter by activity title (ignored if `"Todas"`)
- `difficulty` - Comma-separated difficulty values

Results are sorted by date ascending.

### Bookings

```
POST /api/bookings
```

Creates a new booking. Request body validated with Zod:

```typescript
const BookingSchema = z.object({
  activityId: z.string().min(1, "activityId es obligatorio"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha invalido (YYYY-MM-DD)"),
  firstName: z.string().min(1, "Nombre es obligatorio"),
  lastName: z.string().min(1, "Apellido es obligatorio"),
  email: z.string().email("Email invalido"),
  phone: z.string().min(7, "Telefono invalido (min. 7 digitos)"),
  pickupAddress: z.string().min(1, "Direccion es obligatoria"),
  city: z.string().min(1, "Ciudad es obligatoria"),
  references: z.string().optional().default(""),
  isHotel: z.boolean().default(false),
  hotelName: z.string().optional().default(""),
  guests: z.number().int().min(1, "Minimo 1 persona"),
})
```

Business validations:
- Activity must exist
- Date must be in the activity's `availability_dates`
- Guest count must not exceed `capacity_remaining`
- If `isHotel` is true, `hotelName` is required

On success, returns 201 with booking confirmation. Decreases activity `capacity_remaining`.

```
GET /api/bookings         # List all bookings
GET /api/bookings/:id     # Get single booking by ID
```

### Contact

```
POST /api/contact
```

Validated with Zod:

```typescript
const ContactSchema = z.object({
  name: z.string().min(1, "Nombre es obligatorio"),
  email: z.string().email("Email invalido"),
  phone: z.string().optional().default(""),
  subject: z.string().min(1, "Asunto es obligatorio"),
  message: z.string().min(10, "El mensaje debe tener al menos 10 caracteres"),
})
```

```
GET /api/contact          # List all contact messages
```

### Authentication

Three endpoints handle user registration, login, and session validation.

#### Register

```
POST /api/auth/register
```

Request body validated with Zod:

```typescript
const RegisterSchema = z.object({
  firstName: z.string().min(1, "Nombre es obligatorio"),
  lastName: z.string().min(1, "Apellido es obligatorio"),
  email: z.string().email("Email invalido"),
  password: z.string().min(6, "La contrasena debe tener al menos 6 caracteres"),
})
```

- Checks for duplicate email (returns 409 if already registered)
- Hashes password with bcryptjs (salt rounds: 10)
- Creates user in the in-memory store
- Returns JWT token (expires in 7 days) and user data (without password)

Response (201):

```json
{
  "message": "Cuenta creada exitosamente",
  "user": { "id": "US-0001", "firstName": "...", "lastName": "...", "email": "..." },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

#### Login

```
POST /api/auth/login
```

Request body:

```typescript
const LoginSchema = z.object({
  email: z.string().email("Email invalido"),
  password: z.string().min(1, "Contrasena es obligatoria"),
})
```

- Finds user by email
- Compares password with bcrypt
- Returns 401 with generic message for both invalid email and wrong password
- On success, returns JWT token and user data

Response (200):

```json
{
  "message": "Sesion iniciada",
  "user": { "id": "US-0001", "firstName": "...", "lastName": "...", "email": "..." },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

#### Get Current User (Protected)

```
GET /api/auth/me
Authorization: Bearer <token>
```

Protected route that requires a valid JWT. Returns the current user's profile data (without password).

## Authentication Middleware

The `authenticateToken` middleware in `src/middleware/auth.ts` protects routes by verifying JWT tokens:

```typescript
import type { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.JWT_SECRET || "adventure-secret-key-2026"

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) {
    res.status(401).json({ error: "Token de autenticacion requerido" })
    return
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string }
    ;(req as any).user = decoded
    next()
  } catch {
    res.status(403).json({ error: "Token invalido o expirado" })
  }
}
```

To protect any route, add `authenticateToken` as middleware:

```typescript
router.get("/protected-route", authenticateToken, (req, res) => {
  const userId = (req as any).user.userId
  // ...
})
```

The JWT payload contains `{ userId: string, email: string }` and is accessible via `(req as any).user` after authentication.

## Data Layer

### Static Data

Activities, calendar events, and trekking details are defined as static arrays/objects in `src/data/`:

- `ACTIVITIES` (`Activity[]`) - Activity catalog with pricing, availability dates, capacity
- `CALENDAR_EVENTS` (`CalendarEvent[]`) - Scheduled events with dates, difficulty, spots
- `TREKKING_DETAILS` (`Record<string, TrekkingDetail>`) - Detailed info keyed by activity ID

### In-Memory Stores

Mutable runtime data is stored in `src/data/store.ts`:

```typescript
export const bookings: Booking[] = []
export const contactMessages: ContactMessage[] = []
export const users: User[] = []
```

ID generators follow a sequential pattern with prefixed format:

```typescript
export function nextBookingId(): string {
  return `BK-${String(++bookingCounter).padStart(4, "0")}`  // BK-0001, BK-0002, ...
}

export function nextContactId(): string {
  return `CT-${String(++contactCounter).padStart(4, "0")}`  // CT-0001, CT-0002, ...
}

export function nextUserId(): string {
  return `US-${String(++userCounter).padStart(4, "0")}`     // US-0001, US-0002, ...
}
```

All in-memory data resets when the server restarts.

## Type Definitions

Key interfaces defined in `src/types.ts`:

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

export interface User {
  id: string
  firstName: string
  lastName: string
  email: string
  password: string
  createdAt: string
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

## Validation Pattern

All POST endpoints use the same Zod validation pattern:

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
// ... proceed with validated data
```

Error responses for validation failures follow this structure:

```json
{
  "error": "Datos invalidos",
  "details": {
    "fieldName": ["Error message"]
  }
}
```

## Error Response Conventions

| Status | Usage                                               |
|--------|-----------------------------------------------------|
| 400    | Validation errors, bad request data                 |
| 401    | Missing token or invalid credentials                |
| 403    | Expired or invalid JWT token                        |
| 404    | Resource not found                                  |
| 409    | Conflict (e.g., duplicate email on register)        |

All error responses return `{ error: "message string" }`. Validation errors additionally include a `details` object with per-field error arrays.

## TypeScript Configuration

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

## Adding New Routes

1. Create a new file in `src/routes/` with a `Router` instance
2. Define Zod schemas for any request body validation
3. Implement route handlers
4. Export the router as default
5. Register in `src/index.ts`:

```typescript
import newRouter from "./routes/newRoute"
app.use("/api/new-route", newRouter)
```

To add a protected route, import and apply the auth middleware:

```typescript
import { authenticateToken } from "../middleware/auth"

router.get("/protected", authenticateToken, (req, res) => {
  const { userId, email } = (req as any).user
  // ...
})
```
