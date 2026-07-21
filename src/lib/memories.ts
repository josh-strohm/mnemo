import { prisma } from "@/lib/db";
import { scoreMemoryAgainstQuery, tokenizeQuery } from "@/lib/scoring";
import { createVersionSnapshot } from "@/lib/versions";
import {
  parseDbTags,
  tagsToDbString,
  DEFAULT_PAGE_SIZE,
  type MemoryCreateInput,
  type MemoryUpdateInput,
  type MemoryFilters,
} from "@/lib/schemas";

export type MemoryProjectRef = {
  id: string;
  slug: string;
  name: string;
};

export type MemoryWithTags = {
  id: string;
  type: string;
  title: string;
  content: string;
  tags: string[];
  projectId: string | null;
  importance: number;
  expiresAt: Date | null;
  lastAccessedAt: Date | null;
  source: string | null;
  sourceSessionId: string | null;
  sourceMessageId: string | null;
  createdBy: string | null;
  sourceUrl: string | null;
  relatedIds: string[];
  deletedAt: Date | null;
  embedding: string | null;
  embeddingModel: string | null;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  project?: MemoryProjectRef | null;
};

type MemoryRow = {
  id: string;
  type: string;
  title: string;
  content: string;
  tags: string;
  projectId: string | null;
  importance: number;
  expiresAt: Date | null;
  lastAccessedAt: Date | null;
  source: string | null;
  sourceSessionId: string | null;
  sourceMessageId: string | null;
  createdBy: string | null;
  sourceUrl: string | null;
  relatedIds: string;
  deletedAt: Date | null;
  embedding: string | null;
  embeddingModel: string | null;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  project?: MemoryProjectRef | null;
};

function withTags(m: MemoryRow): MemoryWithTags {
  return {
    id: m.id,
    type: m.type,
    title: m.title,
    content: m.content,
    tags: parseDbTags(m.tags),
    projectId: m.projectId,
    importance: m.importance,
    expiresAt: m.expiresAt,
    lastAccessedAt: m.lastAccessedAt,
    source: m.source,
    sourceSessionId: m.sourceSessionId,
    sourceMessageId: (m as unknown as { sourceMessageId?: string | null }).sourceMessageId ?? null,
    createdBy: m.createdBy,
    sourceUrl: m.sourceUrl,
    relatedIds: parseRelatedIds(m.relatedIds),
    deletedAt: m.deletedAt,
    embedding: m.embedding,
    embeddingModel: m.embeddingModel ?? null,
    isPinned: Boolean((m as unknown as { isPinned?: boolean | number }).isPinned),
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    project: m.project ?? null,
  };
}

function parseRelatedIds(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === "string");
    }
  } catch {
    // not JSON
  }
  return [];
}

export function stringifyRelatedIds(ids: string[]): string {
  return JSON.stringify(ids);
}

type ListResult = { items: MemoryWithTags[]; total: number };

function baseWhere(
  filters: Partial<MemoryFilters>,
): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (filters.type) where.type = filters.type;
  if (filters.project === "global") {
    where.projectId = null;
  } else if (filters.project) {
    where.projectId = filters.project;
  }
  // Soft-delete: exclude deleted memories by default, unless the caller
  // explicitly opts in via includeDeleted.
  if (filters.includeDeleted !== true) {
    where.deletedAt = null;
  }
  // Tier 3: session linkage
  if (filters.sourceSessionId) where.sourceSessionId = filters.sourceSessionId;
  // Tier 3: sourceMessageId
  if (filters.sourceMessageId) {
    (where as Record<string, unknown>).sourceMessageId = filters.sourceMessageId;
  }
  // Tier 3: pinned filter
  if (filters.isPinned === true) where.isPinned = true;
  else if (filters.isPinned === false) where.isPinned = false;
  // sessionId alias (maps to sourceSessionId)
  if (filters.sessionId) where.sourceSessionId = filters.sessionId;
  return where;
}

function orderByFor(sort: MemoryFilters["sort"]) {
  if (sort === "oldest") return { createdAt: "asc" as const };
  if (sort === "updated") return { updatedAt: "desc" as const };
  return { createdAt: "desc" as const };
}

function matchTag(tags: string[], tag: string): boolean {
  const tagLower = tag.toLowerCase();
  return tags.some((t) => t.toLowerCase() === tagLower);
}

function isExpired(expiresAt: Date | null, now: Date): boolean {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

export async function listMemories(
  rawFilters: Partial<MemoryFilters> = {},
): Promise<ListResult> {
  const filters: MemoryFilters = {
    q: rawFilters.q,
    type: rawFilters.type,
    project: rawFilters.project,
    tag: rawFilters.tag,
    includeDeleted: rawFilters.includeDeleted ?? false,
    limit: rawFilters.limit ?? DEFAULT_PAGE_SIZE,
    offset: rawFilters.offset ?? 0,
    sort: rawFilters.sort ?? "newest",
    // Tier 3
    sessionId: rawFilters.sessionId,
    isPinned: rawFilters.isPinned,
    includeExpired: rawFilters.includeExpired ?? false,
    sourceSessionId: rawFilters.sourceSessionId,
    sourceMessageId: rawFilters.sourceMessageId,
  };
  const where = baseWhere(filters);
  const now = new Date();

  // App-side filtering (tag and/or query exact matching) requires the full row
  // set to filter correctly, so we paginate in memory for those cases.
  const needsAppFiltering = Boolean(filters.q) || Boolean(filters.tag);

  if (needsAppFiltering) {
    const rows = await prisma.memory.findMany({
      where,
      include: { project: true },
    });

    let mapped = rows.map((r) => ({ row: r, mem: withTags(r) }));

    if (filters.tag) {
      mapped = mapped.filter((x) => matchTag(x.mem.tags, filters.tag as string));
    }

    if (filters.q) {
      const query = filters.q.toLowerCase();
      // Exact matching: only include memories that contain the query term
      mapped = mapped.filter(
        (x) =>
          x.mem.title.toLowerCase().includes(query) ||
          x.mem.content.toLowerCase().includes(query) ||
          x.mem.tags.some((t) => t.toLowerCase().includes(query))
      );
    }

    // Sort and paginate in memory
    const sorted = mapped.sort((a, b) => b.mem.createdAt.getTime() - a.mem.createdAt.getTime());
    const total = sorted.length;
    const items = sorted
      .slice(filters.offset, filters.offset + filters.limit)
      .map((x) => x.mem);
    return { items, total };
  }

  // Fast DB-path: pagination + sorting done in SQL.
  const [rows, total] = await Promise.all([
    prisma.memory.findMany({
      where,
      orderBy: orderByFor(filters.sort),
      skip: filters.offset,
      take: filters.limit,
      include: { project: true },
    }),
    prisma.memory.count({ where }),
  ]);

  return { items: rows.map(withTags), total };
}

export async function getMemory(
  id: string,
): Promise<MemoryWithTags | null> {
  const m = await prisma.memory.findUnique({
    where: { id },
    include: { project: true },
  });
  if (!m) return null;

  // Fire-and-forget: track last access for recency signals.
  void prisma.memory
    .update({ where: { id }, data: { lastAccessedAt: new Date() } })
    .catch(() => {
      // non-critical
    });

  return withTags(m);
}

export async function listAllForExport(
  filters: Omit<MemoryFilters, "limit" | "offset" | "sort"> & {
    excludeExpired?: boolean;
    includeExpired?: boolean;
    includeDeleted?: boolean;
  },
): Promise<MemoryWithTags[]> {
  const where = baseWhere({
    ...filters,
    includeDeleted: filters.includeDeleted,
    limit: 0,
    offset: 0,
    sort: "newest",
  });
  const now = new Date();
  const rows = await prisma.memory.findMany({
    where,
    include: { project: true },
  });
  let items = rows.map(withTags);
  if (filters.includeExpired !== true) {
    items = items.filter((m) => !isExpired(m.expiresAt, now));
  }
  return items;
}

export async function listAllForProject(
  projectId: string | null,
): Promise<MemoryWithTags[]> {
  const where: Record<string, unknown> = { deletedAt: null };
  if (projectId === null) {
    where.projectId = null;
  } else {
    where.projectId = projectId;
  }
  const rows = await prisma.memory.findMany({ where, include: { project: true } });
  return rows.map(withTags);
}

export async function listGlobalAndProject(
  projectId: string | null,
): Promise<MemoryWithTags[]> {
  const deletedClause = { deletedAt: null };
  if (projectId === null) {
    const rows = await prisma.memory.findMany({
      where: { projectId: null, ...deletedClause },
      include: { project: true },
    });
    return rows.map(withTags);
  }
  const rows = await prisma.memory.findMany({
    where: { OR: [{ projectId }, { projectId: null }], ...deletedClause },
    include: { project: true },
  });
  return rows.map(withTags);
}

export async function touchLastAccessedAt(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await prisma.memory.updateMany({
      where: { id: { in: ids } },
      data: { lastAccessedAt: new Date() },
    });
  } catch {
    // non-critical
  }
}

export async function createMemory(
  input: MemoryCreateInput,
): Promise<MemoryWithTags> {
  const created = await prisma.memory.create({
    data: {
      type: input.type,
      title: input.title,
      content: input.content,
      tags: tagsToDbString(input.tags),
      projectId: input.projectId ?? null,
      importance: input.importance ?? 0.5,
      expiresAt: input.expiresAt ?? null,
      source: input.source ?? null,
      isPinned: input.isPinned ?? false,
      sourceSessionId: input.sourceSessionId ?? null,
      sourceUrl: input.sourceUrl ?? null,
    },
  });
  return withTags(created);
}

export async function updateMemory(
  input: MemoryUpdateInput,
): Promise<MemoryWithTags> {
  const existing = await prisma.memory.findUnique({ where: { id: input.id } });
  if (existing) {
    try {
      await createVersionSnapshot(withTags(existing));
    } catch {
      // non-critical
    }
  }
  const updated = await prisma.memory.update({
    where: { id: input.id },
    data: {
      type: input.type,
      title: input.title,
      content: input.content,
      tags: tagsToDbString(input.tags),
      projectId: input.projectId ?? null,
      importance: input.importance ?? 0.5,
      expiresAt: input.expiresAt ?? null,
      source: input.source ?? null,
      isPinned: input.isPinned ?? undefined,
      sourceSessionId: input.sourceSessionId ?? undefined,
      sourceUrl: input.sourceUrl ?? undefined,
    },
  });
  return withTags(updated);
}

export type MemoryUpdatePatch = {
  type?: string;
  title?: string;
  content?: string;
  tags?: string[];
  projectId?: string | null;
  projectSlug?: string | null;
  importance?: number;
  expiresAt?: Date | null;
  source?: string | null;
  sourceSessionId?: string | null;
  sourceMessageId?: string | null;
  createdBy?: string | null;
  sourceUrl?: string | null;
  relatedIds?: string[];
  isPinned?: boolean;
  embeddingModel?: string | null;
};

export async function updateMemoryPartial(
  id: string,
  input: MemoryUpdatePatch,
  resolvedProjectId: string | null | undefined,
): Promise<MemoryWithTags | null> {
  const existing = await prisma.memory.findUnique({ where: { id } });
  if (!existing) return null;
  // Snapshot the pre-update state for version history before mutating.
  try {
    await createVersionSnapshot(withTags(existing));
  } catch {
    // non-critical: don't fail the update over a missed snapshot
  }

  const data: Record<string, unknown> = {};
  if (input.type !== undefined) data.type = input.type;
  if (input.title !== undefined) data.title = input.title;
  if (input.content !== undefined) data.content = input.content;
  if (input.tags !== undefined) data.tags = tagsToDbString(input.tags);
  if (input.importance !== undefined) data.importance = input.importance;
  if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt;
  if (input.source !== undefined) data.source = input.source;
  if (input.sourceSessionId !== undefined) data.sourceSessionId = input.sourceSessionId;
  if (input.sourceMessageId !== undefined) data.sourceMessageId = input.sourceMessageId;
  if (input.sourceUrl !== undefined) data.sourceUrl = input.sourceUrl;
  if (input.isPinned !== undefined) data.isPinned = input.isPinned;
  if (input.embeddingModel !== undefined) data.embeddingModel = input.embeddingModel;
  // projectId handled by caller (resolved from projectSlug/projectId/existing)
  data.projectId = resolvedProjectId;

  const updated = await prisma.memory.update({
    where: { id },
    data,
  });
  return withTags(updated);
}

export async function setEmbedding(
  id: string,
  embedding: number[],
): Promise<void> {
  await prisma.memory.update({
    where: { id },
    data: { embedding: JSON.stringify(embedding) },
  });
}

export async function deleteMemory(
  id: string,
  opts: { hard?: boolean } = {},
): Promise<{ ok: true; soft: boolean; id: string } | null> {
  const existing = await prisma.memory.findUnique({ where: { id } });
  if (!existing) return null;

  if (opts.hard === true) {
    // Hard delete: cascade drops versions (FK onDelete: Cascade).
    await prisma.memory.delete({ where: { id } });
    return { ok: true, soft: false, id };
  }

  // Soft delete: snapshot current state first (so the deletion is undoable
  // via /restore), then mark deletedAt.
  try {
    await createVersionSnapshot(withTags(existing));
  } catch {
    // non-critical
  }
  await prisma.memory.update({
    where: { id },
    data: { deletedAt: new Date(), lastAccessedAt: new Date() },
  });
  return { ok: true, soft: true, id };
}

export async function restoreMemory(
  id: string,
): Promise<MemoryWithTags | null> {
  const m = await prisma.memory.update({
    where: { id },
    data: { deletedAt: null },
  });
  return withTags(m);
}

export async function listDeleted(): Promise<MemoryWithTags[]> {
  const rows = await prisma.memory.findMany({
    where: { NOT: { deletedAt: null } },
    orderBy: { deletedAt: "desc" },
    include: { project: true },
  });
  return rows.map(withTags);
}

export async function purgeExpired(deletedBefore: Date): Promise<number> {
  const res = await prisma.memory.deleteMany({
    where: { deletedAt: { lt: deletedBefore } },
  });
  return res.count;
}

/**
 * Full-text search over the `MemoryFts` virtual table (FTS5, porter
 * unicode61 tokenizer). Returns memory ids whose title/content/tags match
 * the query tokens (implicit AND). Quoted tokens neutralise FTS5 special
 * syntax so user input can't break the MATCH clause or inject operators.
 *
 * Returns `null` when the query has no usable tokens (caller should fall
 * back to a full scan); returns `[]` when tokens exist but nothing matched.
 */
export async function searchFtsIds(
  q: string,
  opts: { includeDeleted?: boolean; limit?: number } = {},
): Promise<string[] | null> {
  const tokens = tokenizeQuery(q);
  if (tokens.length === 0) return null;
  const match = tokens
    .filter((t) => t.length > 0)
    .map((t) => `"${t.replace(/"/g, '""')}"`)
    .join(" ");
  if (!match) return null;

  const deletedClause =
    opts.includeDeleted !== true ? 'AND m."deletedAt" IS NULL' : "";
  const limit = Math.max(1, Math.min(opts.limit ?? 500, 1000));

  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT m."id" AS id
       FROM "MemoryFts" f
       JOIN "Memory" m ON m."id" = f."memoryId"
      WHERE "MemoryFts" MATCH ?
      ${deletedClause}
      LIMIT ?`,
    match,
    limit,
  );
  return rows.map((r) => r.id);
}

const MAX_RELATED_LINKS = 20;

/** Fetch non-deleted memories by a set of ids (order agnostic). */
export async function listMemoriesByIds(
  ids: string[],
): Promise<MemoryWithTags[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.memory.findMany({
    where: { id: { in: ids }, deletedAt: null },
    include: { project: true },
  });
  return rows.map(withTags);
}

/**
 * Resolve the related-memories array for a memory: parses `relatedIds`,
 * fetches the still-existing, non-deleted memories and returns them in the
 * order preserved by the stored JSON array.
 */
export async function getRelatedMemories(
  id: string,
): Promise<MemoryWithTags[]> {
  const mem = await prisma.memory.findUnique({
    where: { id },
    include: { project: true },
  });
  if (!mem) return [];
  const ids = parseRelatedIds((mem as MemoryRow).relatedIds);
  if (ids.length === 0) return [];
  const rows = await prisma.memory.findMany({
    where: { id: { in: ids }, deletedAt: null },
    include: { project: true },
  });
  const byId = new Map(rows.map((r) => [r.id, withTags(r as MemoryRow)]));
  return ids.map((rid) => byId.get(rid)).filter(Boolean) as MemoryWithTags[];
}

/**
 * Add links to a memory's `relatedIds`. Inputs are validated: each id must
 * exist and must not be the memory itself or already linked. The final array
 * is capped at `MAX_RELATED_LINKS` (extra inputs past that are dropped,
 * preserving stored order). Returns `{ relatedIds }`.
 */
export async function addLinks(
  id: string,
  addIds: string[],
): Promise<{ relatedIds: string[] }> {
  const mem = await prisma.memory.findUnique({
    where: { id },
    include: { project: true },
  });
  if (!mem) {
    throw new Error("Memory not found");
  }
  const current = parseRelatedIds((mem as MemoryRow).relatedIds);

  // Validate incoming ids: drop self, drop dups, drop already-linked.
  const seen = new Set(current);
  const cleaned = addIds.filter((rid) => rid && rid !== id && !seen.has(rid));
  if (cleaned.length === 0) {
    return { relatedIds: current };
  }

  // Confirm each cleaned id resolves to a real, non-deleted memory.
  const exists = await prisma.memory.findMany({
    where: { id: { in: cleaned }, deletedAt: null },
    select: { id: true },
  });
  const existsSet = new Set(exists.map((r) => r.id));
  const valid = cleaned.filter((rid) => existsSet.has(rid));

  const merged = [...current, ...valid].slice(0, MAX_RELATED_LINKS);
  await prisma.memory.update({
    where: { id },
    data: { relatedIds: stringifyRelatedIds(merged) },
  });
  return { relatedIds: merged };
}

/** Remove ids from a memory's `relatedIds`. Returns `{ relatedIds }`. */
export async function removeLinks(
  id: string,
  removeIds: string[],
): Promise<{ relatedIds: string[] }> {
  const mem = await prisma.memory.findUnique({ where: { id } });
  if (!mem) {
    throw new Error("Memory not found");
  }
  const remove = new Set(removeIds.filter(Boolean));
  const current = parseRelatedIds((mem as MemoryRow).relatedIds);
  const next = current.filter((rid) => !remove.has(rid));
  if (next.length !== current.length) {
    await prisma.memory.update({
      where: { id },
      data: { relatedIds: stringifyRelatedIds(next) },
    });
  }
  return { relatedIds: next };
}

export type LinkableMemory = {
  id: string;
  title: string;
  type: string;
  updatedAt: Date;
};

/**
 * Candidate memories the user can link to the target memory: non-deleted,
 * excluding the target itself and any ids already linked. Capped at 100 and
 * sorted by most-recently-updated for the UI dropdown.
 */
export async function listLinkableMemories(
  id: string,
): Promise<LinkableMemory[]> {
  const mem = await prisma.memory.findUnique({ where: { id } });
  if (!mem) return [];
  const alreadyLinked = new Set([
    id,
    ...parseRelatedIds((mem as MemoryRow).relatedIds),
  ]);
  const rows = await prisma.memory.findMany({
    where: { deletedAt: null, id: { notIn: Array.from(alreadyLinked) } },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, title: true, type: true, updatedAt: true },
  });
  return rows as LinkableMemory[];
}