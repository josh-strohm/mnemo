-- Tier 3 migration — additive columns for pinning, export settings, audit, api-keys.
-- Safe to run against a Tier 2 database (errors swallowed by runner).
-- Re-runnable: ALTER TABLE ADD COLUMN errors ignored, CREATE IF NOT EXISTS used.

-- Memory: pinned + embedding model + sourceMessageId
ALTER TABLE "Memory" ADD COLUMN "isPinned" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Memory" ADD COLUMN "embeddingModel" TEXT;
ALTER TABLE "Memory" ADD COLUMN "sourceMessageId" TEXT;

-- Project: per-project export behaviour
ALTER TABLE "Project" ADD COLUMN "exportTemplate" TEXT;
ALTER TABLE "Project" ADD COLUMN "maxExportChars" INTEGER;
ALTER TABLE "Project" ADD COLUMN "includeGlobal" INTEGER NOT NULL DEFAULT 1;

-- Indexes for new Memory columns (may already exist for isPinned in fresh schema)
CREATE INDEX IF NOT EXISTS "Memory_isPinned_idx" ON "Memory"("isPinned");
CREATE INDEX IF NOT EXISTS "Memory_sourceSessionId_idx" ON "Memory"("sourceSessionId");

-- ApiKey table
CREATE TABLE IF NOT EXISTS "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT '[]',
    "expiresAt" DATETIME,
    "lastUsedAt" DATETIME,
    "isActive" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE INDEX IF NOT EXISTS "ApiKey_isActive_idx" ON "ApiKey"("isActive");
CREATE INDEX IF NOT EXISTS "ApiKey_expiresAt_idx" ON "ApiKey"("expiresAt");

-- AuditLog table
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "memoryId" TEXT,
    "projectId" TEXT,
    "actorIp" TEXT,
    "userAgent" TEXT,
    "apiKeyId" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX IF NOT EXISTS "AuditLog_memoryId_idx" ON "AuditLog"("memoryId");
CREATE INDEX IF NOT EXISTS "AuditLog_projectId_idx" ON "AuditLog"("projectId");
