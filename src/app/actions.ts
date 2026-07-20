"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  memoryCreateSchema,
  memoryUpdateSchema,
  projectCreateSchema,
  projectUpdateSchema,
} from "@/lib/schemas";
import {
  createMemory,
  updateMemory,
  deleteMemory,
  restoreMemory,
  updateMemoryPartial,
  addLinks,
  removeLinks,
} from "@/lib/memories";
import { restoreVersion } from "@/lib/versions";
import {
  createProject,
  updateProject,
  deleteProject,
  ProjectSlugTakenError,
} from "@/lib/projects";

function requireString(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") {
    throw new Error(`Expected string for field "${key}"`);
  }
  return value;
}

/** Read a form field as a string, returning undefined when empty/missing. */
function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/** Read a numeric form field; undefined when blank/malformed. */
function optionalNumber(formData: FormData, key: string): number | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function createMemoryAction(formData: FormData) {
  const projectIdRaw = formData.get("projectId");
  const projectId =
    typeof projectIdRaw === "string" && projectIdRaw.length > 0
      ? projectIdRaw
      : null;

  const input = memoryCreateSchema.parse({
    type: requireString(formData, "type"),
    title: requireString(formData, "title"),
    content: requireString(formData, "content"),
    tags: requireString(formData, "tags"),
    projectId,
  });

  await createMemory(input);
  revalidatePath("/memories");
  redirect("/memories");
}

export async function updateMemoryAction(formData: FormData) {
  const projectIdRaw = formData.get("projectId");
  const projectId =
    typeof projectIdRaw === "string" && projectIdRaw.length > 0
      ? projectIdRaw
      : null;

  const input = memoryUpdateSchema.parse({
    id: requireString(formData, "id"),
    type: requireString(formData, "type"),
    title: requireString(formData, "title"),
    content: requireString(formData, "content"),
    tags: requireString(formData, "tags"),
    projectId,
  });

  await updateMemory(input);
  revalidatePath("/memories");
  revalidatePath(`/memories/${input.id}`);
  redirect("/memories");
}

export async function deleteMemoryAction(formData: FormData) {
  const id = requireString(formData, "id");
  // UI delete = soft by default (recoverable from /trash).
  await deleteMemory(id);
  revalidatePath("/memories");
  revalidatePath("/trash");
  redirect("/memories");
}

export async function restoreMemoryAction(formData: FormData) {
  const id = requireString(formData, "id");
  await restoreMemory(id);
  revalidatePath("/trash");
  revalidatePath("/memories");
  redirect("/trash");
}

export async function hardDeleteMemoryAction(formData: FormData) {
  const id = requireString(formData, "id");
  await deleteMemory(id, { hard: true });
  revalidatePath("/trash");
  revalidatePath("/memories");
  redirect("/trash");
}

export async function restoreVersionAction(formData: FormData) {
  const id = requireString(formData, "id");
  const versionId = requireString(formData, "versionId");
  await restoreVersion(id, versionId, (memId, fields) =>
    updateMemoryPartial(memId, fields, fields.projectId),
  );
  revalidatePath("/memories");
  revalidatePath(`/memories/${id}`);
  redirect(`/memories/${id}`);
}

export async function linkMemoryAction(formData: FormData) {
  const id = requireString(formData, "id");
  const linkId = requireString(formData, "linkId");
  if (linkId.length === 0) {
    return; // nothing selected
  }
  await addLinks(id, [linkId]);
  revalidatePath(`/memories/${id}`);
}

export async function unlinkMemoryAction(formData: FormData) {
  const id = requireString(formData, "id");
  const linkId = requireString(formData, "linkId");
  await removeLinks(id, [linkId]);
  revalidatePath(`/memories/${id}`);
}

export async function createProjectAction(formData: FormData) {
  const input = projectCreateSchema.parse({
    name: requireString(formData, "name"),
    slug: requireString(formData, "slug"),
    description: optionalString(formData, "description"),
    color: optionalString(formData, "color"),
    icon: optionalString(formData, "icon"),
    defaultImportance: optionalNumber(formData, "defaultImportance"),
    isArchived: formData.get("isArchived") === "yes",
  });

  const project = await createProject(input);
  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

export async function deleteProjectAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const id = requireString(formData, "id");
  const confirm = formData.get("confirm");
  if (confirm !== "yes") {
    return { error: "Please check the confirmation box to delete." };
  }
  await deleteProject(id);
  revalidatePath("/projects");
  redirect("/projects");
}

export async function updateProjectAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const input = projectUpdateSchema.parse({
    id: requireString(formData, "id"),
    name: optionalString(formData, "name"),
    slug: optionalString(formData, "slug"),
    description: optionalString(formData, "description"),
    color: optionalString(formData, "color"),
    icon: optionalString(formData, "icon"),
    defaultImportance: optionalNumber(formData, "defaultImportance"),
    isArchived: formData.get("isArchived") === "yes",
  });

  try {
    await updateProject(input.id, {
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      color: input.color ?? null,
      icon: input.icon ?? null,
      defaultImportance: input.defaultImportance,
      isArchived: input.isArchived,
    });
  } catch (err) {
    if (err instanceof ProjectSlugTakenError) {
      return { error: err.message };
    }
    throw err;
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${input.id}`);
  redirect(`/projects/${input.id}`);
}