-- Tier 2 migration — additive columns, MemoryVersion table, FTS5 virtual
-- table + sync triggers, and the MemoryVersion indexes.
-- Safe to run against an existing Tier 1 database (and re-runnable):
--   * ALTER TABLE ADD COLUMN errors are swallowed by the runner
--   * CREATE TABLE/INDEX/TRIGGER use IF NOT EXISTS
--   * Existing memories get relatedIds='[]', deletedAt=NULL, defaults apply.
--   * MemoryVersion starts empty (version count begins at 0).
--   * MemoryFts is backfilled from existing rows on first run.
-- Apply with:  npm run db:migrate -- db/migrations/0002_tier2.sql

ALTER TABLE "Memory" ADD COLUMN "relatedIds" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Memory" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Memory" ADD COLUMN "sourceSessionId" TEXT;
ALTER TABLE "Memory" ADD COLUMN "createdBy" TEXT;
ALTER TABLE "Memory" ADD COLUMN "sourceUrl" TEXT;

ALTER TABLE "Project" ADD COLUMN "description" TEXT;
ALTER TABLE "Project" ADD COLUMN "color" TEXT;
ALTER TABLE "Project" ADD COLUMN "icon" TEXT;
ALTER TABLE "Project" ADD COLUMN "defaultImportance" REAL NOT NULL DEFAULT 0.5;
ALTER TABLE "Project" ADD COLUMN "isArchived" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "Memory_deletedAt_idx" ON "Memory"("deletedAt");
CREATE INDEX IF NOT EXISTS "Project_isArchived_idx" ON "Project"("isArchived");

CREATE TABLE IF NOT EXISTS "MemoryVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memoryId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "importance" REAL NOT NULL DEFAULT 0.5,
    "projectId" TEXT,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemoryVersion_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "Memory" ("id") ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "MemoryVersion_memoryId_idx" ON "MemoryVersion"("memoryId");
CREATE INDEX IF NOT EXISTS "MemoryVersion_memoryId_version_idx" ON "MemoryVersion"("memoryId", "version");
CREATE UNIQUE INDEX IF NOT EXISTS "MemoryVersion_memoryId_version_key" ON "MemoryVersion"("memoryId", "version");

CREATE VIRTUAL TABLE IF NOT EXISTS "MemoryFts" USING fts5(
    memoryId UNINDEXED,
    title,
    content,
    tags,
    tokenize = 'porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS "Memory_ai" AFTER INSERT ON "Memory" BEGIN
    INSERT INTO "MemoryFts"("memoryId", "title", "content", "tags")
    VALUES (new."id", new."title", new."content", new."tags");
END;

CREATE TRIGGER IF NOT EXISTS "Memory_ad" AFTER DELETE ON "Memory" BEGIN
    DELETE FROM "MemoryFts" WHERE "memoryId" = old."id";
END;

CREATE TRIGGER IF NOT EXISTS "Memory_au" AFTER UPDATE ON "Memory" BEGIN
    DELETE FROM "MemoryFts" WHERE "memoryId" = old."id";
    INSERT INTO "MemoryFts"("memoryId", "title", "content", "tags")
    VALUES (new."id", new."title", new."content", new."tags");
END;

-- Backfill FTS from existing rows (no-op on a fresh DB; idempotent via
-- delete-then-insert since triggers fire AFTER UPDATE, start empty).
INSERT INTO "MemoryFts"("memoryId", "title", "content", "tags")
SELECT "id", "title", "content", "tags" FROM "Memory"
WHERE "id" NOT IN (SELECT "memoryId" FROM "MemoryFts");