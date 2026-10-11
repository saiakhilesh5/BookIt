# BookIt

A production-style event and ticket-booking platform built on the MERN stack. The core problem it solves is the one every ticketing site has: **many users racing for the same finite seats, with no overselling, ever.**

> **Live demo → [https://book-it-sable-ten.vercel.app](https://book-it-sable-ten.vercel.app)**
> Frontend on Vercel · API on Render (`https://bookit-2-utvg.onrender.com/api/v1`) · MongoDB Atlas.
> Sign in with the seeded accounts below — everything is real data in a real database, so bookings, holds and waitlists you create persist.
> `admin@bookit.dev` · `organizer@bookit.dev` · `alex@bookit.dev`, all with password `Password123!`

Built with **Code0** — see [AI development experience](#ai-development-experience-code0).

```
React (Vite + Tailwind 4)  ──HTTP/WS──►  Express API  ──►  MongoDB 7  ◄──  BullMQ workers (Redis)
```

Seeded demo data, an organizer dashboard with charts, an admin moderation console, live seat availability over Socket.IO, PDF tickets, and a Jest suite that proves 50 parallel purchase attempts on 10 seats yield exactly 10 bookings.

---

## Table of contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Architecture](#architecture)
4. [Quick start](#quick-start)
5. [Environment variables](#environment-variables)
6. [Docker](#docker)
7. [Testing](#testing)
8. [Folder structure](#folder-structure)
9. [Data model](#data-model)
10. [How zero-overbooking works](#how-zero-overbooking-works)
11. [API reference](#api-reference)
12. [Security](#security)
13. [Performance and scalability](#performance-and-scalability)
14. [Known limitations](#known-limitations)
15. [CI/CD](#cicd)
16. [AI development experience (Code0)](#ai-development-experience-code0)

---

## Features

**Booking engine**
- Atomic seat allocation with a single conditional `$inc` — no read-modify-write, no locks, no overselling under any level of concurrency
- 10-minute seat **holds** that expire automatically (delayed job + lazy sweep on read + 60s interval safety net), all idempotent
- **Idempotency keys** on every booking POST: a dropped connection or double-click replays the original booking instead of taking more seats
- Mock card payment with Luhn validation, hard-coded decline numbers, expiry checks, and 600ms of simulated gateway latency to exercise pending states
- **Waitlist** with strict FIFO ordering and automatic promotion the instant a seat is released — promoted users get a fresh hold, not a direct charge
- **Promo codes**: percent or flat, optional per-event scope, usage caps, expiry, and redemption accounting
- **PDF tickets** generated on demand with a QR code and a `BI-` ticket code verifiable at the gate by anyone holding the code

**Product surface**
- Public discovery: full-text search, category/city/date/price filters, six sort orders, pagination, featured rail, event pages with per-tier remaining-seat badges
- Auth: register/login, JWT access token kept in memory, refresh token in an HttpOnly SameSite cookie, **rotation with reuse detection**
- RBAC for `user` / `organizer` / `admin`, with ownership checks on every organizer mutation
- Organizer dashboard: revenue, tickets sold, seats on hold, cancellations/refunds, an event table, per-event stats with Recharts revenue-and-tickets-per-day plus a per-tier breakdown, event editor with multi-tier row editor, promo manager
- Admin panel: platform stats, user search with role/status editing, pending-event moderation queue, approve/reject with reason, audit log, email outbox
- Live availability pushed to every subscriber of an event room, plus per-user booking toasts (confirmed / expired / waitlist promoted)

**Platform**
- Zod validation on every request body and query string; one normalized error envelope with stable codes (`SEATS_UNAVAILABLE`, `HOLD_EXPIRED`, `CARD_DECLINED`, `NOT_SOLD_OUT`, ...)
- Tiered rate limits, helmet, CORS allow-list, Mongo operator-injection sanitizing, 1 MB body cap
- Queued email with a persisted outbox so nothing is lost when SMTP is absent
- Pino structured logging, in-process TTL cache on read-heavy list endpoints
- Docker Compose (Mongo replica set + Redis + API + worker + nginx SPA), GitHub Actions CI

---

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React 18, Vite 6, Tailwind CSS 4 | Token-driven theme, fully responsive, no component library |
| Data fetching | TanStack Query 5 | Global 15s `staleTime`, no refetch-on-focus, 1 retry; invalidation driven by socket events |
| Client state | Zustand 5 | Auth store only — server data stays in Query cache |
| Charts | Recharts | Dashboard revenue and bookings |
| Backend | Node 20, Express 4, ESM throughout | Layered routes → controllers → services → models |
| Database | MongoDB 7, Mongoose 8 | Replica set required for BullMQ; text + 2dsphere indexes |
| Realtime | Socket.IO 4 (+ Redis adapter) | Room per event, room per user |
| Queue | BullMQ + ioredis | MemoryQueue fallback when `REDIS_URL` is unset |
| Validation | Zod 3 | Shared schema module, both body and query |
| Auth | jsonwebtoken, bcryptjs | bcrypt cost 12 |
| Documents | pdfkit, qrcode | A4 ticket PDF with a QR code, built per request |
| Email | nodemailer | Outbox model when SMTP unconfigured |
| Tests | Jest 29 (native ESM), supertest, mongodb-memory-server | 37 tests |
| Ops | Docker Compose, nginx, GitHub Actions | |

---

## Architecture

```
                        ┌──────────────────────────────────────────────┐
   browser              │  client/  React SPA                          │
   ───────────►         │  pages · components · api/hooks · store      │
                        └───────────────┬──────────────────────────────┘
                                        │ REST /api/v1        WebSocket /socket.io
                                        ▼                              │
                 ┌──────────────────────────────────────────┐         │
                 │  server/src/app.js                        │         │
                 │  helmet · cors · compression · sanitize   │◄────────┘
                 │  rate limits · cookie-parser · pino-http  │
                 └──────────────────┬────────────────────────┘
                                    │ routes → controllers
                                    ▼
                 ┌──────────────────────────────────────────┐
                 │  services/  (all business logic)          │
                 │  auth · event · booking · waitlist ·      │
                 │  promo · mail · audit · admin             │
                 └───┬───────────────┬──────────────┬────────┘
                     │               │              │
              atomic │        delayed│       queued │
            $inc ops │       hold job │      emails  │
                     ▼               ▼              ▼
              ┌───────────┐   ┌──────────────────────────┐
              │  MongoDB  │   │  Redis  (jobs + pub/sub) │
              └───────────┘   └──────────────────────────┘
                     ▲                      │
                     └──── worker process ───┘
                       src/worker.js (BullMQ consumers)
```

Requests never touch Mongoose from a route. Controllers parse and hand off; services own transactions, invariants, and emits; the emitter writes into Socket.IO rooms and is a no-op when no socket server is attached.

**Request lifecycle for a booking**

```
POST /api/v1/bookings   Idempotency-Key: abc
  │  protect ──────────── verify access JWT, load user
  │  bookingLimiter ───── 60 req / 15 min / IP
  │  requireIdempotencyKey  8–128 chars, else 400
  │  validate(createBookingSchema)
  ▼
booking.service.createBooking
  ├─ lookup {user, idempotencyKey} ── hit? replay 200 with original booking
  ├─ atomic conditional $inc on tier.available / tier.held
  │    └─ 0 docs matched ──► 409 SEATS_UNAVAILABLE (offer waitlist)
  ├─ insert Booking{status:'held', holdExpiresAt: now+10m}
  │    └─ unique-index race? the loser releases its hold and replays the winner
  ├─ enqueue hold-expiry delayed job (TTL)
  └─ emit availability → room event:{id}
```

---

## Quick start

**Prerequisites:** Node.js ≥ 18 and a MongoDB instance. Redis and SMTP are optional — the app degrades gracefully without them.

```bash
# 1. API
cd server
cp .env.example .env          # set MONGO_URI; JWT secrets are fine for dev
npm install
npm run seed                  # optional but recommended: demo data
npm run dev                   # http://localhost:5000  (health: /health)

# 2. Web app — separate terminal
cd ../client
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173
```

If `MONGO_URI` points at nothing and `EMBEDDED_DB=auto`, the server starts an ephemeral in-process MongoDB so you can run the whole stack with no database installed. Data is discarded on exit; set `EMBEDDED_DB=false` to require a real server.

**Demo accounts after `npm run seed`** (password for all: `Password123!`)

| Email | Role | Try it |
|---|---|---|
| `admin@bookit.dev` | admin | `/admin` — moderation queue, users, audit log, outbox |
| `organizer@bookit.dev` | organizer | `/dashboard` — own events, stats charts, promos |
| `alex@bookit.dev` | user | `/bookings`, `/waitlist`, checkout flow |

Seed creates 14 users, 14 events across 10 categories (12 published, one `pending` and one `draft` so the moderation queue is not empty), 17 confirmed bookings — including enough to sell one tier out so the waitlist has something to wait on — 2 waitlist entries, 3 promo codes, and a short audit trail.

---

## Environment variables

### `server/.env`

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `development` · `test` · `production` |
| `PORT` | `5000` | API listen port |
| `CLIENT_URL` | `http://localhost:5173` | CORS + cookie audience |
| `MONGO_URI` | `mongodb://localhost:27017/bookit` | Connection string |
| `EMBEDDED_DB` | `auto` | `true`/`auto` allow the in-process fallback, `false` requires a real server |
| `REDIS_URL` | — | Enables BullMQ + Socket.IO Redis adapter. Unset ⇒ memory queue, single instance |
| `JWT_ACCESS_SECRET` | `dev_access_secret` | **Required in production** — boot hard-exits otherwise |
| `JWT_REFRESH_SECRET` | `dev_refresh_secret` | Same guard |
| `ACCESS_TOKEN_TTL` | `15m` | Access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | Refresh cookie lifetime |
| `SEAT_HOLD_MINUTES` | `10` | Hold window |
| `SMTP_HOST` / `PORT` / `USER` / `PASS` | — | Unset ⇒ emails are written to the outbox collection instead of sent |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | — | Accepted by config but **not wired** — see [limitations](#known-limitations) |

### `client/.env`

| Variable | Default |
|---|---|
| `VITE_API_URL` | `http://localhost:5000/api/v1` |
| `VITE_SOCKET_URL` | `http://localhost:5000` |

Under Compose both are overridden at build time to same-origin paths (`/api/v1`, `/`) and nginx proxies them.

---

## Docker

```bash
docker compose up --build              # mongo + redis + api + worker + client
docker compose --profile seed run seed # seed once, then stop
# open http://localhost:8080
```

What the stack gives you:

- **mongo** — `mongo:7` started as a single-node replica set (`--replSet rs0`), with a healthcheck that runs `rs.initiate()` automatically. A replica set is not optional decoration: BullMQ jobs and any future transaction need it.
- **redis** — powers real delayed hold-expiry jobs, email queues, and cross-instance socket fan-out.
- **api** — `server/Dockerfile`, `npm ci --omit=dev`, `HEALTHCHECK` against `/health`.
- **worker** — same image, `command: ["node","src/worker.js"]`, so queue consumers scale independently of HTTP.
- **client** — two-stage build: Vite build with baked-in env args, then `nginx:1.27-alpine` serving `dist` with gzip, immutable asset caching, `/api/` and `/socket.io/` (WebSocket upgrade, 3600s timeouts) proxied to the API, and SPA fallback.

`docker compose config` validates the file (it does — checked). The Compose file reads `${JWT_ACCESS_SECRET:-change_me_access}` and `${JWT_REFRESH_SECRET:-...}` from your shell or a root `.env`; those fallbacks exist so the stack boots on a first try, and **must be replaced before anything leaves your machine.**

---

## Testing

```bash
cd server
npm test          # 37 tests, 4 suites, ~40s
npm run test:watch
```

Jest runs in **native ESM** (`NODE_OPTIONS=--experimental-vm-modules`, `transform: {}`) so tests exercise the same module graph the server does — no Babel rewrite hiding import bugs. `setup.js` tries a local MongoDB at `127.0.0.1:27017` with a 1.5s timeout and otherwise starts `mongodb-memory-server`, then drops the database and registers index models before any test runs.

| Suite | Covers |
|---|---|
| `auth.test.js` (11) | Register 201 + HttpOnly cookie scoping + no `passwordHash` leak, duplicate email 409, weak password 400, login, wrong credentials `INVALID_CREDENTIALS`, `/me` guard, **refresh rotation works and replaying the rotated token is rejected**, logout revokes, garbage token 401, disabled account 403 |
| `rbac.test.js` (11) | Anonymous 401, user cannot create events, organizer submit lands as `pending`, cross-organizer PATCH 403 `NOT_OWNER`, owner and admin PATCH succeed, admin endpoints closed to non-admins, approve promotes to `published`, role changes blocked for users and honored for admins |
| `booking.test.js` (13) | `Idempotency-Key` enforced, atomic hold moves `available→held` and preserves the invariant, replay returns the *same* booking without moving counters, over-request `SEATS_UNAVAILABLE`, declined card leaves the hold intact, pay confirms and mints a `BI-` ticket code, PDF is a real PDF, public verification, cancel refunds and releases seats, strangers cannot pay or cancel, lazy expiry releases seats, paying an expired hold is 410, waitlist join/promotion |
| `concurrency.test.js` (2) | **The headline proof: 50 parallel booking requests on a 10-seat tier → exactly 10 × 201 and 40 × 409, 10 distinct holders, `available 0 / held 10`, invariant intact.** Second test races 4 concurrent payments and re-checks `available + sold + held === capacity` |

Tests hit the real Express app via supertest against a real Mongo. Nothing is mocked except the payment card input, so the assertions describe actual database state.

---

## Folder structure

```
.
├── .github/workflows/ci.yml
├── docker-compose.yml
├── client/
│   ├── Dockerfile · nginx.conf · vite.config.js
│   └── src/
│       ├── api/         client.js (axios + refresh-on-401) · hooks.js · socket.js
│       ├── components/  Navbar · Footer · EventCard · ui/{Button,Input,Modal,Badge,Feedback,Toast}
│       ├── pages/       Home · Events · EventDetail · Checkout · Login · Register
│       │                MyBookings · MyWaitlist · Verify · Dashboard · Admin · NotFound
│       ├── routes/      ProtectedRoute.jsx (role-aware)
│       ├── store/       auth.js (Zustand)
│       └── utils/       format.js
└── server/
    ├── Dockerfile · jest.config.js
    ├── tests/           setup.js · auth · rbac · booking · concurrency
    └── src/
        ├── server.js · worker.js · seed.js · app.js
        ├── config/      env.js (Zod-guarded) · db.js (embedded fallback)
        ├── models/      User · Event · Booking · Waitlist · PromoCode · AuditLog · Mail
        ├── routes/      index.js (single mount table)
        ├── controllers/ auth · event · booking · admin
        ├── services/    auth · event · booking · waitlist · promo · mail · audit · admin
        ├── middleware/  auth · validate · rateLimit · idempotency · error
        ├── sockets/     index.js (rooms) · emitter.js (decoupled emit)
        ├── jobs/        queue.js (BullMQ | MemoryQueue) · index.js (workers + sweep)
        └── utils/       ApiError · asyncHandler · tokens · cache · logger · ticket · serialize
```

Hydrated Mongoose reads expose `id` through each model's `toJSON` transform, and `.lean()` reads — which skip that transform — pass through `utils/serialize.js#publicize`, so **every endpoint has the same shape**: no `_id`, no `__v`, and clients never branch on which one they got.

---

## Data model

**User** — `name`, `email` (unique, lowercased), `passwordHash` (bcrypt 12), `role`, `isActive`, and a single `refreshTokenHash` (`select: false`) holding the one currently-valid refresh token. Rotation replaces it every refresh, so there is exactly one live refresh token per account.

**Event** — `organizer`, `title`, `description`, `category` (10 values), `location{venue, city, geo}`, `startsAt`/`endsAt`, `images[]`, `status` (`draft|pending|published|rejected|cancelled`), `views`, `rejectionReason`, and **1–6 embedded tiers**:

```js
{ name, price, capacity, sold, held, available }   // available + sold + held === capacity
```

Tiers are embedded rather than referenced because they are read and written in the same operation as the event, and never queried independently. Embedding is what makes a single-document atomic update possible at all.

Indexes: text on `title/description/location.city`, `{status, startsAt}` for discovery, `{location.geo: '2dsphere'}` for proximity, plus `{organizer}`, `{category}`, `{status}`.

**Booking** — user, event, tier snapshot (`tierId`/`tierName`/`unitPrice`), `quantity`, `discountAmount`/`totalAmount`/`promoCode`, `status` (`held|confirmed|cancelled|expired|refunded`), `source` (`user|waitlist`), `holdExpiresAt`, embedded `payment{}`, `ticketCode` (unique sparse), `idempotencyKey`. Unique `{user, idempotencyKey}`; supporting `{status, holdExpiresAt}` and `{event, status}`.

**Waitlist** — event + tier + user + `quantity` + `status` (`waiting|promoted|removed`), unique per `(user, event, tierId)`. Queue position is derived, not stored: it counts entries ahead on the same tier under `{event, tierId, status, createdAt}` ordering, so promotion is strictly FIFO without a counter to keep in sync.

**PromoCode** — `code` (unique), `type` (`percent|flat`), `value`, `maxUses`, `usedCount`, `expiresAt`, optional `event` scope, owned by an organizer.

**AuditLog** — `actor` + denormalized `actorLabel` (`"Ava Admin (admin)"`, so the trail survives the user being deleted), `action` (`event.created`, `booking.paid`, `user.role_changed`, `waitlist.promoted`, …), `entityType`/`entityId`, a free-form `meta` context bag, `ip`, and `createdAt` only — timestamps disable `updatedAt`. Effectively append-only: `audit.service` exposes no update or delete path, and a failed write is logged and swallowed rather than breaking the request it describes. Indexed `{createdAt: -1}` for the admin feed.

**Mail** — outbox: `to` (user) + `toEmail`, `subject`, `template`, rendered `body`, `status` (`queued|sent|failed`), `error`, `sentAt`. When SMTP is unconfigured the rendered message still lands here and is readable in the admin panel, which makes the whole email surface demonstrable with no credentials.

---

## How zero-overbooking works

The naive implementation is a TOCTOU bug: read the tier, check `available >= qty` in JavaScript, then save. Between the read and the write, fifty other requests read the same `available`, everyone agrees there are seats, and the event sells 50 tickets for 10 seats.

BookIt never separates the check from the write. The condition and the mutation ship as **one** Mongo command on **one** document, which Mongo guarantees is atomic:

```js
// booking.service.js — the whole guard is one command
async function holdSeats(eventId, tierId, quantity) {
  const result = await Event.updateOne(
    {
      _id: eventId,
      status: 'published',
      tiers: { $elemMatch: { _id: tierId, available: { $gte: quantity } } },
    },
    { $inc: { 'tiers.$.available': -quantity, 'tiers.$.held': quantity } },
  );
  return result.modifiedCount === 1;   // false ⇒ 409 SEATS_UNAVAILABLE + seats actually left
}
```

`$elemMatch` carries the availability predicate; the positional `$` operator applies `$inc` to exactly the matched tier. Concurrency is resolved inside Mongo's document lock, so the loser of the race simply matches zero documents and gets a clean `409`. There is nothing to deadlock on and no transaction to abort. `concurrency.test.js` fires 50 of these simultaneously against 10 seats and asserts 10 succeed.

Every path that moves seats re-establishes the invariant `available + sold + held === capacity`:

| Transition | Effect |
|---|---|
| Hold created | `available -q`, `held +q` |
| Payment confirmed | `held -q`, `sold +q` |
| Payment declined | no movement — the hold stands until expiry |
| Hold expires | `held -q`, `available +q` |
| Cancel after confirm | `sold -q`, `available +q` |
| Waitlist promotion | runs the **same** atomic hold as a public booking, then claims the queue entry with a conditional `findOneAndUpdate({status:'waiting'})`; if the user left the queue concurrently the claim fails and the hold is reversed, so nothing is consumed |

**Hold expiry is deliberately over-engineered,** because a lost expiry means seats locked forever. Three mechanisms cooperate, and all are idempotent:

1. **Delayed queue job** — the fast path, fires at `holdExpiresAt`.
2. **Lazy sweep on read** — reading an event or a booking list expires any hold past due before answering, so the UI can never show a stale "held".
3. **60-second interval sweep** — catches jobs lost to a restart.

Each expires with a conditional `findOneAndUpdate({_id, status:'held', holdExpiresAt:{$lte:now}})`. Two mechanisms racing means one matches and one no-ops; seats are released exactly once.

**Idempotency** closes the remaining gap. A booking POST requires an `Idempotency-Key` (8–128 chars). The unique index on `{user, idempotencyKey}` means a retry returns the *original* booking with `200` (a fresh one is `201`) and moves no counters. If two retries race hard enough that both pass the lookup, the insert fails with `11000`, the losing transaction releases the hold it just took, and the winner's booking is returned.

---

## API reference

Base path `/api/v1`. All responses use one envelope:

```js
{ success: true,  data: ... }
{ success: false, error: { code: 'SEATS_UNAVAILABLE', message: '...', details? } }
```

Outside production the error object additionally carries a truncated `stack`.

Lists return `{ items, meta: { page, limit, total, pages } }` — offset pagination (see [limitations](#known-limitations)).

### Auth
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/auth/register` | public | Rate-limited. Sets rotating refresh cookie; returns access token |
| POST | `/auth/login` | public | Rate-limited. Same cookie behaviour |
| POST | `/auth/refresh` | cookie | Rotates the refresh token; a **reused** token is rejected `INVALID_REFRESH_TOKEN` |
| POST | `/auth/logout` | any signed-in | Clears the cookie and revokes the session server-side |
| GET | `/auth/me` | any signed-in | Current user |

### Events
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/events` | public | `q`, `category`, `city`, `from`, `to`, `minPrice`, `maxPrice`, `sort` (`date_asc`/`date_desc`/`price_asc`/`price_desc`/`newest`/`popular`), `page`, `limit` ≤ 48 |
| GET | `/events/meta` | public | Filter facet values + counts |
| GET | `/events/featured` | public | Homepage rail |
| GET | `/events/:id` | optional | Sweeps expired holds first; non-`published` events are visible only to the owner or an admin; response adds `isOwner` and per-tier `waitlistCount`; view count bumped fire-and-forget |
| POST | `/events` | organizer, admin | Creates `pending` (or `draft` when `submit:false`) |
| PATCH | `/events/:id` | owner or admin | Partial update, tier reconciliation |
| DELETE | `/events/:id` | owner or admin | Sets `cancelled`; confirmed holders are refunded |
| GET | `/events/:id/stats` | owner or admin | `{totals, tiers, byDay, byTier}` — one three-path aggregation, feeds the dashboard charts |
| POST | `/events/:id/waitlist` | any signed-in | Rate-limited. `NOT_SOLD_OUT` while seats remain on sale |
| DELETE | `/events/:id/waitlist` | any signed-in | Leave the queue |

### Bookings
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/bookings` | any signed-in | **`Idempotency-Key` required**, rate-limited. Body `{eventId, tierId, quantity ≤10, promoCode?}` → hold + `holdExpiresAt` |
| GET | `/bookings/me` | any signed-in | Own bookings, expired holds swept |
| GET | `/bookings/:id` | owner, admin | |
| POST | `/bookings/:id/pay` | owner | Rate-limited. Mock card `{card:{number,name,expMonth,expYear,cvc}}` → `confirmed` + `ticketCode`. 402 `CARD_DECLINED`, 410 `HOLD_EXPIRED` |
| POST | `/bookings/:id/promo` | owner | Apply a code to a held booking, recomputes totals |
| DELETE | `/bookings/:id/promo` | owner | Remove it |
| POST | `/bookings/:id/cancel` | owner | Refunds and releases seats back to `available` |
| GET | `/bookings/:id/ticket` | owner | `application/pdf` with a QR code. `400 NOT_CONFIRMED` while the booking is still a hold |
| GET | `/bookings/verify/:code` | public | Gate check-in — code only, no auth |

### Promos · waitlist · admin
| Method | Path | Access |
|---|---|---|
| POST | `/promos` · GET `/promos` | organizer, admin |
| POST | `/promos/validate` | any signed-in (dry run: discount without touching usage) |
| GET | `/waitlist/me` | any signed-in |
| GET | `/admin/stats` · `/admin/users` · `/admin/events/pending` · `/admin/audit-logs` · `/admin/mails` | admin |
| PATCH | `/admin/users/:id/role` · `/admin/users/:id/status` | admin |
| PATCH | `/admin/events/:id/approve` · `/admin/events/:id/reject` | admin (reject needs a reason) |

### WebSocket
Namespaced events over one Socket.IO server. Handshake `auth.token` is decoded best-effort — anonymous sockets stay anonymous.

| Direction | Event | Payload |
|---|---|---|
| client → server | `event:subscribe` / `event:unsubscribe` | `{ eventId }` (ObjectId-validated) — joining sends an immediate `availability` snapshot |
| server → room `event:{id}` | `availability` | `{ eventId, at, tiers: [{ id, name, price, capacity, sold, held, available }] }` |
| server → room `user:{id}` | `booking:confirmed`, `booking:expired`, `waitlist:promoted` | Booking/event summary — the SPA toasts and invalidates the matching Query keys |

---

## Security

- **Passwords** — bcrypt cost 12. `passwordHash` is stripped in the model's `toJSON`, so it cannot leak through any response path. Minimum 8 chars with a letter and a digit, enforced by Zod before hashing.
- **Tokens** — 15-minute access JWT lives in JavaScript memory (never `localStorage`, so an XSS payload cannot read it out); the refresh credential is **not** a JWT but an opaque 96-hex-char random string in an HttpOnly cookie scoped to `/api/v1/auth` — `secure` + `SameSite=strict` in production, `SameSite=lax` in dev. Only its SHA-256 hash is stored, on the user document, behind `select: false` so no ordinary query can pull it. Rotation issues a new token per refresh and overwrites the stored hash — **reuse of a rotated token matches no hash and is rejected** (covered by a test). Logout `$unset`s it, so the cookie is useless server-side either way.
- **Production guard** — `config/env.js` hard-exits if `NODE_ENV=production` still carries the development JWT secrets.
- **Authorization** — `protect` → `authorize(...)` → and then a service-level ownership check. `userId` always comes from the verified token, never from the body or query. Cross-organizer writes return 403 `NOT_OWNER`. Registration accepts only `user` or `organizer` — organizers self-serve, which a marketplace needs, while `admin` can be granted solely by an existing admin through `/admin/users/:id/role`.
- **Injection** — `express-mongo-sanitize` strips `$`/`.` keys before they reach a query. Identifiers in bodies and queries are regex-validated as 24-hex ObjectIds; identifiers in path params go through Mongoose, whose `CastError` the error handler maps to a `400` rather than a 500. Every query is composed through Mongoose, never string concatenation.
- **Transport & headers** — helmet, explicit CORS allow-list with credentials, 1 MB body limit, gzip compression.
- **Rate limiting** — 500/15min on the API, 30/15min on auth (failures only, so a legitimate user is never locked out), 60/15min on booking and payment. Draft-7 `RateLimit` headers.
- **Auditability** — event create/update/cancel, booking pay/cancel/refund, waitlist promotion, moderation approve/reject, and role/status changes all write an `AuditLog` with actor, entity, context, and IP. Writes are best-effort: a failed audit log is logged and swallowed, never allowed to fail the request it describes. Auth is *not* mirrored into that collection — logins and refreshes appear only in the structured pino-http request log, which is the honest gap to close first if you need security-relevant audit trails.
- **Payments** — card data is validated in-memory by the mock gateway and never persisted; only `payment.method` and a gateway reference are stored.

---

## Performance and scalability

**Reads**
- Composite indexes match the real query shapes (`{status, startsAt}` for the discovery list, text index for search, `{event, status}` for per-event booking lookups) so filters and sorts are index-scans, not collections.
- An in-process TTL cache wraps the three read-most endpoints — event list 15s, filter meta 60s, featured 30s — with prefix invalidation on writes (`events:list` is dropped whenever seats move, `events:` on any event mutation). Capped at 200 entries, FIFO eviction.
- Projections and `select()` keep payloads small, and organizer list stats come back from one aggregation pipeline instead of a query per event. Ticket PDFs are buffered per request — acceptable for a single-A4 document, and the obvious place to switch to a streamed `PDFDocument` pipe under real traffic.
- TanStack Query dedupes in-flight requests and serves the cache for 15s, so navigating back to a list costs nothing.

**Writes**
- The seat hold is one atomic `$inc` — the hot path is a single-document update, which Mongo scales by sharding on `_id`/`event` without changing the guarantee.
- Anything that is not on the request's critical path leaves the process: email goes through the queue, hold expiry arrives as a delayed job.
- No long-running transactions, so no lock contention beyond Mongo's per-document mutex.

**Scaling out**
- API is stateless apart from the socket connection. Compose already runs `worker` as a separate process — `docker compose up --scale api=4` is the next step once the rate limiter moves to Redis storage.
- With `REDIS_URL` set, the Socket.IO Redis adapter fans events out across instances, so a subscriber on instance A sees an event produced on instance B. Without it the app is explicitly single-instance.
- BullMQ gives queue-level backpressure; consumers can be scaled independently of HTTP.
- Client build hashes every asset and nginx serves `/assets/` immutable for a year. The two chart-bearing pages (organizer dashboard, admin panel) are `React.lazy` routes, so Recharts — 396 kB raw / 109 kB gzipped, the single largest dependency — is fetched only when someone opens a console. That keeps the public entry chunk at ~412 kB (127 kB gzipped) instead of 864 kB.

A rough capacity read: the booking path is one indexed find plus one atomic update, so throughput is bounded by Mongo write capacity on the tier document — the same constraint every ticketing system has, which is why per-event inventory is fanned out per tier rather than held in one global counter.

---

## Known limitations

Stated plainly, because a booking platform's honesty is part of its design.

- **Payments are mocked.** `mockGateway()` inside `services/booking.service.js` strips spaces, waits 600ms, and checks a two-entry decline map (`4000000000000002`, `4000000000009995`), then Luhn, then expiry — surfacing `CARD_DECLINED`, `INVALID_CARD`, and `CARD_EXPIRED` distinctly so the UI's failure states are all reachable. The `STRIPE_*` variables are parsed by config but **no Stripe code path exists**: no PaymentIntents, no webhooks, no refunds through a processor. Adopting a real gateway means extracting that function into its own service and adding a webhook route; the rest of the model already treats `held → confirmed` as something an external authority decides.
- **No file upload.** Event images are pasted URLs. Cloudinary/S3 integration is absent by design, to keep the demo dependency-free.
- **Offset pagination.** `/events` uses `page`/`limit`. Fine at demo scale; deep pages on a large catalogue would want cursor pagination on `startsAt,_id`.
- **Redis is optional, and things change without it.** `MemoryQueue` implements the BullMQ surface (including delayed jobs) in-process, so a single-instance dev box runs the whole product — but jobs do not survive a restart, sockets do not fan out across instances, and rate limits are per-process. That is precisely why the 60s hold sweep exists.
- **SMTP is optional.** Without credentials, emails land in the `Mail` collection and are readable in the admin outbox rather than delivered.
- **Cache is per-process.** The TTL cache is a `Map`, so instances hold independent (short-TTL) views of list endpoints. Live availability is authoritative because it comes from the socket, not the cache.
- **No refresh-token family revocation.** The model stores one refresh hash per user, so signing in on a second device replaces the first rather than adding a parallel session. Multi-device sessions (and theft detection across a token family) need a `Session` subdocument per device.
- **Testing is backend-only** (37 tests). The React layer is verified manually in a browser rather than by component tests.

---

## CI/CD

`.github/workflows/ci.yml` runs on every push and pull request against `main`. Three jobs, Node 20, npm caches keyed on each package lockfile:

1. **backend** (`API tests`) — a `mongo:7` service container with a `ping` healthcheck, `npm ci`, `npm test`, and `MONGO_URI` pointed at the service. Jest uses that real Mongo; `mongodb-memory-server` is the automatic fallback if it is unreachable, so the same suite passes on a laptop with no database.
2. **frontend** (`Client build`) — `npm ci`, `npm run build` with `VITE_API_URL=/api/v1` and `VITE_SOCKET_URL=/` baked in, then `client/dist` uploaded as an artifact (7-day retention).
3. **docker** (`Docker build smoke test`) — `needs: [backend, frontend]`; builds both images to prove the Dockerfiles and layer ordering are sound. No registry push.

Locally: `cd server && npm test`, `cd client && npm run build`, `docker compose config`.

---

## AI development experience (Code0)

**Confirmation: Code0 was used during the development of this project.** BookIt was scaffolded, implemented, debugged, tested and documented with Code0 as the development agent, working from the written product specification that defines the booking rules, the data model and the required screens.

**How it was used.** Development ran as a sequence of tracked tasks rather than one large generation: each vertical slice went *schema → service → route + Zod validator → React hook → page*, and nothing was marked done until Code0 had actually run it — the Jest suite against a real MongoDB, and the finished screens in a browser with the console open. That loop is where most of the corrections came from: claims were checked against the code and the running app, and where the two disagreed the code was fixed. It also kept the environment honest about what is real and what is simulated, which is why [Known limitations](#known-limitations) names the mock payment gateway instead of implying Stripe is wired up.

### Specific tasks performed with Code0

| Task | What Code0 did | Where it shows up |
|---|---|---|
| **Component development** | Built the Tailwind 4 design tokens and the UI primitives (`Button`, `Input`, `Modal`, `Badge`, `Toast`, and the loading/empty states in `Feedback`), `EventCard`, the navbar/footer shell and all twelve page components, then split the two chart-bearing pages into `React.lazy` routes so Recharts stays out of the public bundle | `client/src/components/`, `client/src/pages/`, `client/src/App.jsx` |
| **API creation** | Wrote the Express mount table, controllers and services for auth, events, bookings, promos, waitlist and admin — Zod schemas on every body and query, RBAC plus ownership checks in middleware, and a single error envelope with stable codes | `server/src/routes/`, `controllers/`, `services/`, `validators/`, `middleware/` |
| **Database integration** | Modelled the seven Mongoose schemas with the indexes the real query shapes need (`{status, startsAt}`, a text index, `{user, idempotencyKey}` unique), and expressed the seat hold as **one atomic conditional `$inc`** so a double-booking is impossible at the storage layer rather than unlikely | `server/src/models/`, `server/src/config/db.js`, `services/booking.service.js` |
| **Debugging** | Traced a response-shape leak where `.lean()` bypassed the `toJSON` transform, so list endpoints returned `_id` while detail endpoints returned `id` — the visible symptom was `key={undefined}` in six React lists. Fixed once in a serializer instead of patching each call site, then deleted 33 defensive `id ?? _id` reads from the client | `server/src/utils/serialize.js`, `services/event.service.js`, `services/admin.service.js` |
| **Refactoring** | Put the three hold-expiry paths (delayed queue job, lazy sweep on read, 60-second interval) behind one idempotent release function, so whichever fires first wins and the other two become no-ops — then cut the initial JavaScript payload from 864 kB to 412 kB raw by moving the two dashboards behind route-level code splitting | `server/src/jobs/`, `services/booking.service.js`, `client/src/App.jsx` |
| **Testing** | Wrote the native-ESM Jest suite (37 tests, 4 suites) that hits the real app through supertest against a real MongoDB with an in-memory fallback — including the headline proof that **50 parallel booking requests on a 10-seat tier produce exactly 10 × 201 and 40 × 409** with the seat invariant intact | `server/tests/booking.test.js`, `tests/concurrency.test.js`, `tests/setup.js` |

### Features built with Code0

- The zero-overbooking engine: atomic tier holds, 10-minute TTL, automatic release, and the `available + sold + held === capacity` invariant
- Idempotency keys, so a double-clicked *Pay* button or a retried request can never create two bookings
- FIFO waitlists that auto-promote the next person the moment a seat is released
- Promo codes with percentage and fixed discounts, usage caps and expiry
- Live per-tier seat availability pushed to every open event page over Socket.IO
- QR-coded PDF tickets generated on confirmation, plus a public `/verify` page anyone can use without an account
- Organizer dashboard with revenue, tickets-sold and capacity charts, and an admin moderation console with audit log and email outbox
- A Docker Compose stack, a GitHub Actions pipeline, and this README

### Requirement checklist

| Required in the brief | Section |
|---|---|
| Project name and description | [BookIt](#bookit) |
| Key features | [Features](#features) |
| Technologies used | [Tech stack](#tech-stack) |
| Setup and installation instructions | [Quick start](#quick-start), [Environment variables](#environment-variables), [Docker](#docker) |
| How to run the application | [Quick start](#quick-start) (dev), [Docker](#docker) (one command), [Testing](#testing) |
| Confirmation that Code0 was used | This section |
| AI development experience | This section |

---

*Built as a portfolio project. Try the [live demo](https://book-it-sable-ten.vercel.app), or run `docker compose up --build` locally, seed it, and try to overbook an event — it will not let you.*
