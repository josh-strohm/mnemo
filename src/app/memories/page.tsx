import Link from "next/link";
import { listMemories } from "@/lib/memories";
import { listProjects } from "@/lib/projects";
import {
  MEMORY_TYPES,
  MEMORY_TYPE_LABELS,
  memoryFiltersSchema,
} from "@/lib/schemas";

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
  const [memories, projects] = await Promise.all([
    listMemories(filters),
    listProjects(),
  ]);

  return (
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
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
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
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
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
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
                  {m.content}
                </p>
                {m.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.tags.map((t) => (
                      <span
                        key={t}
                        className="text-xs rounded bg-zinc-100 dark:bg-zinc-900 px-2 py-0.5"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}