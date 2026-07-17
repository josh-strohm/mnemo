import Link from "next/link";
import { notFound } from "next/navigation";
import { getMemory } from "@/lib/memories";
import { listProjects } from "@/lib/projects";
import { updateMemoryAction, deleteMemoryAction } from "@/app/actions";
import { MemoryForm } from "@/app/memories/MemoryForm";
import { MEMORY_TYPE_LABELS } from "@/lib/schemas";

export default async function MemoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [memory, projects] = await Promise.all([
    getMemory(id),
    listProjects(),
  ]);

  if (!memory) {
    notFound();
  }

  const project = projects.find((p) => p.id === memory.projectId);
  const scopeLabel = project ? project.name : "Global";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{memory.title}</h1>
        <Link
          href="/memories"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          Back
        </Link>
      </div>

      <div className="text-sm text-zinc-500">
        {MEMORY_TYPE_LABELS[memory.type as keyof typeof MEMORY_TYPE_LABELS]} · {scopeLabel}
      </div>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
        <p className="whitespace-pre-wrap text-sm">{memory.content}</p>
        {memory.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {memory.tags.map((t) => (
              <span
                key={t}
                className="text-xs rounded bg-zinc-100 dark:bg-zinc-900 px-2 py-0.5"
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>

      <details className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Edit
        </summary>
        <div className="mt-4">
          <MemoryForm
            action={updateMemoryAction}
            projects={projects}
            memory={memory}
            submitLabel="Save changes"
          />
        </div>
      </details>

      <details className="rounded-lg border border-red-200 dark:border-red-900 p-4">
        <summary className="cursor-pointer text-sm font-medium text-red-600 dark:text-red-400">
          Delete
        </summary>
        <form action={deleteMemoryAction} className="mt-4">
          <input type="hidden" name="id" value={memory.id} />
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
            This permanently deletes the memory. This cannot be undone.
          </p>
          <button
            type="submit"
            className="rounded-md border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-2 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950"
          >
            Delete memory
          </button>
        </form>
      </details>
    </div>
  );
}