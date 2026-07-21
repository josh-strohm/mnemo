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

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | `file:./dev.db` for local; `libsql://<…>.turso.io` for production |
| `TURSO_AUTH_TOKEN` | yes in prod | Turso auth token |
| `MNEMO_API_KEY` | yes in prod | Bearer + cookie auth; admin key. Set this BEFORE other Tier 3 routes can do anything useful |
| `OPENAI_API_KEY` | optional | Enables `text-embedding-3-small` embeddings for `/api/search`, `/api/context`, and duplicate detection. Without it, search falls back to tokenized keyword scoring |
| `MNEMO_BASE_URL` | optional | Override base URL for the Python client scripts (default `https://mnemo.joshstrohm.me`) |
| `WEBHOOK_URL` | optional (Tier 3) | POST URL fired on every mutation. Body is `{event, timestamp, data}` |
| `WEBHOOK_SECRET` | optional (Tier 3) | When set, the body is HMAC-SHA256-signed and sent as `X-Mnemo-Signature: sha256=<hex>`. 3× retry with backoff |
| `RATE_LIMIT_RPM` | optional (Tier 3) | Per-IP sliding-window requests/minute (default 100) |
| `COHERE_API_KEY` | optional (Tier 3) | Enables Cohere rerank on top of `/api/context` hits |
| `RERANK_ENABLED` | optional (Tier 3) | Force local-rerank path even without Cohere |

In Netlify, set these in **Site settings > Environment variables** (see Turso setup below).

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

- `GET /api/export?project=<slug|all|global>&max_chars=<n>&priority=<importance|recent|query>&q=<query>&include_expired=<true|false>&format=<markdown|json|hermes-txt>` — compiled memory bundle, default `markdown` (`text/markdown`).
  - `format=markdown` (default): `<!-- BEGIN:mnemo -->…<!-- END:mnemo -->` block.
  - `format=json`: structured `{ schema: "mnemo.memories.v1", generatedAt, count, memories: [...] }` (`application/json`).
  - `format=hermes-txt`: compact one-line-per-memory transcript, pipe-separated fields (`type | title | content | #tags | imp | updated`), `text/plain`.
  - Response headers: `X-Mnemo-Tokens` (≈ chars/4 estimate) and `X-Mnemo-Count` (`included/total`).
  - `max_chars` trims the lowest-priority memories to fit a token budget; an omitted-count footer is appended when memories are dropped.
  - `priority=importance` sorts by importance desc then recency; `recent` by `updatedAt` desc; `query` by relevance to `q`.
  - Expired memories (`expiresAt` in the past) are excluded unless `include_expired=true`. Soft-deleted memories (`deletedAt` set) are always excluded.
  - Included memories get `lastAccessedAt` updated.

#### Memories

- `GET /api/memories?project=<slug|all|global>&q=<query>&type=<LESSON|CONVENTION|DECISION|FACT>&tag=<tag>&limit=<n>&offset=<n>&sort=<newest|oldest|updated>&include_deleted=<true|false>` — JSON list. Response header `X-Total-Count` gives the total matching count before pagination (`limit` default 50, max 200; `offset` default 0). Soft-deleted memories are excluded by default; pass `include_deleted=1` to list them.
- `GET /api/memories/[id]?expand=related` — single memory (404 if not found). Touches `lastAccessedAt`. `?expand=related` populates a `relatedMemories: [...]` array parsed from the memory's `relatedIds` (links to deleted memories are stripped).
- `POST /api/memories` — create. Body: `{ type, title, content, tags?: string[], projectSlug?, importance?, expiresAt?, source? }`. When `importance` is omitted, the targeted project's `defaultImportance` is used (global defaults to 0.5). Detects likely duplicates (same project scope) and returns `409` with `{ error: "possible_duplicate", similar: [...], suggestion }` unless overridden via header `X-Allow-Duplicate: true` or body `{ allowDuplicate: true }`.
- `POST /api/memories/batch` — bulk create. Body: `{ memories: [...] (1..50), allowDuplicate?: bool, createMissingProjects?: bool (default true) }`. Each entry uses the same schema as `POST /api/memories`. Per-entry results in `data.results` with `status` of `created` / `duplicate` / `error`. Returns `200` when everything was created, `207` otherwise. Embeddings are generated fire-and-forget per created memory.
- `POST /api/memories/batch-delete` — bulk delete. Body: `{ ids: string[] (1..100, de-duped server-side), hard?: bool }`. Returns `{ results: [{ id, ok, soft?, error? }], soft, hard, missing }`. Status `200` when every id existed, `207` when any were missing. Without `hard`, deletes are soft.
- `PUT /api/memories/[id]` — partial update; omit fields to keep their current values. `{ type?, title?, content?, tags?, projectId?, projectSlug?, importance?, expiresAt?, source? }`. Use `projectSlug: null` (or `projectId: null`) for global scope. A version snapshot of the pre-update state is recorded.
- `DELETE /api/memories/[id]?hard=<true|false>` — soft delete by default (sets `deletedAt`, recoverable from `/trash`); returns `{ ok: true, soft: true, id }`. `?hard=true` permanently removes the row (after recording a version snapshot of the current state). 404 if not found.
- `POST /api/memories/[id]/restore` — undelete (empty body) → `restoreMemory`; or restore a specific version (body `{ versionId }`) → re-applies that snapshot to the memory while first snapshotting the current state (so the restore itself is reversible). Returns the updated memory.
- `GET | POST /api/memories/[id]/links` — graph links. `GET` returns `{ relatedMemories: [...] }`. `POST` body: `{ add?: string[], remove?: string[] }` (at least one non-empty) — validates existence, refuses self-links, dedupes, caps at 20 links per memory, then returns the updated `{ relatedMemories: [...] }`.

`importance` is 0.0–1.0 (default 0.5). `expiresAt` is an ISO 8601 string. `source` is one of `USER_SAID | AGENT_INFERRED | CORRECTION | IMPORTED`.

#### Trash & history

- `GET /api/trash` — list soft-deleted memories (`listDeleted`).
- The web UI has a `/trash` page with **Restore** (undelete) and **Delete forever** (hard delete) actions, and a **History** panel on each memory detail page listing every version snapshot with a per-version **Restore this version** action.

#### Tags

- `GET /api/tags?project=<slug|id|global|all>` — `{ tags: [{ tag, count }], total }` aggregated across non-deleted memories, sorted by count desc then tag asc. 404 on unknown project slug. Used for tag clouds / project stats.

#### Search

- `GET /api/search?q=<query>&project=<slug|id|all|global>&k=<n>&include_expired=<true|false>` — JSON array of ranked hits (`{ ...memory, score, matchedTokens }`), sorted by score desc.
  - **FTS5 candidate narrowing**: when the query has usable tokens, candidate ids are pulled from the `MemoryFts` virtual table (porter unicode61 tokenizer) before app-side scoring — replacing the exhaustive in-memory scan. Falls back to the full scan when FTS yields nothing or is unavailable, so recall is preserved.
  - Hybrid scoring: when an `OPENAI_API_KEY` is configured and memories have embeddings, cosine similarity (0.7) is blended with normalized keyword score (0.3); otherwise pure tokenized keyword scoring (title 3, content 1, tag 5, and `q` tokens containing a 3+ digit run e.g. an IP get a 10-point exact match) plus a small recency boost.
  - Without `OPENAI_API_KEY`, search still works via the keyword path. Soft-deleted and expired memories are never returned by `/api/search`.

### Embeddings (optional)

Set `OPENAI_API_KEY` to enable OpenAI `text-embedding-3-small` embeddings. On create/update, embeddings are generated asynchronously (best-effort, never blocks the response). `EMBEDDINGS_ENABLED` auto-activates when the key is present; the app degrades gracefully to keyword search when unset.

### Python client scripts

`scripts/` ships ready-to-run clients (shared `mnemo_common.py`). Auth config loads `~/code/mnemo/.env` then falls back to `~/.hermes/.env`; requests retry twice (1s backoff) on 5xx.

```bash
# Memory lifecycle
python scripts/session_export.py --format markdown --project hermes --max-chars 4000   # GET /api/export
python scripts/session_export.py --format json --project all --offset 0 --limit 200     # GET /api/memories
python scripts/session_export.py --format hermes-txt --project all                      # one line per memory
python scripts/store_memory.py --type FACT --title "VPS IP" --content "195.26.248.26" \
  --project-slug hermes --tags vps,infra --importance 0.8 --source USER_SAID
python scripts/update_memory.py --id <id> --title "New title" --content "New body"
python scripts/delete_memory.py --id <id>
python scripts/search_memory.py --q "front bolt keys" --project my-house --k 5 --format compact
python scripts/backfill_embeddings.py --dry-run        # then without --dry-run to generate

# Bulk import (new in Tier 2)
python scripts/bulk_import.py memories.json --project-slug hermes      # POST /api/memories/batch
cat memories.json | python scripts/bulk_import.py - --allow-duplicate
python scripts/bulk_import.py memories.json --dry-run                  # validate only
```

### Tier 3 — context, import, admin, audit, api-keys, webhooks

Mnemo now ships query-scoped, budget-aware context assembly, an
`<!-- BEGIN:mnemo -->` block importer, an admin dashboard, an audit log,
per-agent API keys, and HMAC-signed webhook delivery on mutations.

#### Tier 3 — Context assembly

- `GET /api/context?project=<slug|id|all|global>&q=<query>&budget=<n>&always_include=<memoryId,memoryId>&include_expired=<true|false>&format=<markdown|hermes-txt|json>&include_global=<true|false>` — Tier 3 budget-aware assembly.
  - When `q` is provided: hybrid search (FTS5 + OpenAI embeddings), optional Cohere/local rerank (`COHERE_API_KEY` or `RERANK_ENABLED=true`).
  - `budget` is a char budget (default 3500). Pinned memories (`isPinned=true`) **always** survive the budget; non-pinned memories fill the rest by `importance*score`.
  - `always_include=<ids>` — comma-separated memory ids guaranteed to be in the output (e.g. house keys, agent sign-off).
  - Response headers: `X-Mnemo-Tokens`, `X-Mnemo-Count`, `X-Mnemo-Omitted`, `X-Mnemo-Budget`, `X-Mnemo-Rerank` (true|false).
  - This is the endpoint intended to replace `/api/export` for agent session-start uses where the budget is finite and the query is known.

#### Tier 3 — Import BEGIN/END mnemo blocks

- `POST /api/import` — body `{ content: "<!-- BEGIN:mnemo -->...<!-- END:mnemo -->", projectSlug?, allowDuplicate?, source?, createMissingProjects? }`. Parses every BEGIN/END block in `content` into memory entries and bulk-creates. Returns `{ created, duplicates, errors, parsedEntries, results: [...] }` with per-entry `status` of `created | duplicate | error`.
- `POST /api/import/hermes` — body `{ entries: [{ text, type?, title?, tags?, projectSlug? }], allowDuplicate?, projectSlug? }`. Reconciles Hermes built-in `MEMORY.md` lines with Mnemo (each entry → one FACT memory, deduped). Returns the same `{ created, duplicates, errors, results }` shape.

#### Tier 3 — Admin

- `GET /api/admin/stats` — JSON snapshot of totals, embedding coverage %, FTS row count, top tags, last 10 versions, audit-log count, API-key count, per-project active/deleted/lastUpdate. The web UI `/admin` page renders this.
- `GET /api/admin/audit?action=<str>&memoryId=<id>&projectId=<id>&limit=<n>&offset=<n>` — paginated audit log; the web UI has `/admin/audit`.
- `GET /api/admin/expiring?days=<n>&project=<slug|global|all>` — list of non-deleted memories whose `expiresAt` is within `days`.
- `GET /api/admin/backup` — streams a full JSON dump `{ schema: "mnemo.backup.v1", projects, memories, versions, counts }` as a downloadable `application/json` attachment.

#### Tier 3 — Per-agent API keys

- `GET /api/api-keys` — list active/known keys (no plaintext shown).
- `POST /api/api-keys` — body `{ name, scopes: string[], expiresAt? }`. Returns the plaintext token **exactly once** (`{ id, name, scopes, token, ... }`). Store it now — it cannot be retrieved later.
- `DELETE /api/api-keys/[id]?hard=true` — revoke (default) or hard-delete.
- Auth scopes: `admin:read`, `admin:write`, `memory:read`, `memory:write`, `memory:delete`, `project:read`, `project:write`, `project:delete`, `search:read`, `context:read`, `export:read`, `import:write`, `backup:read`, `audit:read`. `admin:write` implies all.
- Per-agent tokens are SHA-256-hashed in storage; verification uses constant-time hash lookup.

#### Tier 3 — Audit & webhooks

- Every mutating API route emits an `AuditLog` row (action, memoryId, projectId, actorIp, userAgent, apiKeyId, metadata) and fires a HMAC-signed webhook when `WEBHOOK_URL` is set:
  - Header `X-Mnemo-Signature: sha256=<hex>` over the JSON body using `WEBHOOK_SECRET`.
  - Retries 3× with linear backoff (700ms / 1400ms / 2100ms), 8s timeout per attempt.
  - Events: `memory.created`, `memory.updated`, `memory.deleted`, `memory.soft_deleted`, `memory.restored`, `memory.batch_created`, `memory.batch_deleted`, `memory.imported`.
- Audit/webhook failures never break the request — they log and move on.

#### Tier 3 — Rate limiting

- Only `/api/*` requests are checked against a per-IP sliding window: default **100 req/min** (`RATE_LIMIT_RPM` env to override). UI navigation, RSC roundtrips, prefetches, and asset loads are not counted. 429 with `Retry-After` on overflow.
- The window is **in-memory per Netlify instance** — sufficient for spam mitigation, not for global limiting. For multi-region strong limiting, front Mnemo with Cloudflare or use Upstash Redis.

#### Tier 3 — Per-project export defaults

`Project` now stores `exportTemplate` (`markdown|hermes-txt|json`), `maxExportChars`, and `includeGlobal` (default true). The web UI lets you edit these per project; they are only defaults — callers can still override via query string.

#### OpenAPI

- `GET /api/openapi.json` — minimal OpenAPI 3.1 document of every route. Unauthenticated for codegen tools. Cached 10 min.

### Tier 3 — Python client scripts

```bash
# Tier 3 ops
python scripts/backup.py -o ~/mnemo-backup.json                # GET /api/admin/backup
python scripts/import_block.py ~/AGENTS.md --project-slug hermes  # POST /api/import
echo "<!-- BEGIN:mnemo --><!-- END:mnemo -->" | python scripts/import_block.py -
python scripts/reconcile.py --project hermes --root ~/code     # scan AGENTS.md/CLAUDE.md, report drift vs /api/export
python scripts/mnemo_compact_report.py --threshold 0.88 -o ./dupes.md
python scripts/mnemo_compact_report.py --discord-webhook https://discord.com/api/webhooks/<id>
```

### Tier 3 — Agent recipes

```bash
# Hermes session-start: budget-aware context for the active project
python scripts/session_export.py --project hermes --max-chars 1500 --priority query --q "deploy"

# Or use the dedicated /api/context endpoint via curl:
curl -sH "Authorization: Bearer ***" \
  "https://mnemo.joshstrohm.me/api/context?project=hermes&q=deploy&budget=1500&always_include=house_keys_id"
```

## Database migrations

Schema changes are additive and safe for existing data. The canonical schema lives in `schema.sql` (idempotent `CREATE TABLE IF NOT EXISTS` + indexes).

To apply the Tier 1 migration (adds `importance`, `expiresAt`, `lastAccessedAt`, `source`, `embedding` and the `updatedAt` index) to an existing Turso database:

```bash
npm run db:migrate        # runs scripts/migrate.mjs against DATABASE_URL (idempotent)
npm run db:apply          # applies the full schema.sql (safe for fresh databases)
```

`scripts/migrate.mjs` continues past per-statement errors (e.g. a column already exists), so re-running is a no-op. The migration file is `db/migrations/0001_tier1.sql` for manual review/application.

### Tier 2 migration

`db/migrations/0002_tier2.sql` is additive and safe on top of a Tier-1 database. It adds:

- to `Memory`: `relatedIds` (JSON string default `"[]"`), `deletedAt` (nullable, indexed), `sourceSessionId`, `createdBy`, `sourceUrl`.
- the `MemoryVersion` table (FK to `Memory` with `onDelete: Cascade`) storing JSON snapshots before each mutating update, plus a versioning library in `src/lib/versions.ts` (`createVersionSnapshot`, `listVersions`, `getVersion`, `restoreVersion`).
- to `Project`: `description`, `color`, `icon`, `defaultImportance` (default 0.5), `isArchived`.
- the `MemoryFts` FTS5 virtual table (porter unicode61 tokenizer) with `AFTER INSERT/UPDATE/DELETE` triggers keeping it in sync with `Memory`, and a one-shot backfill of existing rows.

```bash
npm run db:migrate        # applies any unapplied migrations (idempotent)
```

### Tier 3 migration

`db/migrations/0003_tier3.sql` is additive and safe on top of a Tier-2 database. It adds:

- to `Memory`: `isPinned` (default false, indexed), `embeddingModel`, `sourceMessageId`.
- to `Project`: `exportTemplate`, `maxExportChars`, `includeGlobal` (default true).
- the `ApiKey` table — `id`, `keyHash` (SHA-256, unique), `name`, `scopes` (JSON array), `expiresAt`, `lastUsedAt`, `isActive`, timestamps. Indexes on `isActive` and `expiresAt`. Helpers in `src/lib/apiKeys.ts`.
- the `AuditLog` table — `id`, `action` (string: create/update/delete/soft_delete/restore/search/export/batch_create/batch_delete/import/backup/context/api_key_create/api_key_revoke), `memoryId`, `projectId`, `actorIp`, `userAgent`, `apiKeyId`, `metadata` (JSON), `createdAt`. Indexed by createdAt, action, memoryId, projectId. Helpers in `src/lib/audit.ts`.
- New Memory indexes: `Memory_isPinned_idx`, `Memory_sourceSessionId_idx`.

```bash
npm run db:migrate        # applies any unapplied migrations (idempotent)
```

After the migration, rotate existing memories via `python scripts/backfill_embeddings.py --dry-run` to ensure `embeddingModel` is populated for any embeddings created before Tier 3 (optional — embeddings already work without it).
