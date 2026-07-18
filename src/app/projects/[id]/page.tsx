import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/projects";
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

  const memories = await listMemories({ project: project.id });

  return (
    <AutoRefresh>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <p className="text-sm text-zinc-500">/{project.slug}</p>
          </div>
        <Link
          href="/projects"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          Back
        </Link>
      </div>

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
          Edit name &amp; slug
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