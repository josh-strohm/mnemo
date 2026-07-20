import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject, getProjectStats } from "@/lib/projects";
import { listMemories } from "@/lib/memories";
import { MEMORY_TYPE_LABELS } from "@/lib/schemas";
import { AutoRefresh } from "@/app/AutoRefresh";
import { ProjectEditForm } from "@/app/projects/[id]/ProjectEditForm";
import { ProjectDeleteForm } from "@/app/projects/[id]/ProjectDeleteForm";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);

  if (!project) {
    notFound();
  }

  const [memoryList, stats] = await Promise.all([
    listMemories({ project: project.id, sort: "newest" }),
    getProjectStats(project.id),
  ]);
  const memories = memoryList.items;

  const dateFmt = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const lastUpdated = stats.lastUpdatedAt
    ? dateFmt.format(stats.lastUpdatedAt)
    : "—";

  return (
    <AutoRefresh>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {project.color && (
            <span
              aria-hidden
              className="inline-block w-4 h-4 rounded-full border border-zinc-300 dark:border-zinc-700"
              style={{ backgroundColor: project.color }}
            />
          )}
          {project.icon && (
            <span aria-hidden className="text-xl">{project.icon}</span>
          )}
          <div>
            <h1 className="text-2xl font-semibold">
              {project.name}
              {project.isArchived && (
                <span className="ml-2 text-xs font-normal uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  archived
                </span>
              )}
            </h1>
            <p className="text-sm text-zinc-500">/{project.slug}</p>
          </div>
        </div>
        <Link
          href="/projects"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          Back
        </Link>
      </div>

      {project.description && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {project.description}
        </p>
      )}

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
          <dt className="text-xs uppercase tracking-wide text-zinc-500">
            Active memories
          </dt>
          <dd className="text-lg font-medium">{stats.memoryCount}</dd>
        </div>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
          <dt className="text-xs uppercase tracking-wide text-zinc-500">
            In trash
          </dt>
          <dd className="text-lg font-medium">{stats.deletedCount}</dd>
        </div>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
          <dt className="text-xs uppercase tracking-wide text-zinc-500">
            Default importance
          </dt>
          <dd className="text-lg font-medium">
            {project.defaultImportance.toFixed(2)}
          </dd>
        </div>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
          <dt className="text-xs uppercase tracking-wide text-zinc-500">
            Last updated
          </dt>
          <dd className="text-lg font-medium">{lastUpdated}</dd>
        </div>
      </dl>

      {stats.topTags.length > 0 && (
        <div>
          <h2 className="text-sm font-medium mb-2">Top tags</h2>
          <div className="flex flex-wrap gap-1.5">
            {stats.topTags.map(({ tag, count }) => (
              <span
                key={tag}
                className="text-xs rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-0.5"
              >
                #{tag} <span className="text-zinc-500">×{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3 text-sm">
        <Link
          href={`/export?project=${project.id}`}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900"
        >
          Export this project
        </Link>
      </div>

      <div>
        <h2 className="text-lg font-medium mb-3">Memories ({memories.length})</h2>
        {memories.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No memories in this project yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {memories.map((m) => (
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
                    {MEMORY_TYPE_LABELS[m.type as keyof typeof MEMORY_TYPE_LABELS]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
                  {m.content}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <details className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Edit metadata
        </summary>
        <div className="mt-4">
          <ProjectEditForm project={project} />
        </div>
      </details>

      <details id="delete" className="rounded-lg border border-red-200 dark:border-red-900 p-4">
        <summary className="cursor-pointer text-sm font-medium text-red-600 dark:text-red-400">
          Delete project
        </summary>
        <ProjectDeleteForm
          memoryCount={memories.length}
          projectId={project.id}
        />
      </details>
    </div>
    </AutoRefresh>
  );
}