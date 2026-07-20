import Link from "next/link";
import { listMemories } from "@/lib/memories";
import { listProjects } from "@/lib/projects";
import {
  MEMORY_TYPES,
  MEMORY_TYPE_LABELS,
  MEMORY_SOURCE_LABELS,
  memoryFiltersSchema,
} from "@/lib/schemas";
import { AutoRefresh } from "@/app/AutoRefresh";

function formatRelative(date: Date | null): string | null {
  if (!date) return null;
  const diffMs = Date.now() - date.getTime();
  const secs = Math.round(diffMs / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(months / 12);
  return `${years}y ago`;
}

export default async function MemoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = await searchParams;
  const sp: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) {
    sp[k] = Array.isArray(v) ? v[0] : v;
  }

  const filters = memoryFiltersSchema.parse(sp);
  const [result, projects] = await Promise.all([
    listMemories(filters),
    listProjects(),
  ]);
  const memories = result.items;

  return (
    <AutoRefresh>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Memories</h1>
          <Link
            href="/memories/new"
            className="rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            New memory
          </Link>
      </div>

      <form className="flex flex-wrap gap-2" method="GET" action="/memories">
        <input
          type="text"
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="Search title or content..."
          className="flex-1 min-w-48 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
        />
        <select
          name="type"
          defaultValue={filters.type ?? ""}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 px-3 py-2 text-sm"
        >
          <option value="">All types</option>
          {MEMORY_TYPES.map((t) => (
            <option key={t} value={t}>
              {MEMORY_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          name="project"
          defaultValue={filters.project ?? ""}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 px-3 py-2 text-sm"
        >
          <option value="">All projects</option>
          <option value="global">Global</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          name="tag"
          defaultValue={filters.tag ?? ""}
          placeholder="Tag"
          className="w-24 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900"
        >
          Filter
        </button>
      </form>

      {memories.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">
          No memories found. Create one to get started.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {memories.map((m) => {
            const project = projects.find((p) => p.id === m.projectId);
            const scopeLabel = project ? project.name : "Global";
            const updated = formatRelative(m.updatedAt);
            const sourceLabel =
              m.source &&
              MEMORY_SOURCE_LABELS[m.source as keyof typeof MEMORY_SOURCE_LABELS];
            return (
              <li
                key={m.id}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/memories/${m.id}`}
                    className="font-medium hover:underline"
                  >
                    {m.title}
                  </Link>
                  <span className="text-xs text-zinc-500">
                    {MEMORY_TYPE_LABELS[m.type as keyof typeof MEMORY_TYPE_LABELS]} · {scopeLabel}
                    {updated ? ` · ${updated}` : ""}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
                  {m.content}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {sourceLabel && (
                    <span className="text-xs rounded border border-zinc-300 dark:border-zinc-700 text-zinc-500 px-2 py-0.5">
                      {sourceLabel}
                    </span>
                  )}
                  {m.tags.map((t) => (
                    <span
                      key={t}
                      className="text-xs rounded bg-zinc-100 dark:bg-zinc-900 px-2 py-0.5"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
    </AutoRefresh>
  );
}