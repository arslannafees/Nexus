# Nexus

Nexus is a startup-focused platform connecting entrepreneurs and investors. It includes a TypeScript + React (Vite) frontend and a small Node/Express backend with PostgreSQL persistence, document upload/signing, real-time chat (Socket.IO), payments (Stripe), and basic account & 2FA flows.

## Features
- User accounts (entrepreneur / investor)
- Real-time chat and notifications (Socket.IO)
- Document upload, preview and signatures
- Meetings scheduling with conflict checks
- Simple deals listing and transactions
- Developer-friendly seeded data for local development

## Tech stack
- Frontend: Vite, React, TypeScript, Tailwind CSS
- Backend: Node.js, Express, PostgreSQL
- Realtime: Socket.IO
- Auth: JWT, optional 2FA (TOTP via speakeasy)
- Payments: Stripe

## Prerequisites
- Node.js 18+ and npm
- PostgreSQL (for production/local DB) or set `DATABASE_URL` for managed Postgres

## Quickstart (development)
1. Install project dependencies (root):

```bash
npm install
```

2. Create a `.env` file in `backend/` (or set env vars globally). Common vars:

- `PORT` (optional, defaults to `4000`)
- `DATABASE_URL` or `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`
- `JWT_SECRET` (recommended to change from default)
- `STRIPE_SECRET_KEY` (for Stripe features)

Example `.env` (for local Postgres):

```
PORT=4000
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=postgres
PGDATABASE=business_nexus
JWT_SECRET=replace-me
STRIPE_SECRET_KEY=sk_test_...
```

3. Start the app in development (runs the Vite client and backend server):

```bash
npm run dev
```

Useful scripts (defined in `package.json`):

- `npm run dev` — run both client and server concurrently
- `npm run dev:client` — run Vite dev server only
- `npm run dev:server` — run the backend only (`node --watch backend/server.js`)
- `npm run build` — build the frontend
- `npm run preview` — preview the built frontend
- `npm run server` — run backend server directly

When the backend is running you can view API docs at `http://localhost:4000/api-docs`.

## Database & seeded data
On first run the backend will attempt to create the `nexus` schema and the required tables (see `backend/db.js`). If the `users` table is empty the repo contains seed data under `backend/data/` which will be inserted automatically.

If you prefer manual setup, the SQL schema is available at `backend/schema.sql`.

## Uploads
Uploaded documents and signatures are stored under `backend/uploads/documents` and `backend/uploads/signatures`. Those directories are created automatically by the server.

## Project structure (high level)

- `src/` — frontend source (React + TypeScript)
  - `components/` — UI and feature components
  - `pages/` — route pages (auth, dashboard, documents, chat, etc.)
  - `lib/api.ts` — HTTP helpers used by the client
- `backend/` — small Express API server, DB helpers and seed data
  - `server.js` — main backend server
  - `db.js` — database and seeding logic
  - `data/` — seed data scripts
  - `uploads/` — runtime file uploads

## Development notes
- Default JWT secret and Stripe keys in `.env` are for development only — rotate before production.
- Backend supports either a `DATABASE_URL` (hosted Postgres) or individual `PG*` env vars for local connections.
- The server exposes a `/api/health` endpoint used by the frontend to check DB connectivity.

## Contributing
PRs and issues are welcome. For local work:

1. Fork the repo
2. Create a feature branch
3. Run `npm install` and `npm run dev` to test changes
4. Open a PR describing the change

## License
This repository does not include a license file. Add a `LICENSE` if you want to make licensing explicit.