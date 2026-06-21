# Swim Marathon — MVP Backend

A modular-monolith NestJS backend for managing swimming-marathon events.
Multi-tenant (pool owners manage swimmers), with a GitHub-style activity
heatmap and geospatial "nearby pools" search.

## Stack
- **NestJS** (TypeScript) — modular monolith, easy to split into services later
- **PostgreSQL + PostGIS** — relational integrity + geospatial queries
- **Prisma** — type-safe ORM (geo handled via raw SQL)
- **JWT auth** — role-based access (ADMIN / OWNER / SWIMMER)
- **bcrypt** — password hashing

## Modules
```
src/
├── main.ts                  # bootstrap, CORS, validation
├── app.module.ts            # wires everything together
├── prisma.service.ts        # DB client
├── common/                  # roles guard + decorators (auth plumbing)
├── auth/                    # register / login / me, JWT strategy
├── pools/                   # owners create pools, register swimmers
├── sessions/                # swimmers log swim sessions (distance/time)
├── stats/                   # heatmap + summary (the GitHub-style calendar)
└── places/                  # nearby swimming places (PostGIS radius search)
```

## Run locally
```bash
cp .env.example .env          # fill in secrets
docker compose up -d          # Postgres + PostGIS
npm install
npx prisma migrate dev        # create schema
npm run start:dev
```

## Key endpoints
| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | /auth/register | public | create owner or swimmer |
| POST | /auth/login | public | get access token |
| GET  | /auth/me | any | current user |
| POST | /pools | owner | create a pool (tenant) |
| POST | /pools/:id/register | owner/swimmer | register a swimmer to a pool |
| GET  | /pools/:id/swimmers | owner | list registered swimmers |
| POST | /sessions | swimmer | log a swim (distance + time) |
| GET  | /sessions/me | swimmer | own session history |
| GET  | /stats/heatmap?year=2026 | swimmer | per-day distance for the calendar |
| GET  | /stats/summary | swimmer | totals (distance, sessions, streak) |
| GET  | /places/nearby?lat=&lng=&radiusMeters= | any | nearby pools |

> This is **skeleton** code: business logic is implemented for the core paths,
> with `TODO` markers where you'll harden things (rate limits, refresh tokens,
> ownership checks, AI insights service). See PHASE-2/3 notes in the chat.
