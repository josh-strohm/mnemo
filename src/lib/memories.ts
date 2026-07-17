import { prisma } from "@/lib/db";
import {
  parseDbTags,
  tagsToDbString,
  type MemoryCreateInput,
  type MemoryUpdateInput,
  type MemoryFilters,
} from "@/lib/schemas";

export type MemoryWithTags = {
  id: string;
  type: string;
  title: string;
  content: string;
  tags: string[];
  projectId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function withTags(m: {
  id: string;
  type: string;
  title: string;
  content: string;
  tags: string;
  projectId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): MemoryWithTags {
  return {
    id: m.id,
    type: m.type,
    title: m.title,
    content: m.content,
    tags: parseDbTags(m.tags),
    projectId: m.projectId,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

export async function listMemories(
  filters: MemoryFilters,
): Promise<MemoryWithTags[]> {
  const where: {
    OR?: Array<{ title?: { contains: string }; content?: { contains: string } }>;
    type?: string;
    projectId?: null | { not: null };
  } = {};

  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q } },
      { content: { contains: filters.q } },
    ];
  }
  if (filters.type) {
    where.type = filters.type;
  }
  if (filters.project === "global") {
    where.projectId = null;
  } else if (filters.project) {
    where.projectId = { not: null };
    // filter to a specific project handled below
  }

  let memories = await prisma.memory.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { project: true },
  });

  if (filters.project && filters.project !== "global") {
    memories = memories.filter((m) => m.projectId === filters.project);
  }

  if (filters.tag) {
    const tagLower = filters.tag.toLowerCase();
    memories = memories.filter((m) =>
      parseDbTags(m.tags).some((t) => t.toLowerCase() === tagLower),
    );
  }

  return memories.map(withTags);
}

export async function getMemory(
  id: string,
): Promise<MemoryWithTags | null> {
  const m = await prisma.memory.findUnique({
    where: { id },
    include: { project: true },
  });
  if (!m) return null;
  return withTags(m);
}

export async function createMemory(
  input: MemoryCreateInput,
): Promise<MemoryWithTags> {
  const created = await prisma.memory.create({
    data: {
      type: input.type,
      title: input.title,
      content: input.content,
      tags: tagsToDbString(input.tags),
      projectId: input.projectId ?? null,
    },
  });
  return withTags(created);
}

export async function updateMemory(
  input: MemoryUpdateInput,
): Promise<MemoryWithTags> {
  const updated = await prisma.memory.update({
    where: { id: input.id },
    data: {
      type: input.type,
      title: input.title,
      content: input.content,
      tags: tagsToDbString(input.tags),
      projectId: input.projectId ?? null,
    },
  });
  return withTags(updated);
}

export async function deleteMemory(id: string): Promise<void> {
  await prisma.memory.delete({ where: { id } });
}