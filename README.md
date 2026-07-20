# Mnemo

Agent memory manager: stores memories (lessons, conventions, decisions, facts) with tags/scopes, retrieves relevant ones, and compiles them into CLAUDE.md files for other projects.

## Getting Started

Copy the env template and set your local API key:

```bash
cp .env.example .env
# Edit .env and set MNEMO_API_KEY to any string you like
```

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/login`. Enter your `MNEMO_API_KEY` to log in.

> If `MNEMO_API_KEY` is unset in development, auth is skipped and a warning is logged. In production, this fails closed (503).

## Commands

- `npm run dev` — dev server
- `npm run build` — production build
- `npm run check` — typecheck + lint
- `npm run db:generate` — regenerate Prisma client from `schema.prisma`
- `npm run db:apply` — apply the full `schema.sql` to Turso (idempotent)
- `npm run db:migrate` — apply additive migrations from `prisma/migrations/`
- `npm run db:sql` — print the full `CREATE TABLE` SQL for manual review

## Turso Database Setup

Mnemo uses Prisma with the `@prisma/adapter-libsql` driver adapter, which works with both local SQLite files and Turso (a hosted libSQL service). Here's how to set up Turso for production:

### 1. Install the Turso CLI

```bash
# macOS (Homebrew)
brew install tursodatabase/tap/turso

# or via the installer script
curl -sSfL https://get.tur.so/install.sh | bash
```

### 2. Create a Turso database

```bash
turso auth login
turso db create mnemo
```

### 3. Get the database URL and auth token

```bash
# Get the connection URL
turso db show mnemo --url
# e.g. libsql://mnemo-<your-org>.turso.io

# Create an auth token
turso db tokens create mnemo
# e.g. eyJhbGciOi...
```

### 4. Set environment variables on Netlify

In the Netlify dashboard for your site, go to **Site settings > Environment variables** and set:

| Variable           | Value                                              |
| ------------------ | -------------------------------------------------- |
| `DATABASE_URL`     | `libsql://mnemo-<your-org>.turso.io`               |
| `TURSO_AUTH_TOKEN`  | `eyJhbGciOi...` (your token from step 3)           |
| `MNEMO_API_KEY`    | Any strong string — this is your login + API key   |

### 5. Push the schema to Turso

The Prisma CLI's native engine doesn't understand `libsql://` URLs, so `prisma db push` can't connect to Turso directly. Instead, generate the schema SQL and paste it into the Turso web SQL shell:

```bash
npm run db:sql
```

This runs `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`, which outputs a complete `CREATE TABLE` + `CREATE INDEX` SQL script. Copy the output, then:

1. Go to your Turso database's **SQL Shell** in the [Turso dashboard](https://app.turso.app).
2. Paste the SQL script and run it.

This creates the `Project` and `Memory` tables with indexes. After that, your Turso database is ready and Mnemo will connect to it at runtime via the `@prisma/adapter-libsql` driver adapter.

## Netlify Deployment

Mnemo is configured for deployment on Netlify at `mnemo.joshstrohm.me`.

### Prerequisites

- A Netlify account
- The Netlify CLI (optional, for CLI deploys): `npm install -g netlify-cli`

### Deploy via Git (recommended)

1. Push this repo to GitHub.
2. In Netlify, create a new site from that repo.
3. Netlify auto-detects Next.js and uses `@netlify/plugin-nextjs`.
4. Build command: `npm run build`
5. Publish directory: `.next` (the plugin handles this automatically)
6. Set the environment variables (see Turso setup step 4 above).
7. Deploy.

### Deploy via CLI

```bash
netlify deploy --build
# then when ready to go live:
netlify deploy --prod --build
```

### Custom domain

1. In Netlify: **Site settings > Domain management > Add custom domain**
2. Set domain to `mnemo.joshstrohm.me`.
3. Configure DNS with your registrar (Netlify provides the CNAME target).

## REST API

Mnemo exposes a REST API for external AI agents under `/api/*`. All API routes require `Authorization: Bearer <MNEMO_API_KEY>`.

### Endpoints

#### Export

- `GET /api/export?project=<slug|all|global>&max_chars=<n>&priority=<importance|recent|query>&q=<query>&include_expired=<true|false>` — compiled markdown block (`text/markdown`)
  - Response headers: `X-Mnemo-Tokens` (≈ chars/4 estimate) and `X-Mnemo-Count` (`included/total`).
  - `max_chars` trims the lowest-priority memories to fit a token budget; an omitted-count footer is appended when memories are dropped.
  - `priority=importance` sorts by importance desc then recency; `recent` by `updatedAt` desc; `query` by relevance to `q`.
  - Expired memories (`expiresAt` in the past) are excluded unless `include_expired=true`.
  - Included memories get `lastAccessedAt` updated.

#### Memories

- `GET /api/memories?project=<slug|all|global>&q=<query>&type=<LESSON|CONVENTION|DECISION|FACT>&tag=<tag>&limit=<n>&offset=<n>&sort=<newest|oldest|updated>` — JSON list. Response header `X-Total-Count` gives the total matching count before pagination (`limit` default 50, max 200; `offset` default 0).
- `GET /api/memories/[id]` — single memory (404 if not found). Touches `lastAccessedAt`.
- `POST /api/memories` — create. Body: `{ type, title, content, tags?: string[], projectSlug?, importance?, expiresAt?, source? }`. Detects likely duplicates (same project scope) and returns `409` with `{ error: "possible_duplicate", similar: [...], suggestion }` unless overridden via header `X-Allow-Duplicate: true` or body `{ allowDuplicate: true }`.
- `PUT /api/memories/[id]` — partial update; omit fields to keep their current values. `{ type?, title?, content?, tags?, projectId?, projectSlug?, importance?, expiresAt?, source? }`. Use `projectSlug: null` (or `projectId: null`) for global scope.
- `DELETE /api/memories/[id]` — hard delete; returns `{ ok: true, id }` (404 if not found).

`importance` is 0.0–1.0 (default 0.5). `expiresAt` is an ISO 8601 string. `source` is one of `USER_SAID | AGENT_INFERRED | CORRECTION | IMPORTED`.

#### Search

- `GET /api/search?q=<query>&project=<slug|id|all|global>&k=<n>&include_expired=<true|false>` — JSON array of ranked hits (`{ ...memory, score, matchedTokens }`), sorted by score desc.
  - Hybrid scoring: when an `OPENAI_API_KEY` is configured and memories have embeddings, cosine similarity (0.7) is blended with normalized keyword score (0.3); otherwise pure tokenized keyword scoring (title 3, content 1, tag 5, and `q` tokens containing a 3+ digit run e.g. an IP get a 10-point exact match) plus a small recency boost.
  - Without `OPENAI_API_KEY`, search still works via the keyword path.

### Embeddings (optional)

Set `OPENAI_API_KEY` to enable OpenAI `text-embedding-3-small` embeddings. On create/update, embeddings are generated asynchronously (best-effort, never blocks the response). `EMBEDDINGS_ENABLED` auto-activates when the key is present; the app degrades gracefully to keyword search when unset.

### Python client scripts

`scripts/` ships ready-to-run clients (shared `mnemo_common.py`). Auth config loads `~/code/mnemo/.env` then falls back to `~/.hermes/.env`; requests retry twice (1s backoff) on 5xx.

```bash
python scripts/session_export.py --format markdown --project hermes --max-chars 4000   # GET /api/export
python scripts/session_export.py --format json --project all --offset 0 --limit 200     # GET /api/memories
python scripts/store_memory.py --type FACT --title "VPS IP" --content "195.26.248.26" \
  --project-slug hermes --tags vps,infra --importance 0.8 --source USER_SAID
python scripts/update_memory.py --id <id> --title "New title" --content "New body"
python scripts/delete_memory.py --id <id>
python scripts/search_memory.py --q "front bolt keys" --project my-house --k 5
python scripts/backfill_embeddings.py --dry-run        # then without --dry-run to generate
```

## Database migrations

Schema changes are additive and safe for existing data. The canonical schema lives in `schema.sql` (idempotent `CREATE TABLE IF NOT EXISTS` + indexes).

To apply the Tier 1 migration (adds `importance`, `expiresAt`, `lastAccessedAt`, `source`, `embedding` and the `updatedAt` index) to an existing Turso database:

```bash
npm run db:migrate        # runs scripts/migrate.mjs against DATABASE_URL (idempotent)
npm run db:apply          # applies the full schema.sql (safe for fresh databases)
```

`scripts/migrate.mjs` continues past per-statement errors (e.g. a column already exists), so re-running is a no-op. The migration file is `db/migrations/0001_tier1.sql` for manual review/application.