# Backend Setup

This project now ships with an Express + PostgreSQL API for authentication and profile management.

## Environment

Create a `backend/.env` file with:

```env
PORT=4000
# Use a dedicated database/user for this app, not your other projects.
DATABASE_URL=postgres://business_nexus_app:YOUR_PASSWORD@localhost:5432/business_nexus
# Or use the standard local Postgres variables instead of DATABASE_URL:
# PGHOST=localhost
# PGPORT=5432
# PGUSER=business_nexus_app
# PGPASSWORD=YOUR_PASSWORD
# PGDATABASE=business_nexus
JWT_SECRET=replace-with-a-long-random-secret
NODE_ENV=development
```

## Local database

1. Create a dedicated database and user for this app, for example:

```sql
CREATE DATABASE business_nexus;
CREATE USER business_nexus_app WITH PASSWORD 'YOUR_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE business_nexus TO business_nexus_app;
```

2. Put the matching password into `backend/.env`.
3. Start the API with `npm run server` or `npm run dev:server`.
4. The schema and demo users seed automatically on first startup.

## API coverage

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/users`
- `GET /api/users?role=investor|entrepreneur`
- `GET /api/collaboration-requests`
- `POST /api/collaboration-requests`
- `PATCH /api/collaboration-requests/:id`
- `GET /api/messages/conversations`
- `GET /api/notifications`
- `GET /api/documents`
- `GET /api/deals`
- `GET /api/meetings`
- `GET /api/meetings/:id`
- `POST /api/meetings`
- `PATCH /api/meetings/:id/accept`
- `PATCH /api/meetings/:id/reject`
- `PATCH /api/users/:id/profile`
- `GET /api/users/:id`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

## Video calling

The backend also hosts a Socket.IO signaling server for the meetings page. The frontend connects to the same host as the API by default, or you can set `VITE_SOCKET_URL` if the signaling server lives elsewhere.
