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
- `npm run db:push` — push schema to database
- `npm run db:generate` — regenerate Prisma client

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

- `GET /api/export?project=<slug>` — compiled markdown block (`text/markdown`)
- `GET /api/memories?project=<slug>` — JSON list of memories
- `POST /api/memories` — create a memory (JSON body: `{ type, title, content, tags?, projectSlug? }`)