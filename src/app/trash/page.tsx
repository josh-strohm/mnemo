import Link from "next/link";
import { listDeleted } from "@/lib/memories";
import { MEMORY_TYPE_LABELS } from "@/lib/schemas";
import {
  restoreMemoryAction,
  hardDeleteMemoryAction,
} from "@/app/actions";
import { listProjects } from "@/lib/projects";

export const dynamic = "force-dynamic";

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

export default async function TrashPage() {
  const [memories, projects] = await Promise.all([
    listDeleted(),
    listProjects(),
  ]);

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Trash</h1>
        <Link href="/memories" className="text-sm hover:underline">
          ← Memories
        </Link>
      </header>

      {memories.length === 0 ? (
        <p className="text-sm text-zinc-500">Trash is empty.</p>
      ) : (
        <ul className="space-y-3">
          {memories.map((m) => {
            const project = projects.find((p) => p.id === m.projectId);
            const projectLabel = project ? project.name : "Global";
            const deleted = formatRelative(m.deletedAt);
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
                    {MEMORY_TYPE_LABELS[m.type as keyof typeof MEMORY_TYPE_LABELS]} · {projectLabel}
                    {deleted ? ` · deleted ${deleted}` : ""}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
                  {m.content}
                </p>
                <form className="mt-3 flex gap-2">
                  <input type="hidden" name="id" value={m.id} />
                  <button
                    formAction={restoreMemoryAction}
                    className="text-xs rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  >
                    Restore
                  </button>
                  <button
                    formAction={hardDeleteMemoryAction}
                    className="text-xs rounded border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 px-2 py-1 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    Delete forever
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}