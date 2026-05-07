# Adventure Backend

Mini backend para adventure-website (Ushuaia trekking) -- a REST API serving activity listings, calendar events, bookings, and contact messages for an adventure tourism company based in Ushuaia, Tierra del Fuego, Argentina.

## Getting Started

```bash
# Install dependencies
npm install

# Run development server with hot-reload
npm run dev

# Compile TypeScript to JavaScript
npm run build

# Start production server
npm start
```

## Environment Variables

| Variable       | Default                  | Description                          |
|----------------|--------------------------|--------------------------------------|
| `PORT`         | `3001`                   | Port the Express server listens on   |
| `FRONTEND_URL` | `http://localhost:3000`  | Allowed CORS origin for the frontend |

## API Endpoints

### Health Check

| Method | Path         | Description                                            |
|--------|--------------|--------------------------------------------------------|
| GET    | `/healthz`   | Kubernetes-style health probe. Returns `{ status: "ok", timestamp }`. |
| GET    | `/api/health` | Returns `{ status: "ok", timestamp }`.                |

### Activities

| Method | Path                  | Description                                              |
|--------|-----------------------|----------------------------------------------------------|
| GET    | `/api/activities`     | List all activities. Supports filtering by category, difficulty, date range, guests, and popularity. |
| GET    | `/api/activities/:id` | Get one activity with trekking detail.                   |

### Calendar

| Method | Path            | Description                                       |
|--------|-----------------|---------------------------------------------------|
| GET    | `/api/calendar`  | List calendar events with optional filters.       |

### Bookings

| Method | Path                | Description                                      |
|--------|---------------------|--------------------------------------------------|
| POST   | `/api/bookings`     | Create a booking with validation and capacity check. |
| GET    | `/api/bookings`     | List all bookings.                               |
| GET    | `/api/bookings/:id` | Get a single booking by ID.                      |

### Contact

| Method | Path            | Description                                      |
|--------|-----------------|--------------------------------------------------|
| POST   | `/api/contact`  | Submit a contact message.                        |
| GET    | `/api/contact`  | List all contact messages.                       |
