"use client";

import { useActionState } from "react";
import { deleteProjectAction } from "@/app/actions";

export function ProjectDeleteForm({
  memoryCount,
  projectId,
}: {
  memoryCount: number;
  projectId: string;
}) {
  const [state, action, pending] = useActionState<
    { error?: string } | undefined,
    FormData
  >(deleteProjectAction, undefined);

  return (
    <form action={action} className="mt-4 flex flex-col gap-3">
      <input type="hidden" name="id" value={projectId} />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        This project&apos;s {memoryCount}{" "}
        {memoryCount === 1 ? "memory" : "memories"} will become global, not
        deleted.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="confirm" value="yes" required />
        <span>
          I understand — this project&apos;s {memoryCount}{" "}
          {memoryCount === 1 ? "memory" : "memories"} will become global.
        </span>
      </label>
      {state?.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-2 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
      >
        Delete project
      </button>
    </form>
  );
}