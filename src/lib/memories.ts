import { prisma } from "@/lib/db";
import { scoreMemoryAgainstQuery, tokenizeQuery } from "@/lib/scoring";
import { createVersionSnapshot } from "@/lib/versions";
import {
  parseDbTags,
  tagsToDbString,
  DEFAULT_PAGE_SIZE,
  type MemoryCreateInput,
  type MemoryUpdateInput,
  type MemoryApiUpdateInput,
  type MemoryFilters,
} from "@/lib/schemas";

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
  embedding: string | null;
  createdAt: Date;
  updatedAt: Date;
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
  embedding: string | null;
  createdAt: Date;
  updatedAt: Date;
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
    embedding: m.embedding,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

type ListResult = { items: MemoryWithTags[]; total: number };

function baseWhere(filters: MemoryFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (filters.type) where.type = filters.type;
  if (filters.project === "global") {
    where.projectId = null;
  } else if (filters.project) {
    where.projectId = filters.project;
  }
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
    limit: rawFilters.limit ?? DEFAULT_PAGE_SIZE,
    offset: rawFilters.offset ?? 0,
    sort: rawFilters.sort ?? "newest",
  };
  const where = baseWhere(filters);
  const now = new Date();

  // App-side filtering (tag and/or query relevance) requires the full row
  // set to score correctly, so we paginate in memory for those cases.
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
      const tokens = tokenizeQuery(filters.q);
      const scored = mapped
        .map((x) => {
          const s = scoreMemoryAgainstQuery({
            title: x.mem.title,
            content: x.mem.content,
            tags: x.mem.tags,
            tokens,
            updatedAt: x.mem.updatedAt,
            now,
          });
          return { x, s };
        })
        .filter((y) => y.s.score > 0)
        .sort((a, b) => b.s.score - a.s.score);
      const total = scored.length;
      const items = scored
        .slice(filters.offset, filters.offset + filters.limit)
        .map((y) => y.x.mem);
      return { items, total };
    }

    // tag-only: sort by createdAt desc, paginate in memory
    const sorted = mapped.sort(
      (a, b) => b.mem.createdAt.getTime() - a.mem.createdAt.getTime(),
    );
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
  },
): Promise<MemoryWithTags[]> {
  const where = baseWhere({ ...filters, limit: 0, offset: 0, sort: "newest" });
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
  const where: Record<string, unknown> = {};
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
  if (projectId === null) {
    const rows = await prisma.memory.findMany({
      where: { projectId: null },
      include: { project: true },
    });
    return rows.map(withTags);
  }
  const rows = await prisma.memory.findMany({
    where: { OR: [{ projectId }, { projectId: null }] },
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
    },
  });
  return withTags(updated);
}

export async function updateMemoryPartial(
  id: string,
  input: MemoryApiUpdateInput,
  resolvedProjectId: string | null,
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

export async function deleteMemory(id: string): Promise<void> {
  await prisma.memory.delete({ where: { id } });
}