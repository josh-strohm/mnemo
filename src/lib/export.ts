import { listAllForExport, listGlobalAndProject, touchLastAccessedAt } from "@/lib/memories";
import {
  MEMORY_TYPE_ORDER,
  MEMORY_TYPE_LABELS,
  type MemoryType,
} from "@/lib/schemas";
import { scoreMemoryAgainstQuery, tokenizeQuery } from "@/lib/scoring";
import type { MemoryWithTags } from "@/lib/memories";

export type ExportPriority = "importance" | "recent" | "query";

export type CompileExportOptions = {
  maxChars?: number;
  query?: string;
  includeExpired?: boolean;
  priority?: ExportPriority;
};

export type CompileExportResult = {
  markdown: string;
  includedCount: number;
  totalCount: number;
  chars: number;
};

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

function isExpired(expiresAt: Date | null, now: Date): boolean {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

function sortMemories(
  memories: MemoryWithTags[],
  priority: ExportPriority,
  query: string | undefined,
): MemoryWithTags[] {
  if (priority === "query" && query) {
    const tokens = tokenizeQuery(query);
    return memories
      .map((m) => ({
        m,
        s: scoreMemoryAgainstQuery({
          title: m.title,
          content: m.content,
          tags: m.tags,
          tokens,
          updatedAt: m.updatedAt,
        }),
      }))
      .sort((a, b) => b.s.score - a.s.score)
      .map((x) => x.m);
  }
  if (priority === "importance") {
    return [...memories].sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });
  }
  // recent (default)
  return [...memories].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
}

function renderItem(m: MemoryWithTags): string {
  const tags = m.tags;
  const tagSuffix =
    tags.length > 0 ? " " + tags.map((tg) => `#${tg}`).join(" ") : "";
  const meta: string[] = [`updated ${dateFmt.format(m.updatedAt)}`];
  if (m.importance !== 0.5) meta.push(`importance: ${m.importance.toFixed(2)}`);
  const metaStr = ` (${meta.join("; ")})`;
  return `- **${m.title}**${metaStr} — ${m.content}${tagSuffix}`;
}

export async function compileExport(
  selection: string | "global" | "all",
  opts: CompileExportOptions = {},
): Promise<CompileExportResult> {
  const priority: ExportPriority = opts.priority ?? "recent";
  const includeExpired = opts.includeExpired === true;
  const now = new Date();

  // Fetch the candidate set for the selection (a specific project also
  // includes global-scope memories, matching the prior behaviour).
  let memories: MemoryWithTags[];
  if (selection === "all") {
    memories = await listAllForExport({ includeExpired });
  } else if (selection === "global") {
    memories = await listAllForExport({ project: "global", includeExpired });
  } else {
    const all = await listGlobalAndProject(selection);
    memories = includeExpired ? all : all.filter((m) => !isExpired(m.expiresAt, now));
  }

  const total = memories.length;
  const sorted = sortMemories(memories, priority, opts.query);

  // Apply the character budget (naive estimate: rendered item length + newline).
  // Highest-priority memories are kept first; the rest are omitted.
  let included = sorted;
  if (opts.maxChars && opts.maxChars > 0) {
    const kept: MemoryWithTags[] = [];
    let acc = 0;
    for (const m of sorted) {
      const est = renderItem(m).length + 1;
      if (kept.length > 0 && acc + est > opts.maxChars) break;
      acc += est;
      kept.push(m);
    }
    included = kept;
  }

  // Group by type, preserving the priority order within each group.
  const byType = new Map<MemoryType, MemoryWithTags[]>();
  for (const t of MEMORY_TYPE_ORDER) byType.set(t, []);
  for (const m of included) {
    const t = m.type as MemoryType;
    if (!byType.has(t)) continue;
    byType.get(t)!.push(m);
  }

  const sections: string[] = [];
  for (const t of MEMORY_TYPE_ORDER) {
    const items = byType.get(t)!;
    if (items.length === 0) continue;
    sections.push(`## ${MEMORY_TYPE_LABELS[t]}s`);
    for (const m of items) sections.push(renderItem(m));
    sections.push("");
  }

  const omitted = total - included.length;
  if (omitted > 0) {
    sections.push(
      `[+${omitted} more memories omitted - increase maxChars or use search]`,
      "",
    );
  }

  const body = sections.join("\n").trim();
  const markdown =
    body.length === 0
      ? "<!-- BEGIN:mnemo -->\n<!-- END:mnemo -->"
      : `<!-- BEGIN:mnemo -->\n${body}\n<!-- END:mnemo -->`;

  // Track access for recency signals (fire-and-forget).
  if (included.length > 0) {
    void touchLastAccessedAt(included.map((m) => m.id));
  }

  return {
    markdown,
    includedCount: included.length,
    totalCount: total,
    chars: markdown.length,
  };
}