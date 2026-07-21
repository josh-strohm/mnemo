import { MEMORY_TYPES, MEMORY_TYPE_LABELS } from "@/lib/schemas";
import type { Project } from "@/generated/prisma/client";
import type { MemoryWithTags } from "@/lib/memories";

type MemoryFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  projects: Project[];
  memory?: MemoryWithTags;
  submitLabel: string;
};

export function MemoryForm({
  action,
  projects,
  memory,
  submitLabel,
}: MemoryFormProps) {
  return (
    <form action={action} className="flex flex-col gap-4">
      {memory && <input type="hidden" name="id" value={memory.id} />}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Type</span>
        <select
          name="type"
          defaultValue={memory?.type ?? MEMORY_TYPES[0]}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 px-3 py-2 text-sm"
        >
          {MEMORY_TYPES.map((t) => (
            <option key={t} value={t}>
              {MEMORY_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Title</span>
        <input
          type="text"
          name="title"
          defaultValue={memory?.title ?? ""}
          required
          maxLength={200}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Content</span>
        <textarea
          name="content"
          defaultValue={memory?.content ?? ""}
          required
          rows={6}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Tags (comma-separated)</span>
        <input
          type="text"
          name="tags"
          defaultValue={memory?.tags.join(", ") ?? ""}
          placeholder="bug, ui, api"
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Project</span>
        <select
          name="projectId"
          defaultValue={memory?.projectId ?? ""}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 px-3 py-2 text-sm"
        >
          <option value="">Global (no project)</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <details className="border border-zinc-200 dark:border-zinc-800 rounded-md p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Tier 3 options (importance, pinning, expiry, source)
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                Importance (0..1, blank = 0.5)
              </span>
              <input
                type="number"
                name="importance"
                min={0}
                max={1}
                step={0.05}
                defaultValue={
                  memory && memory.importance !== 0.5
                    ? memory.importance
                    : ""
                }
                className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                Expires at (ISO 8601, blank = never)
              </span>
              <input
                type="text"
                name="expiresAt"
                defaultValue={
                  memory && memory.expiresAt
                    ? new Date(memory.expiresAt).toISOString().slice(0, 16)
                    : ""
                }
                placeholder="2026-12-31T23:59"
                className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm font-mono"
              />
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                Source (USER_SAID, AGENT_INFERRED, CORRECTION, IMPORTED)
              </span>
              <input
                type="text"
                name="source"
                defaultValue={memory?.source ?? ""}
                placeholder="AGENT_INFERRED"
                className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm font-mono"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                Source session id (optional)
              </span>
              <input
                type="text"
                name="sourceSessionId"
                defaultValue={memory?.sourceSessionId ?? ""}
                placeholder="hermes-session-id"
                className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm font-mono"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isPinned"
              value="yes"
              defaultChecked={memory?.isPinned === true}
              className="rounded"
            />
            <span className="font-medium">
              📌 Pin this memory — always include in /api/export regardless of
              budget
            </span>
          </label>
        </div>
      </details>

      <button
        type="submit"
        className="self-start rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black px-5 py-2 text-sm font-medium hover:opacity-90"
      >
        {submitLabel}
      </button>
    </form>
  );
}