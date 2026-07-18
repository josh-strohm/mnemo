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

      <button
        type="submit"
        className="self-start rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black px-5 py-2 text-sm font-medium hover:opacity-90"
      >
        {submitLabel}
      </button>
    </form>
  );
}