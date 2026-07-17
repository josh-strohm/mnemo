"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  memoryCreateSchema,
  memoryUpdateSchema,
  projectCreateSchema,
} from "@/lib/schemas";
import {
  createMemory,
  updateMemory,
  deleteMemory,
} from "@/lib/memories";
import { createProject, deleteProject } from "@/lib/projects";

function requireString(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") {
    throw new Error(`Expected string for field "${key}"`);
  }
  return value;
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
  await deleteMemory(id);
  revalidatePath("/memories");
  redirect("/memories");
}

export async function createProjectAction(formData: FormData) {
  const input = projectCreateSchema.parse({
    name: requireString(formData, "name"),
    slug: requireString(formData, "slug"),
  });

  const project = await createProject(input);
  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

export async function deleteProjectAction(formData: FormData) {
  const id = requireString(formData, "id");
  await deleteProject(id);
  revalidatePath("/projects");
  redirect("/projects");
}