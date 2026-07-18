import { prisma } from "@/lib/db";
import type { Project } from "@/generated/prisma/client";

export class ProjectSlugTakenError extends Error {
  code = "SLUG_TAKEN" as const;
  constructor(slug: string) {
    super(`Slug "${slug}" is already taken by another project`);
    this.name = "ProjectSlugTakenError";
  }
}

export async function listProjects(): Promise<Project[]> {
  return prisma.project.findMany({
    orderBy: { name: "asc" },
  });
}

export async function getProject(id: string): Promise<Project | null> {
  return prisma.project.findUnique({ where: { id } });
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  return prisma.project.findUnique({ where: { slug } });
}

export async function createProject(input: {
  name: string;
  slug: string;
}): Promise<Project> {
  return prisma.project.create({
    data: { name: input.name, slug: input.slug },
  });
}

export async function updateProject(
  id: string,
  input: { name: string; slug: string },
): Promise<Project> {
  const current = await prisma.project.findUnique({ where: { id } });
  if (!current) {
    throw new Error(`Project not found: ${id}`);
  }

  if (input.slug !== current.slug) {
    const existing = await prisma.project.findUnique({
      where: { slug: input.slug },
    });
    if (existing && existing.id !== id) {
      throw new ProjectSlugTakenError(input.slug);
    }
  }

  try {
    return await prisma.project.update({
      where: { id },
      data: { name: input.name, slug: input.slug },
    });
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.includes("Unique constraint failed")
    ) {
      throw new ProjectSlugTakenError(input.slug);
    }
    throw err;
  }
}

export async function deleteProject(id: string): Promise<void> {
  await prisma.project.delete({ where: { id } });
}