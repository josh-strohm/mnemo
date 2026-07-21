import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getMemory,
  getRelatedMemories,
  listLinkableMemories,
} from "@/lib/memories";
import { listVersions } from "@/lib/versions";
import { listProjects } from "@/lib/projects";
import {
  updateMemoryAction,
  deleteMemoryAction,
  restoreVersionAction,
  linkMemoryAction,
  unlinkMemoryAction,
} from "@/app/actions";
import { MemoryForm } from "@/app/memories/MemoryForm";
import { MEMORY_TYPE_LABELS } from "@/lib/schemas";

export default async function MemoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [memory, projects, versions, related, linkable] = await Promise.all([
    getMemory(id),
    listProjects(),
    listVersions(id),
    getRelatedMemories(id),
    listLinkableMemories(id),
  ]);

  if (!memory) {
    notFound();
  }

  const project = projects.find((p) => p.id === memory.projectId);
  const scopeLabel = project ? project.name : "Global";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold inline-flex items-center gap-2">
          {memory.isPinned && <span aria-hidden title="pinned">📌</span>}
          {memory.title}
        </h1>
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

      <details className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
        <summary className="cursor-pointer text-sm font-medium">
          History ({versions.length})
        </summary>
        <div className="mt-4 space-y-3">
          {versions.length === 0 ? (
            <p className="text-sm text-zinc-500">No saved versions yet.</p>
          ) : (
            versions.map((v) => (
              <div
                key={v.id}
                className="rounded border border-zinc-200 dark:border-zinc-800 p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">v{v.version}</span>
                  <span className="text-xs text-zinc-500">
                    {new Date(v.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 font-medium">{v.title}</p>
                <p className="mt-1 text-zinc-600 dark:text-zinc-400 line-clamp-2">
                  {v.content}
                </p>
                <form className="mt-2" action={restoreVersionAction}>
                  <input type="hidden" name="id" value={memory.id} />
                  <input type="hidden" name="versionId" value={v.id} />
                  <button
                    type="submit"
                    className="text-xs rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  >
                    Restore this version
                  </button>
                </form>
              </div>
            ))
          )}
        </div>
      </details>

      <details className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Related memories ({related.length})
        </summary>
        <div className="mt-4 space-y-3">
          {related.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No links yet. Link related memories to build a graph.
            </p>
          ) : (
            related.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 rounded border border-zinc-200 dark:border-zinc-800 p-2 text-sm"
              >
                <Link
                  href={`/memories/${r.id}`}
                  className="font-medium hover:underline"
                >
                  {r.title}
                </Link>
                <form action={unlinkMemoryAction}>
                  <input type="hidden" name="id" value={memory.id} />
                  <input type="hidden" name="linkId" value={r.id} />
                  <button
                    type="submit"
                    className="text-xs rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  >
                    Unlink
                  </button>
                </form>
              </div>
            ))
          )}

          {linkable.length > 0 ? (
            <form action={linkMemoryAction} className="mt-2">
              <input type="hidden" name="id" value={memory.id} />
              <label className="block text-xs text-zinc-500 mb-1">
                Link another memory
              </label>
              <div className="flex gap-2">
                <select
                  name="linkId"
                  className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 px-2 py-2 text-sm"
                >
                  {linkable.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900"
                >
                  Link
                </button>
              </div>
            </form>
          ) : related.length === 0 ? null : (
            <p className="text-xs text-zinc-500">
              No other memories available to link.
            </p>
          )}
        </div>
      </details>

      <details className="rounded-lg border border-red-200 dark:border-red-900 p-4">
        <summary className="cursor-pointer text-sm font-medium text-red-600 dark:text-red-400">
          Delete
        </summary>
        <form action={deleteMemoryAction} className="mt-4">
          <input type="hidden" name="id" value={memory.id} />
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
            This moves the memory to Trash (soft delete). You can restore it
            from the Trash page, or permanently delete it from there.
          </p>
          <button
            type="submit"
            className="rounded-md border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-2 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950"
          >
            Move to trash
          </button>
        </form>
      </details>
    </div>
  );
}