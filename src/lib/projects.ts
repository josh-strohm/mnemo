import { prisma } from "@/lib/db";
import type { Project } from "@/generated/prisma/client";

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

export async function deleteProject(id: string): Promise<void> {
  await prisma.project.delete({ where: { id } });
}