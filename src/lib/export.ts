import { listAllForExport, listGlobalAndProject, touchLastAccessedAt } from "@/lib/memories";
import {
  MEMORY_TYPE_ORDER,
  MEMORY_TYPE_LABELS,
  type MemoryType,
} from "@/lib/schemas";
import { scoreMemoryAgainstQuery, tokenizeQuery } from "@/lib/scoring";
import type { MemoryWithTags } from "@/lib/memories";

export type ExportPriority = "importance" | "recent" | "query";

export type ExportFormat = "markdown" | "json" | "hermes-txt";

export type CompileExportOptions = {
  maxChars?: number;
  query?: string;
  includeExpired?: boolean;
  priority?: ExportPriority;
  format?: ExportFormat;
};

export type CompileExportResult = {
  format: ExportFormat;
  /** markdown body wrapped in <!-- BEGIN:mnemo --> markers. */
  markdown: string;
  /** compact one-line-per-memory transcript for agent ingestion. */
  hermesTxt: string;
  /** serialised memories array as a JSON string (no enclosing wrapper). */
  json: string;
  /** body for the requested `format` — convenience for API routes. */
  body: string;
  /** MIME type for the requested `format`. */
  contentType: string;
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

/**
 * Compact one-line-per-memory transcript for Hermes-style agents. Fields are
 * pipe-separated; tags are joined with spaces (tags are constrained to
 * `[a-z0-9-]+` so they can't contain pipes or newlines). Newlines within
 * title/content are replaced with spaces so each memory stays on one line.
 */
function renderHermesLine(m: MemoryWithTags): string {
  const esc = (s: string) => s.replace(/[\r\n|]+/g, " ");
  const tagsStr = m.tags.map((t) => `#${t}`).join(" ");
  const importance = m.importance.toFixed(2);
  const updated = m.updatedAt.toISOString();
  return [
    m.type,
    esc(m.title),
    esc(m.content),
    tagsStr,
    `imp=${importance}`,
    `updated=${updated}`,
  ]
    .filter((part) => part !== "")
    .join(" | ");
}

type SerializableMemory = {
  id: string;
  type: string;
  title: string;
  content: string;
  tags: string[];
  importance: number;
  source: string | null;
  project: { id: string; slug: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  relatedIds: string[];
  deletedAt: string | null;
};

function toSerializable(m: MemoryWithTags): SerializableMemory {
  return {
    id: m.id,
    type: m.type,
    title: m.title,
    content: m.content,
    tags: m.tags,
    importance: m.importance,
    source: m.source,
    project: m.project
      ? { id: m.project.id, slug: m.project.slug, name: m.project.name }
      : null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    expiresAt: m.expiresAt ? m.expiresAt.toISOString() : null,
    relatedIds: m.relatedIds,
    deletedAt: m.deletedAt ? m.deletedAt.toISOString() : null,
  };
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

  const hermesLines = included.map(renderHermesLine);
  const hermesTxt = hermesLines.join("\n");

  const json = JSON.stringify(
    {
      schema: "mnemo.memories.v1",
      generatedAt: new Date().toISOString(),
      count: included.length,
      memories: included.map(toSerializable),
    },
    null,
    2,
  );

  const format: ExportFormat = opts.format ?? "markdown";
  const formatBody =
    format === "json" ? json : format === "hermes-txt" ? hermesTxt : markdown;
  const contentType =
    format === "json"
      ? "application/json; charset=utf-8"
      : format === "hermes-txt"
        ? "text/plain; charset=utf-8"
        : "text/markdown; charset=utf-8";

  // Track access for recency signals (fire-and-forget).
  if (included.length > 0) {
    void touchLastAccessedAt(included.map((m) => m.id));
  }

  return {
    format,
    markdown,
    hermesTxt,
    json,
    body: formatBody,
    contentType,
    includedCount: included.length,
    totalCount: total,
    chars: formatBody.length,
  };
}