import { prisma } from "@/lib/db";

/**
 * GET /api/admin/stats — Tier 3 admin snapshot.
 * Returns a JSON aggregate covering embedding coverage, FTS index size,
 * top tags, trash count, last 10 versions, audit-log count, api-key count,
 * project counts, and a per-project breakdown.
 *
 * Auth: gated by Bearer MNEMO_API_KEY (via proxy). No separate admin scope
 * check is needed because the primary key is the admin key. Per-agent keys
 * need admin:read to access.
 */

export async function GET() {
  const [total, withEmbed, deleted, active, versions, auditCount, apiKeyCount, ftsRow, projects] =
    await Promise.all([
      prisma.memory.count(),
      prisma.memory.count({ where: { embedding: { not: null } } }),
      prisma.memory.count({ where: { NOT: { deletedAt: null } } }),
      prisma.memory.count({ where: { deletedAt: null } }),
      prisma.memoryVersion.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
      prisma.auditLog.count().catch(() => 0),
      prisma.apiKey.count().catch(() => 0),
      prisma.$queryRawUnsafe<{ c?: string; count?: number }[]>(
        `SELECT COUNT(*) as c FROM "MemoryFts"`,
      ).catch(() => [] as { c?: string; count?: number }[]),
      prisma.project.findMany({ orderBy: { name: "asc" } }).catch(() => []),
    ]);

  const ftsCount = (() => {
    if (!ftsRow || ftsRow.length === 0) return null;
    const row = ftsRow[0] as unknown as Record<string, unknown>;
    const n = (row.c ?? row.count) as string | number | undefined;
    if (n == null) return null;
    const v = typeof n === "string" ? Number(n) : n;
    return Number.isFinite(v) ? v : null;
  })();

  // Top tags across non-deleted memories.
  const tagRows = await prisma.memory
    .findMany({ where: { deletedAt: null }, select: { tags: true } })
    .catch(() => [] as { tags: string }[]);

  const tagCounts = new Map<string, number>();
  for (const row of tagRows) {
    let tags: string[] = [];
    try {
      const parsed = JSON.parse(String(row.tags));
      if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === "string");
    } catch {
      continue;
    }
    for (const t of tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const topTags = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 20);

  // Embedding coverage.
  const embeddingCoverage = total > 0 ? Math.round((withEmbed / total) * 1000) / 10 : 100;

  // Per-project stats (lightweight: counts from tag data + prisma count grouped).
  let byProject: { id: string; name: string; slug: string; active: number; deleted: number; lastAt: string | null }[] = [];
  try {
    const grouped = await prisma.memory.groupBy({
      by: ["projectId", "deletedAt"],
      _count: { _all: true },
      _max: { updatedAt: true },
    });
    const activeMap = new Map<string, { count: number; lastAt: Date | null }>();
    const deletedMap = new Map<string, number>();
    for (const g of grouped) {
      if (g.deletedAt === null) {
        const prev = activeMap.get(g.projectId ?? "__global__") ?? { count: 0, lastAt: null };
        activeMap.set(g.projectId ?? "__global__", {
          count: prev.count + g._count._all,
          lastAt: g._max.updatedAt ?? prev.lastAt,
        });
      } else {
        const prev = deletedMap.get(g.projectId ?? "__global__") ?? 0;
        deletedMap.set(g.projectId ?? "__global__", prev + g._count._all);
      }
    }
    byProject = projects.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      active: activeMap.get(p.id)?.count ?? 0,
      deleted: deletedMap.get(p.id) ?? 0,
      lastAt: activeMap.get(p.id)?.lastAt?.toISOString() ?? null,
    }));
  } catch {
    // ignore
  }

  // Pinned count.
  let pinnedCount = 0;
  try {
    pinnedCount = await prisma.memory.count({ where: { isPinned: true, deletedAt: null } });
  } catch {
    // column may not exist yet on dev.db pending migration
  }

  return Response.json({
    schema: "mnemo.admin.stats.v1",
    generatedAt: new Date().toISOString(),
    totals: {
      total,
      active,
      deleted,
      pinned: pinnedCount,
      withEmbedding: withEmbed,
      embeddingCoveragePercent: embeddingCoverage,
      auditLog: auditCount,
      apiKeys: apiKeyCount,
      projects: projects.length,
    },
    ftsRows: ftsCount,
    versions: versions.map((v) => ({
      id: v.id,
      memoryId: v.memoryId,
      version: v.version,
      title: v.title,
      createdAt: v.createdAt,
    })),
    topTags,
    byProject,
  });
}
