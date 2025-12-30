# AI Helpdesk SaaS

Multi-tenant helpdesk SaaS with ticketing, role-based access, and AI-assisted responses
powered by a knowledge base (RAG). The system includes a NestJS API, a BullMQ worker
for ingestion jobs, and a Next.js web app.

## What This Project Does

- Multi-tenant auth and RBAC (OWNER/ADMIN/AGENT/VIEWER) with tenant membership and invites
- Ticketing workflows: create, list, update, comment, assign, and prioritize tickets
- AI assist: draft responses using ticket context + KB citations
- Knowledge base ingestion: upload files, chunk, embed, and query via pgvector
- Usage + entitlements scaffolding (limits for KB sources, AI calls, members)
- Audit logging and job tracking for worker tasks

## Core Features 

- **Auth & tenants**: email/password signup + login, tenant creation, invites, role-based access
- **Tickets**: status and priority management, assignment rules, comments, and audit logs
- **AI assist**: LLM drafts with KB citations, context truncation, and error handling
- **Knowledge base**: source upload, indexing jobs, vector search with similarity scoring
- **Usage tracking**: AI and KB embedding events tracked for metering

## Key API Endpoints

Auth / tenants:

- `POST /auth/signup`
- `POST /auth/login`
- `GET /tenants/me`
- `POST /tenants`
- `POST /tenants/invites`
- `POST /tenants/invites/accept`

Tickets:

- `POST /tickets`
- `GET /tickets`
- `GET /tickets/:id`
- `PATCH /tickets/:id`
- `POST /tickets/:id/comments`
- `POST /tickets/:id/assist`

Knowledge base:

- `POST /kb/sources` (multipart upload)
- `POST /kb/sources/text`
- `GET /kb/sources`
- `GET /kb/sources/:id`
- `POST /kb/sources/:id/retry`
- `GET /kb/sources/status-counts`
- `GET /kb/sources/summary`
- `POST /kb/query`

Jobs:

- `GET /jobs/:id`

## Architecture

- **API**: NestJS + Prisma + Postgres (pgvector) + BullMQ
- **Worker**: NestJS app context running BullMQ processors
- **Web**: Next.js (App Router) with React Query + Tailwind
- **Infra**: Postgres + Redis (Docker Compose), Ollama for LLM + embeddings

## Backend (API + Worker)

Tech stack:

- NestJS, Prisma, Postgres (pgvector), BullMQ, Redis
- Ollama for chat + embeddings (local by default)

Key responsibilities:

- Auth + multi-tenant RBAC
- Ticketing + comments + AI assist
- Knowledge base ingestion + vector search
- Jobs + audit logs + usage tracking

Runtime processes:

- **API**: `pnpm dev` in `apps/api`
- **Worker**: `pnpm worker` in `apps/api`

## Frontend (Web)

Tech stack:

- Next.js App Router, React 19, Tailwind
- React Query + axios client

Key areas:

- Auth screens (login/signup)
- Tickets list/detail + AI assist panel
- KB upload + sources list + status
- Billing/plan screens (scaffolding)

## Repo Layout

```
ai-helpdesk-saas/
  apps/
    api/        # NestJS API + Prisma
    web/        # Next.js frontend
    worker/     # (reserved) worker app
  packages/
    shared/     # shared libs (currently empty)
  docker-compose.yml
```

## Prerequisites

- Node.js 18+ and pnpm
- Docker (for Postgres/Redis)
- Ollama running locally for LLM + embeddings

## Quick Start (Local)

1) Install dependencies:

```bash
pnpm install
```

2) Start Postgres + Redis:

```bash
docker compose up -d postgres redis
```

Note: `docker-compose.yml` exposes Postgres on `5433`, so your `DATABASE_URL` should
use `localhost:5433` unless you change the compose file.

3) Configure API env (`apps/api/.env`):

```env
DATABASE_URL="postgresql://helpdesk:helpdesk@localhost:5433/helpdesk?schema=public"
JWT_SECRET="dev_secret_change_me"
PORT=3001
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_EMBED_MODEL=nomic-embed-text:latest
OLLAMA_CHAT_MODEL=llama3.1:latest
OLLAMA_TIMEOUT_MS=60000
OLLAMA_EMBED_RETRIES=3
REDIS_URL=redis://127.0.0.1:6379
QUEUE_PREFIX=helpdesk
WORKER_CONCURRENCY=4
```

Optional storage config:

- `KB_STORAGE_DIR` (default: `storage/kb` in repo root)

4) Run migrations + generate client:

```bash
cd apps/api
pnpm prisma:migrate
pnpm prisma:generate
```

5) Start API + worker:

```bash
pnpm dev
pnpm worker
```

6) Start the web app:

```bash
cd apps/web
pnpm dev
```

## Knowledge Base Ingestion Flow

1) Upload a file via `POST /kb/sources` (multipart `file`)
2) Worker processes `INDEX_KB_SOURCE` (extract text, chunk, embed)
3) Source status transitions: `QUEUED -> INDEXING -> READY` or `FAILED`
4) AI assist uses `/tickets/:id/assist` with KB citations

## Local Dev Notes

- API binds to `PORT` (default `3001`)
- Web runs on `3000` and expects the API at `http://localhost:3001`
- If you see `EADDRINUSE`, update `PORT` in `apps/api/.env`
- If you see `EPERM` to Redis, the process may need access to `localhost` (run outside sandbox)

## Deploy Notes (High-Level)

- Run API and worker as separate services
- Use managed Postgres + Redis
- Set `DATABASE_URL`, `REDIS_URL`, and Ollama host (or swap to a hosted LLM)
- Point the web app to the API base URL

## Deploy on Railway

Suggested services:

- **postgres**: Railway Postgres plugin
- **redis**: Railway Redis plugin
- **api**: NestJS API (service)
- **worker**: BullMQ worker (service)
- **web**: Next.js app (service)

### 1) Create Services

1. Create a new Railway project and connect this repo.
2. Add Postgres and Redis plugins.
3. Create three services from the repo: `api`, `worker`, `web`.

### 2) Configure Build/Start

API service:

- Root: `apps/api`
- Build: `pnpm install && pnpm build`
- Start: `pnpm start:prod`

Worker service:

- Root: `apps/api`
- Build: `pnpm install && pnpm build`
- Start: `pnpm start:worker:prod`

Web service:

- Root: `apps/web`
- Build: `pnpm install && pnpm build`
- Start: `pnpm start`

### 3) Required Env Vars (Railway)

API + Worker:

- `DATABASE_URL` (Railway Postgres)
- `REDIS_URL` (Railway Redis)
- `JWT_SECRET`
- `OLLAMA_HOST` (or replace with hosted LLM)
- `OLLAMA_CHAT_MODEL`
- `OLLAMA_EMBED_MODEL`
- `QUEUE_PREFIX`
- `WORKER_CONCURRENCY`

Web:

- `NEXT_PUBLIC_API_URL` (your API service URL)

### 4) Notes

- Ensure the API service is reachable from the web service via `NEXT_PUBLIC_API_URL`.
- If you don’t use Ollama in production, swap the AI provider and update env vars.

## Useful Scripts

API (`apps/api`):

- `pnpm dev` - start API (watch mode)
- `pnpm worker` - start BullMQ worker
- `pnpm prisma:migrate` - create/apply migrations (dev)
- `pnpm prisma:generate` - generate Prisma client

Web (`apps/web`):

- `pnpm dev` - start Next.js dev server

## Notes / Troubleshooting

- If the API or worker can’t connect to Redis, confirm `REDIS_URL` and that the
  container is running on `6379`.
- If the API can’t connect to Postgres, verify `DATABASE_URL` matches the exposed port.
- Ollama must be running for AI features to work (`ollama serve`).

## License

Private/UNLICENSED for now. Update this section if you want to open source it.
