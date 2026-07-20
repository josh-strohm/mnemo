import { prisma } from "@/lib/db";
import type { Project } from "@/generated/prisma/client";

export class ProjectSlugTakenError extends Error {
  code = "SLUG_TAKEN" as const;
  constructor(slug: string) {
    super(`Slug "${slug}" is already taken by another project`);
    this.name = "ProjectSlugTakenError";
  }
}

export async function listProjects(): Promise<Project[]> {
  return prisma.project.findMany({
    orderBy: { name: "asc" },
  });
}

export async function getProject(id: string): Promise<Project | null> {
  return prisma.project.findUnique({ where: { id } });
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  return prisma.project.findUnique({ where: { slug } });
}

export async function createProject(input: {
  name: string;
  slug: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  defaultImportance?: number;
  isArchived?: boolean;
}): Promise<Project> {
  return prisma.project.create({
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      color: normalizeColor(input.color),
      icon: input.icon ?? null,
      defaultImportance: input.defaultImportance ?? 0.5,
      isArchived: input.isArchived ?? false,
    },
  });
}

export async function updateProject(
  id: string,
  input: {
    name?: string;
    slug?: string;
    description?: string | null;
    color?: string | null;
    icon?: string | null;
    defaultImportance?: number;
    isArchived?: boolean;
  },
): Promise<Project> {
  const current = await prisma.project.findUnique({ where: { id } });
  if (!current) {
    throw new Error(`Project not found: ${id}`);
  }

  if (
    input.slug !== undefined &&
    input.slug !== null &&
    input.slug !== current.slug
  ) {
    const existing = await prisma.project.findUnique({
      where: { slug: input.slug },
    });
    if (existing && existing.id !== id) {
      throw new ProjectSlugTakenError(input.slug);
    }
  }

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.slug !== undefined && input.slug !== null) data.slug = input.slug;
  if (input.description !== undefined) data.description = input.description ?? null;
  if (input.color !== undefined) data.color = normalizeColor(input.color);
  if (input.icon !== undefined) data.icon = input.icon ?? null;
  if (input.defaultImportance !== undefined) data.defaultImportance = input.defaultImportance;
  if (input.isArchived !== undefined) data.isArchived = input.isArchived;

  try {
    return await prisma.project.update({ where: { id }, data });
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.includes("Unique constraint failed")
    ) {
      throw new ProjectSlugTakenError(input.slug ?? current.slug);
    }
    throw err;
  }
}

/**
 * Project-level statistics: counts of memories (active + deleted + total),
 * the most recent updatedAt among active memories, and the top tags by
 * frequency. Used on the project detail page.
 */
export type ProjectStats = {
  memoryCount: number;
  deletedCount: number;
  total: number;
  lastUpdatedAt: Date | null;
  topTags: { tag: string; count: number }[];
};

export async function getProjectStats(id: string): Promise<ProjectStats> {
  // Aggregate counts in a single round-trip.
  const grouped = await prisma.memory.groupBy({
    by: ["deletedAt"],
    where: { projectId: id },
    _count: { _all: true },
    _max: { updatedAt: true },
  });
  let memoryCount = 0;
  let deletedCount = 0;
  let lastUpdatedAt: Date | null = null;
  for (const g of grouped) {
    if (g.deletedAt === null) {
      memoryCount = g._count._all;
      lastUpdatedAt = g._max.updatedAt;
    } else {
      deletedCount = g._count._all;
    }
  }

  const rows = await prisma.memory.findMany({
    where: { projectId: id, deletedAt: null },
    select: { tags: true },
  });
  const counts = new Map<string, number>();
  for (const row of rows) {
    let tags: string[] = [];
    try {
      const parsed = JSON.parse(String(row.tags));
      if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === "string");
    } catch {
      tags = [];
    }
    for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const topTags = [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 10);

  return {
    memoryCount,
    deletedCount,
    total: memoryCount + deletedCount,
    lastUpdatedAt,
    topTags,
  };
}

/** Accept "RRGGBB" or "#RRGGBB"; store as "#RRGGBB". Null/empty → null. */
function normalizeColor(color: string | null | undefined): string | null {
  if (!color) return null;
  const trimmed = color.trim();
  if (trimmed.length === 0) return null;
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return withHash.toLowerCase();
}

export async function deleteProject(id: string): Promise<void> {
  await prisma.project.delete({ where: { id } });
}