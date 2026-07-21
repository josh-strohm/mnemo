import Link from "next/link";
import { listAuditLogs } from "@/lib/audit";
import { AutoRefresh } from "@/app/AutoRefresh";

export const dynamic = "force-dynamic";

/**
 * /admin/audit — Tier 3 audit log.
 * Server component, paginated (limit=50), newest first.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const action = Array.isArray(sp.action) ? sp.action[0] : sp.action ?? "";
  const limit = Math.min(200, Math.max(1, Number(sp.limit ?? 50) || 50));
  const offset = Math.max(0, Number(sp.offset ?? 0) || 0);

  const { items, total } = await listAuditLogs({
    action: action || undefined,
    limit,
    offset,
  });

  const dateFmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });

  return (
    <AutoRefresh>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Audit log</h1>
          <div className="flex gap-2 text-sm">
            <Link
              href="/admin"
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              ← Stats
            </Link>
            <Link
              href="/admin/api-keys"
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              API keys
            </Link>
          </div>
        </div>

        <form className="flex flex-wrap gap-2" method="GET" action="/admin/audit">
          <input
            type="text"
            name="action"
            defaultValue={action}
            placeholder="action (create, update, search, …)"
            className="flex-1 min-w-48 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            Filter
          </button>
        </form>

        <p className="text-xs text-zinc-500">
          {total} matching entries · showing {offset + 1}–{offset + items.length}
        </p>

        {items.length === 0 ? (
          <p className="text-sm text-zinc-500">No audit log entries.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs uppercase text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Action</th>
                <th className="py-2 pr-3">Memory</th>
                <th className="py-2 pr-3">API key</th>
                <th className="py-2 pr-3">IP</th>
                <th className="py-2 pr-3">User agent</th>
                <th className="py-2 pr-3">Meta</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                let meta: string | null = null;
                if (row.metadata) {
                  try {
                    meta = JSON.stringify(JSON.parse(row.metadata));
                  } catch {
                    meta = row.metadata;
                  }
                }
                return (
                  <tr
                    key={row.id}
                    className="border-b border-zinc-100 dark:border-zinc-900 last:border-0 align-top"
                  >
                    <td className="py-1.5 pr-3 text-xs text-zinc-500 whitespace-nowrap">
                      {dateFmt.format(row.createdAt)}
                    </td>
                    <td className="py-1.5 pr-3 text-xs rounded font-mono">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900">
                        {row.action}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-xs">
                      {row.memoryId ? (
                        <Link
                          href={`/memories/${row.memoryId}`}
                          className="hover:underline"
                        >
                          {row.memoryId.slice(0, 10)}…
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-xs">
                      {row.apiKeyId ?? "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-xs">{row.actorIp ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-xs max-w-32 truncate" title={row.userAgent ?? ""}>
                      {row.userAgent ?? "—"}
                    </td>
                    <td
                      className="py-1.5 pr-3 text-xs font-mono max-w-72 truncate"
                      title={meta ?? ""}
                    >
                      {meta ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="flex justify-between text-sm">
          {offset > 0 ? (
            <Link
              href={{
                pathname: "/admin/audit",
                query: { action, limit, offset: Math.max(0, offset - limit) },
              }}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          {offset + items.length < total ? (
            <Link
              href={{ pathname: "/admin/audit", query: { action, limit, offset: offset + limit } }}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              Older →
            </Link>
          ) : (
            <span />
          )}
        </div>
      </div>
    </AutoRefresh>
  );
}
