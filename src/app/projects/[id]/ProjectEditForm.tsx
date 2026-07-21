"use client";

import { useActionState } from "react";
import { updateProjectAction } from "@/app/actions";
import type { Project } from "@/generated/prisma/client";
import { ProjectFields } from "@/app/projects/ProjectFields";

export function ProjectEditForm({ project }: { project: Project }) {
  const [state, action, pending] = useActionState<
    { error?: string } | undefined,
    FormData
  >(updateProjectAction, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={project.id} />

      <ProjectFields
        defaultValues={{
          name: project.name,
          slug: project.slug,
          description: project.description,
          color: project.color,
          icon: project.icon,
          defaultImportance: project.defaultImportance,
          isArchived: project.isArchived,
          exportTemplate: project.exportTemplate,
          maxExportChars: project.maxExportChars,
          includeGlobal: project.includeGlobal,
        }}
      />

      <p className="text-xs text-amber-600 dark:text-amber-400">
        Caution: external agents reference this project by its slug
        (<code>GET /api/export?project={project.slug}</code>,
        <code>POST /api/memories with projectSlug: {project.slug}</code>).
        Changing a slug breaks those references until they are updated.
      </p>

      {state?.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black px-5 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        Save changes
      </button>
    </form>
  );
}
