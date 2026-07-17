import { prisma } from "@/lib/db";
import { parseDbTags, MEMORY_TYPE_ORDER, MEMORY_TYPE_LABELS } from "@/lib/schemas";
import type { MemoryType } from "@/lib/schemas";

type RawMemory = {
  id: string;
  type: string;
  title: string;
  content: string;
  tags: string;
  projectId: string | null;
};

export async function compileExport(
  selection: string | "global" | "all",
): Promise<string> {
  let memories: RawMemory[] = [];

  if (selection === "global") {
    memories = await prisma.memory.findMany({
      where: { projectId: null },
      orderBy: { createdAt: "asc" },
    });
  } else if (selection === "all") {
    memories = await prisma.memory.findMany({
      orderBy: { createdAt: "asc" },
    });
  } else {
    const [projectMemories, globalMemories] = await Promise.all([
      prisma.memory.findMany({
        where: { projectId: selection },
        orderBy: { createdAt: "asc" },
      }),
      prisma.memory.findMany({
        where: { projectId: null },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    memories = [...projectMemories, ...globalMemories];
  }

  const byType = new Map<MemoryType, RawMemory[]>();
  for (const t of MEMORY_TYPE_ORDER) {
    byType.set(t, []);
  }
  for (const m of memories) {
    const t = m.type as MemoryType;
    if (!byType.has(t)) continue;
    byType.get(t)!.push(m);
  }

  const sections: string[] = [];
  for (const t of MEMORY_TYPE_ORDER) {
    const items = byType.get(t)!;
    if (items.length === 0) continue;
    sections.push(`## ${MEMORY_TYPE_LABELS[t]}s`);
    for (const m of items) {
      const tags = parseDbTags(m.tags);
      const tagSuffix =
        tags.length > 0 ? " " + tags.map((tg) => `#${tg}`).join(" ") : "";
      sections.push(`- **${m.title}** — ${m.content}${tagSuffix}`);
    }
    sections.push("");
  }

  if (sections.length === 0) {
    return "<!-- BEGIN:mnemo -->\n<!-- END:mnemo -->";
  }

  return `<!-- BEGIN:mnemo -->\n${sections.join("\n").trim()}\n<!-- END:mnemo -->`;
}