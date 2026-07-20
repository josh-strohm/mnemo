-- CreateTable
CREATE TABLE IF NOT EXISTS "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Memory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "projectId" TEXT,
    "importance" REAL NOT NULL DEFAULT 0.5,
    "expiresAt" DATETIME,
    "lastAccessedAt" DATETIME,
    "source" TEXT,
    "embedding" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Memory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Memory_projectId_idx" ON "Memory"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Memory_type_idx" ON "Memory"("type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Memory_updatedAt_idx" ON "Memory"("updatedAt");