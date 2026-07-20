-- Tier 1 migration — additive columns + index for the Memory table.
-- Safe to apply against an existing Turso libsql database: no data is dropped
-- or rewritten. All new columns are nullable or have defaults, so existing
-- rows keep working (importance defaults to 0.5).
--
-- Apply once with:  npm run db:migrate
-- (scripts/migrate.mjs runs every statement in this file against DATABASE_URL.)
-- If a column already exists, the corresponding ALTER will error and the
-- runner continues to the next statement; re-running is effectively a no-op.

ALTER TABLE "Memory" ADD COLUMN "importance" REAL NOT NULL DEFAULT 0.5;
ALTER TABLE "Memory" ADD COLUMN "expiresAt" DATETIME;
ALTER TABLE "Memory" ADD COLUMN "lastAccessedAt" DATETIME;
ALTER TABLE "Memory" ADD COLUMN "source" TEXT;
ALTER TABLE "Memory" ADD COLUMN "embedding" TEXT;

CREATE INDEX IF NOT EXISTS "Memory_updatedAt_idx" ON "Memory"("updatedAt");