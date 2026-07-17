# Mnemo MVP Spec

## Design decisions

- **Projects**: first-class entity (`Project` model, projects pages, memories FK to it). A memory with `projectId = null` is **global**.
- **Memory type**: fixed vocabulary `LESSON | CONVENTION | DECISION | FACT`. Stored as `String` (SQLite has no Prisma `enum`); enforced at the boundary via a TS `const` + Zod enum.
- **Tags**: stored as a `String` column containing a **JSON array** (e.g. `'["bug","ui"]'`). Serialized on write and parsed on read inside `src/lib` via a Zod transform. Tag filtering happens in app code after querying (no DB-level tag predicate for v1).
- **Export**: `/export` page with a project picker. Compiling a project includes that project's memories plus all global memories, grouped by type in this order: Conventions, Lessons, Decisions, Facts. Block is wrapped with `<!-- BEGIN:mnemo -->` / `<!-- END:mnemo -->`. Copy-to-clipboard button, no repo writes.
- **Mutation layer**: Server Actions only for v1, but all business logic lives in plain functions under `src/lib/` — actions are thin wrappers; no logic inside action bodies.
- **Auth**: none. Fully open local dev, single trusted user.
- **Home** redirects to `/memories`.

## Data model

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "sqlite"; url = env("DATABASE_URL") }

model Project {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  memories  Memory[]
}

model Memory {
  id        String   @id @default(cuid())
  type      String                       // enforced via Zod: "LESSON"|"CONVENTION"|"DECISION"|"FACT"
  title     String
  content   String
  tags      String                       // JSON-encoded array, e.g. '["bug","ui"]' — serialize/parse in src/lib
  projectId String?
  project   Project?  @relation(fields: [projectId], references: [id], onDelete: SetNull)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([projectId])
  @@index([type])
}
```

`onDelete: SetNull` — deleting a `Project` does not destroy its memories; their `projectId` becomes `null`, i.e. they become global memories and still appear in every project's export.

## Pages / routes (App Router, `src/app/`)

- `layout.tsx` — root layout + nav (Memories / Projects / Export); metadata.
- `page.tsx` — `redirect("/memories")`.
- `/memories` — list (server component). Reads `searchParams` (`q`, `type`, `project`, `tag`) -> `listMemories`. GET search/filter form. Tag filter is applied in app code after the query.
- `/memories/new` — create form -> `createMemoryAction`.
- `/memories/[id]` — view + edit + delete. Edit -> `updateMemoryAction`; delete -> `deleteMemoryAction`.
- `/projects` — list projects, each linking to detail + "Export this project" shortcut.
- `/projects/new` — create form -> `createProjectAction`.
- `/projects/[id]` — detail: name/slug, its memories, delete form -> `deleteProjectAction`.
- `/export` — export page: project picker, compiled block, copy button (client island).

## API surface (`src/lib/` + thin actions)

`src/lib/`
- `db.ts` — Prisma client singleton.
- `schemas.ts` — Zod schemas incl. `memoryTypeSchema`, `memoryCreateSchema`/`memoryUpdateSchema` (with tag-array transform: `string` <-> `string[]`), `projectCreateSchema`, `memoryFiltersSchema` (search params).
- `projects.ts` — `listProjects()`, `getProject(id)`, `getProjectBySlug(slug)`, `createProject(input)`, `deleteProject(id)`.
- `memories.ts` — `listMemories(filters)` (returns memories with `tags` parsed to `string[]`; applies `q`/`type`/`project` filters at the DB level and the `tag` filter in app code), `getMemory(id)`, `createMemory(input)` (serializes tags to JSON string), `updateMemory(id, input)`, `deleteMemory(id)`.
- `export.ts` — `compileExport(projectId | "global" | "all")` -> `string`. Pulls target project's memories + all global (`projectId IS NULL`), groups by type in fixed order, wraps with mnemo delimiters.

`src/app/actions.ts` (`'use server'`):
- `createMemoryAction(formData)`, `updateMemoryAction(formData)`, `deleteMemoryAction(formData)`, `createProjectAction(formData)`, `deleteProjectAction(formData)`

Each action: parse FormData -> validate with Zod (throw on invalid) -> call lib fn -> `revalidatePath` -> `redirect` where appropriate. No business logic in the action body.

## Export block format

```markdown
<!-- BEGIN:mnemo -->
## Conventions
- **[title]** — content #tag

## Lessons
- ...

## Decisions
- ...

## Facts
- ...
<!-- END:mnemo -->
```

Global memories merge into every project's compile. Types omitted if empty.

## Build plan (8 tasks; each ends with `npm run check` passing + a commit)

1. **Prisma setup.** Install `prisma` + `@prisma/client`; `prisma init`; write `schema.prisma` (Project + Memory, `type` String, `tags` String JSON, `onDelete: SetNull`); add `.env` with `DATABASE_URL="file:./dev.db"`; gitignore `.env` and `dev.db` and `prisma/migrations/`; add `db:push` script; `src/lib/db.ts` singleton; first `prisma db push`. -> `check` + commit.
2. **Zod schemas + lib logic.** `src/lib/schemas.ts` + `projects.ts` + `memories.ts` (pure functions, exported; unused-for-now OK). -> `check` + commit.
3. **Server Actions.** `src/app/actions.ts` thin wrappers + `revalidatePath`/`redirect`. -> `check` + commit.
4. **Layout + nav + home redirect.** Replace defaults; nav (Memories/Projects/Export); `page.tsx` -> `redirect("/memories")`. -> `check` + commit.
5. **Memories list + search.** `/memories` server component with `searchParams` + GET filter form; tag filter applied in app code. -> `check` + commit.
6. **Memory create + edit.** `/memories/new`, `/memories/[id]` (view/edit/delete), type dropdown, project dropdown, comma-separated tag input (transformed via Zod). -> `check` + commit.
7. **Projects CRUD pages.** `/projects`, `/projects/new`, `/projects/[id]`. -> `check` + commit.
8. **Export page.** `src/lib/export.ts` `compileExport` + `/export` page with project picker, `<pre>` block, copy-to-clipboard client island. -> `check` + commit.

New dep additions (Prisma only) live in task 1, called out per AGENTS.md.