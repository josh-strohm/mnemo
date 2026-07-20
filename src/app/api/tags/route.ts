import { prisma } from "@/lib/db";

/**
 * GET /api/tags — aggregates tag counts across non-deleted memories.
 * Optional `?project=<slug|id|global|all>` filters exactly like the memories
 * list. Returns an array of `{ tag, count }` sorted by count desc then tag asc.
 *
 * The aggregation is done in JS because tags are stored as a JSON array
 * column (SQLite + Prisma cannot GROUP BY over JSON array elements). The
 * live dataset is small enough that a single `findMany({ select: { tags } })`
 * is cheap; if it ever grows past ~50k memories we can introduce a
 * denormalised `Tag` table with a refresh trigger.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectParam = url.searchParams.get("project") ?? "all";

  let projectFilter: Record<string, unknown> = {};
  if (projectParam === "all") {
    projectFilter = {};
  } else if (projectParam === "global") {
    projectFilter = { projectId: null };
  } else {
    // Match by slug OR by literal id.
    const found = await prisma.project.findFirst({
      where: { OR: [{ slug: projectParam }, { id: projectParam }] },
      select: { id: true },
    });
    if (!found) {
      return Response.json(
        { error: `Project not found: ${projectParam}` },
        { status: 404 },
      );
    }
    projectFilter = {
      OR: [{ projectId: found.id }, { projectId: null }],
    };
  }

  const rows = await prisma.memory.findMany({
    where: { ...projectFilter, deletedAt: null },
    select: { tags: true },
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    let tags: string[] = [];
    try {
      const parsed = JSON.parse(String(row.tags));
      if (Array.isArray(parsed)) {
        tags = parsed.filter(
          (t): t is string => typeof t === "string" && t.length > 0,
        );
      }
    } catch {
      tags = [];
    }
    for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }

  const tags = [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  return Response.json({ tags, total: tags.length });
}