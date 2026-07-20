import Link from "next/link";
import { listProjects } from "@/lib/projects";
import { listMemories } from "@/lib/memories";

export default async function ProjectsPage() {
  const projects = await listProjects();

  const counts = new Map<string, number>();
  if (projects.length > 0) {
    const { items: allMemories } = await listMemories({});
    for (const m of allMemories) {
      if (m.projectId) {
        counts.set(m.projectId, (counts.get(m.projectId) ?? 0) + 1);
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Link
          href="/projects/new"
          className="rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          New project
        </Link>
      </div>

      {projects.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">
          No projects yet. Create one to start scoping memories.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {projects.map((p) => (
            <li
              key={p.id}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4"
            >
              <div className="flex items-center justify-between">
                <Link
                  href={`/projects/${p.id}`}
                  className="inline-flex items-center gap-2 font-medium hover:underline"
                >
                  {p.color && (
                    <span
                      aria-hidden
                      className="inline-block w-3 h-3 rounded-full border border-zinc-300 dark:border-zinc-700"
                      style={{ backgroundColor: p.color }}
                    />
                  )}
                  {p.icon && <span aria-hidden>{p.icon}</span>}
                  {p.name}
                  {p.isArchived && (
                    <span className="text-xs font-normal uppercase tracking-wide text-amber-600 dark:text-amber-400">
                      archived
                    </span>
                  )}
                </Link>
                <span className="text-xs text-zinc-500">
                  {counts.get(p.id) ?? 0} memories · /{p.slug}
                </span>
              </div>
              <div className="mt-2 flex gap-3 text-sm">
                <Link
                  href={`/projects/${p.id}`}
                  className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  View
                </Link>
                <Link
                  href={`/export?project=${p.id}`}
                  className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  Export
                </Link>
                <Link
                  href={`/projects/${p.id}#delete`}
                  className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  Delete
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}