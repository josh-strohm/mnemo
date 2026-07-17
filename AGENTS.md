<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Mnemo

Agent memory manager: stores memories (lessons, conventions, decisions, facts) with tags/scopes, retrieves relevant ones, and compiles them into CLAUDE.md files for other projects.

## Stack
- Next.js 16 (App Router) + TypeScript + Tailwind v4
- Prisma + SQLite (dev), Zod for validation
- src/ directory, "@/*" import alias

## Commands
- `npm run dev` — dev server
- `npm run check` — typecheck + lint. **Run this after every change. All work must pass before reporting done.**

## Workflow rules
- Commit after each working step with a clear message. Never commit if `npm run check` fails.
- Prefer small, targeted diffs. Do not refactor unrelated code.
- Do not add dependencies without stating why.
- If a spec exists in specs/, follow it exactly; ask before deviating.

## Conventions
- Server components by default; "use client" only when needed.
- Validate all external input with Zod at the boundary.
- No `any`. Fix type errors properly, don't suppress them.