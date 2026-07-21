import Link from "next/link";
import { prisma } from "@/lib/db";
import { AutoRefresh } from "@/app/AutoRefresh";

export const dynamic = "force-dynamic";

/**
 * /admin — Tier 3 admin dashboard.
 *
 * Renders stats cards, top tags, FTS row count, recent versions, per-project
 * counts, and a backup/download button. Server component that hits DB once.
 *
 * Admin nav link is added in layout.tsx. proxy.ts already cookie-gates
 * /admin so non-admin sessions are bounced to /login.
 */

async function loadStats() {
  try {
    const [total, withEmbed, deleted, active, versions, auditCount, apiKeyCount, ftsRow, projects] =
      await Promise.all([
        prisma.memory.count(),
        prisma.memory.count({ where: { embedding: { not: null } } }),
        prisma.memory.count({ where: { NOT: { deletedAt: null } } }),
        prisma.memory.count({ where: { deletedAt: null } }),
        prisma.memoryVersion.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
        prisma.auditLog.count().catch(() => 0),
        prisma.apiKey.count({ where: { isActive: true } }).catch(() => 0),
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

    const tagRows = await prisma.memory
      .findMany({ where: { deletedAt: null }, select: { tags: true } })
      .catch(() => [] as { tags: string }[]);
    const tagCounts = new Map<string, number>();
    for (const row of tagRows) {
      let tags: string[] = [];
      try {
        const parsed = JSON.parse(String(row.tags));
        if (Array.isArray(parsed))
          tags = parsed.filter((t): t is string => typeof t === "string");
      } catch {
        /* skip */
      }
      for (const t of tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
    const topTags = [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, 20);

    const byProject = new Map<string, { active: number; deleted: number; lastAt: Date | null }>();
    try {
      const grouped = await prisma.memory.groupBy({
        by: ["projectId", "deletedAt"],
        _count: { _all: true },
        _max: { updatedAt: true },
      });
      for (const g of grouped) {
        const key = g.projectId ?? "__global__";
        const prev = byProject.get(key) ?? { active: 0, deleted: 0, lastAt: null };
        if (g.deletedAt === null) {
          prev.active += g._count._all;
          prev.lastAt = g._max.updatedAt ?? prev.lastAt;
        } else {
          prev.deleted += g._count._all;
        }
        byProject.set(key, prev);
      }
    } catch {
      /* ignore */
    }

    let pinnedCount = 0;
    try {
      pinnedCount = await prisma.memory.count({ where: { isPinned: true, deletedAt: null } });
    } catch {
      /* column may not exist on Tier 1 db */
    }

    return {
      totals: {
        total,
        active,
        deleted,
        pinned: pinnedCount,
        withEmbedding: withEmbed,
        auditLog: auditCount,
        apiKeys: apiKeyCount,
        projects: projects.length,
        embeddingCoveragePercent: total > 0 ? Math.round((withEmbed / total) * 1000) / 10 : 100,
      },
      ftsCount,
      versions,
      topTags,
      projects,
      byProject,
    };
  } catch (err) {
    console.error("[admin] stats load failed:", err);
    return null;
  }
}

export default async function AdminPage() {
  const stats = await loadStats();
  if (!stats) {
    return (
      <AutoRefresh>
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">Admin</h1>
          <p className="text-sm text-red-600 dark:text-red-400">
            Could not load admin stats. Check the database connection.
          </p>
        </div>
      </AutoRefresh>
    );
  }

  const dateFmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });

  return (
    <AutoRefresh>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Admin</h1>
          <div className="flex gap-2 text-sm">
            <Link
              href="/admin/audit"
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              Audit log
            </Link>
            <Link
              href="/admin/api-keys"
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              API keys
            </Link>
            <a
              href="/api/admin/backup"
              download="mnemo-backup.json"
              className="rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black px-3 py-2 font-medium hover:opacity-90"
            >
              Download backup
            </a>
          </div>
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Total memories" value={stats.totals.total} />
          <Stat label="Active" value={stats.totals.active} accent />
          <Stat label="In trash" value={stats.totals.deleted} warn={stats.totals.deleted > 0} />
          <Stat label="Pinned" value={stats.totals.pinned} />
          <Stat
            label="Embedding coverage"
            value={`${stats.totals.embeddingCoveragePercent}%`}
          />
          <Stat label="Projects" value={stats.totals.projects} />
          <Stat label="API keys (active)" value={stats.totals.apiKeys} />
          <Stat label="Audit log entries" value={stats.totals.auditLog} />
        </dl>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
            <h2 className="text-sm font-medium mb-3">Top tags</h2>
            {stats.topTags.length === 0 ? (
              <p className="text-sm text-zinc-500">No tags yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {stats.topTags.map((t) => (
                  <span
                    key={t.tag}
                    className="text-xs rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-0.5"
                  >
                    #{t.tag} <span className="text-zinc-500">×{t.count}</span>
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
            <h2 className="text-sm font-medium mb-3">FTS5 index</h2>
            <p className="text-2xl font-semibold">{stats.ftsCount ?? "—"}</p>
            <p className="text-xs text-zinc-500 mt-1">
              Rows in the MemoryFts virtual table. Should equal active memory count.
            </p>
          </section>

          <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
            <h2 className="text-sm font-medium mb-3">Recent versions</h2>
            {stats.versions.length === 0 ? (
              <p className="text-sm text-zinc-500">No versions yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {stats.versions.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="truncate pr-2">
                      v{v.version} — {v.title}
                    </span>
                    <span className="text-xs text-zinc-500 shrink-0">
                      {dateFmt.format(v.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
            <h2 className="text-sm font-medium mb-3">Per-project counts</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                  <th className="py-1.5">Project</th>
                  <th className="py-1.5 w-16 text-right">Active</th>
                  <th className="py-1.5 w-16 text-right">Trash</th>
                  <th className="py-1.5 w-32 text-right">Last update</th>
                </tr>
              </thead>
              <tbody>
                {stats.projects.map((p) => {
                  const c = stats.byProject.get(p.id) ?? { active: 0, deleted: 0, lastAt: null };
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-zinc-100 dark:border-zinc-900 last:border-0"
                    >
                      <td className="py-1.5">
                        <Link
                          href={`/projects/${p.id}`}
                          className="hover:underline inline-flex items-center gap-2"
                        >
                          {p.color && (
                            <span
                              aria-hidden
                              className="inline-block w-2 h-2 rounded-full"
                              style={{ backgroundColor: p.color }}
                            />
                          )}
                          {p.name}
                        </Link>
                      </td>
                      <td className="py-1.5 text-right">{c.active}</td>
                      <td className="py-1.5 text-right">{c.deleted}</td>
                      <td className="py-1.5 text-right text-xs text-zinc-500">
                        {c.lastAt ? dateFmt.format(c.lastAt) : "—"}
                      </td>
                    </tr>
                  );
                })}
                {(() => {
                  const g = stats.byProject.get("__global__") ?? { active: 0, deleted: 0, lastAt: null };
                  return (
                    <tr>
                      <td className="py-1.5 text-zinc-500">Global</td>
                      <td className="py-1.5 text-right">{g.active}</td>
                      <td className="py-1.5 text-right">{g.deleted}</td>
                      <td className="py-1.5 text-right text-xs text-zinc-500">
                        {g.lastAt ? dateFmt.format(g.lastAt) : "—"}
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </section>
        </div>

        <p className="text-xs text-zinc-500">
          Tier 3 admin — powered by /api/admin/stats, /api/admin/audit, /api/admin/backup. All Tier 3
          audit/webhook events are logged in the AuditLog table.
        </p>
      </div>
    </AutoRefresh>
  );
}

function Stat({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd
        className={
          "text-lg font-medium " +
          (warn ? "text-amber-600 dark:text-amber-400 " : "") +
          (accent ? "text-emerald-600 dark:text-emerald-400" : "")
        }
      >
        {value}
      </dd>
    </div>
  );
}
