import { prisma } from "@/lib/db";
import type { MemoryWithTags } from "@/lib/memories";

export type MemoryVersionRow = {
  id: string;
  memoryId: string;
  version: number;
  title: string;
  content: string;
  tags: string;
  type: string;
  importance: number;
  projectId: string | null;
  source: string | null;
  createdAt: Date;
};

function toRow(v: {
  id: string;
  memoryId: string;
  version: number;
  title: string;
  content: string;
  tags: string;
  type: string;
  importance: number;
  projectId: string | null;
  source: string | null;
  createdAt: Date;
}): MemoryVersionRow {
  return {
    id: v.id,
    memoryId: v.memoryId,
    version: v.version,
    title: v.title,
    content: v.content,
    tags: v.tags,
    type: v.type,
    importance: v.importance,
    projectId: v.projectId,
    source: v.source,
    createdAt: v.createdAt,
  };
}

function stringifyTagsForSnapshot(tags: string[] | string): string {
  if (Array.isArray(tags)) return JSON.stringify(tags);
  // already a JSON string from the DB
  return tags;
}

/**
 * Snapshot the current state of `memory` as a new MemoryVersion row before
 * it gets mutated. Increments the version number from the existing max.
 * Safe to call when no prior versions exist (starts at version 1).
 */
export async function createVersionSnapshot(
  memory: MemoryWithTags,
): Promise<MemoryVersionRow | null> {
  return createSnapshotFromRow({
    id: memory.id,
    title: memory.title,
    content: memory.content,
    tags: stringifyTagsForSnapshot(memory.tags),
    type: memory.type,
    importance: memory.importance,
    projectId: memory.projectId,
    source: memory.source,
  });
}

async function createSnapshotFromRow(row: {
  id: string;
  title: string;
  content: string;
  tags: string;
  type: string;
  importance: number;
  projectId: string | null;
  source: string | null;
}): Promise<MemoryVersionRow | null> {
  const max = await prisma.memoryVersion.aggregate({
    where: { memoryId: row.id },
    _max: { version: true },
  });
  const next = (max._max.version ?? 0) + 1;

  const created = await prisma.memoryVersion.create({
    data: {
      memoryId: row.id,
      version: next,
      title: row.title,
      content: row.content,
      tags: row.tags,
      type: row.type,
      importance: row.importance,
      projectId: row.projectId,
      source: row.source,
    },
  });
  return toRow(created);
}

export async function listVersions(
  memoryId: string,
): Promise<MemoryVersionRow[]> {
  const rows = await prisma.memoryVersion.findMany({
    where: { memoryId },
    orderBy: { version: "desc" },
  });
  return rows.map(toRow);
}

export async function getVersion(
  id: string,
): Promise<MemoryVersionRow | null> {
  const v = await prisma.memoryVersion.findUnique({ where: { id } });
  return v ? toRow(v) : null;
}

export type RestoredVersion = {
  version: MemoryVersionRow;
  snapshotBeforeRestore: MemoryVersionRow;
  memory: MemoryWithTags;
};

/**
 * Restore a memory to a previous version. Snapshots the CURRENT state first
 * (so the restore itself is undoable), then applies the version's fields via
 * updateMemoryPartial. Returns the new snapshot and the restored memory.
 *
 * Caller must import updateMemoryPartial itself to avoid a circular import.
 */
export async function restoreVersion(
  memoryId: string,
  versionId: string,
  apply: (
    id: string,
    fields: {
      type: string;
      title: string;
      content: string;
      tags: string[];
      projectId: string | null;
      importance: number;
      source: string | null;
    },
  ) => Promise<MemoryWithTags | null>,
): Promise<RestoredVersion | null> {
  const version = await prisma.memoryVersion.findUnique({
    where: { id: versionId, memoryId },
  });
  if (!version) return null;

  const current = await prisma.memory.findUnique({
    where: { id: memoryId },
  });
  if (!current) return null;

  // Snapshot current state first so the restore is undoable.
  const snapshotBefore = await createSnapshotFromRow(current);

  const restored = await apply(memoryId, {
    type: version.type,
    title: version.title,
    content: version.content,
    tags: parseTags(version.tags),
    projectId: version.projectId,
    importance: version.importance,
    source: version.source,
  });

  if (!restored) return null;
  const latest = (await listVersions(memoryId))[0] ?? null;
  return {
    version: toRow(version),
    snapshotBeforeRestore: snapshotBefore ?? latest!,
    memory: restored,
  } as RestoredVersion;
}

function parseTags(s: string): string[] {
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === "string");
    }
  } catch {
    // not JSON
  }
  return [];
}