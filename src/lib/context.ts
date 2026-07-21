/**
 * Context assembly — Tier 3.
 * Budget-aware composition of pinned + hybrid search + expiring + global.
 *
 * This is what Hermes session-start calls instead of /api/export when
 * `q=` is provided: it respects pinned always, searches with optional
 * reranking, fills until the char budget, tracks tokens, and honours
 * `always_include` (explicit memory ids that must appear).
 *
 * Response shape matches /api/export hands but with richer metadata:
 *   { markdown, hermesTxt, json, body, contentType, tokens, included, omitted, budget }
 */

import type { MemoryWithTags } from "@/lib/memories";
import type { ExportFormat } from "@/lib/export";
import { listAllForExport, listGlobalAndProject, listMemoriesByIds, touchLastAccessedAt } from "@/lib/memories";
import { getProjectBySlug } from "@/lib/projects";
import { hybridSearch, type SearchHit } from "@/lib/search";
import { rerankHits } from "@/lib/rerank";
import { MEMORY_TYPE_ORDER, MEMORY_TYPE_LABELS, type MemoryType } from "@/lib/schemas";

export type AssembleContextParams = {
  project?: string; // slug|id|all|global|undefined -> all
  q?: string;
  budget: number; // char budget (0 = no limit)
  alwaysIncludeIds?: string[];
  includeExpired?: boolean;
  includeGlobal?: boolean;
  format?: ExportFormat;
  /** optional now override for deterministic tests */
  now?: Date;
};

export type AssembledContext = {
  format: ExportFormat;
  markdown: string;
  hermesTxt: string;
  json: string;
  body: string;
  contentType: string;
  tokens: number; // estimated chars/4
  included: MemoryWithTags[];
  includedCount: number;
  totalCount: number;
  omitted: number;
  budget: number;
  chars: number;
};

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

function isExpired(expiresAt: Date | null, now: Date): boolean {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

function renderItem(m: MemoryWithTags): string {
  const tags = m.tags;
  const tagSuffix = tags.length > 0 ? " " + tags.map((tg) => `#${tg}`).join(" ") : "";
  const meta: string[] = [`updated ${dateFmt.format(m.updatedAt)}`];
  if (m.importance !== 0.5) meta.push(`importance: ${m.importance.toFixed(2)}`);
  if (m.isPinned) meta.push("pinned");
  const metaStr = ` (${meta.join("; ")})`;
  return `- **${m.title}**${metaStr} — ${m.content}${tagSuffix}`;
}

function renderHermesLine(m: MemoryWithTags): string {
  const esc = (s: string) => s.replace(/[\r\n|]+/g, " ");
  const tagsStr = m.tags.map((t) => `#${t}`).join(" ");
  const importance = m.importance.toFixed(2);
  const updated = m.updatedAt.toISOString();
  const pinFlag = m.isPinned ? "pinned" : "";
  return [m.type, esc(m.title), esc(m.content), tagsStr, `imp=${importance}`, `updated=${updated}`, pinFlag]
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
  isPinned: boolean;
  source: string | null;
  project: { id: string; slug: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  relatedIds: string[];
  score?: number;
  reason?: string;
};

function toSerializable(m: MemoryWithTags & { score?: number; reason?: string }): SerializableMemory {
  return {
    id: m.id,
    type: m.type,
    title: m.title,
    content: m.content,
    tags: m.tags,
    importance: m.importance,
    isPinned: m.isPinned,
    source: m.source,
    project: m.project ? { id: m.project.id, slug: m.project.slug, name: m.project.name } : null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    expiresAt: m.expiresAt ? m.expiresAt.toISOString() : null,
    relatedIds: m.relatedIds,
    score: m.score,
    reason: m.reason,
  };
}

export async function assembleContext(params: AssembleContextParams): Promise<AssembledContext> {
  const now = params.now ?? new Date();
  const projectParam = params.project ?? "all";
  const format: ExportFormat = params.format ?? "markdown";
  const budget = Math.max(0, params.budget ?? 0);
  const q = params.q?.trim() || undefined;

  // Resolve projectId for scoped queries.
  let projectId: string | null | undefined = undefined;
  if (projectParam === "all") {
    projectId = undefined;
  } else if (projectParam === "global") {
    projectId = null;
  } else {
    const found = await getProjectBySlug(projectParam);
    if (found) projectId = found.id;
    // If project not found by slug but looks like a cuid, treat as id.
    else if (projectParam.length >= 10) projectId = projectParam;
    else projectId = undefined;
  }

  // 1) Always-included ids: fetch up-front (ignore deleted).
  let alwaysIncluded: MemoryWithTags[] = [];
  if (params.alwaysIncludeIds && params.alwaysIncludeIds.length > 0) {
    alwaysIncluded = await listMemoriesByIds(params.alwaysIncludeIds);
  }
  const alwaysIncludedIds = new Set(alwaysIncluded.map((m) => m.id));

  // 2) Candidate pool: all memories for export selection.
  let pool: MemoryWithTags[];
  if (projectParam === "all") {
    pool = await listAllForExport({ includeExpired: params.includeExpired === true });
  } else if (projectParam === "global") {
    pool = await listAllForExport({ project: "global", includeExpired: params.includeExpired === true });
  } else {
    if (projectId === null) {
      pool = await listAllForExport({ project: "global", includeExpired: params.includeExpired === true });
    } else if (projectId !== undefined) {
      const all = await listGlobalAndProject(projectId);
      pool = params.includeExpired === true ? all : all.filter((m) => !isExpired(m.expiresAt, now));
      // respect per-project includeGlobal if false
      try {
        const proj = projectId ? await getProjectBySlug(projectParam) : null;
        if (proj !== undefined && proj !== null) {
          const raw = proj as unknown as { includeGlobal?: boolean | null };
          if (raw.includeGlobal === false) {
            pool = pool.filter((m) => m.projectId === projectId);
          }
        }
      } catch {
        // ignore
      }
    } else {
      pool = await listAllForExport({ includeExpired: params.includeExpired === true });
    }
  }

  // Expired filtering already done for scoped cases; for all/global also filter.
  if (params.includeExpired !== true) {
    pool = pool.filter((m) => !isExpired(m.expiresAt, now));
  }

  // 3) Score and rank (if q present, hybridSearch, else sort by importance).
  type Scored = MemoryWithTags & { score: number; reason: string };
  let scored: Scored[];

  if (q) {
    const hits = await hybridSearch({
      q,
      projectId,
      k: 200,
      includeExpired: params.includeExpired === true,
      now,
    });
    const reranked = await rerankHits(q, hits as SearchHit[]);
    // Merge: hits already come from pool-like set, but enrich with pool isPinned etc.
    const poolById = new Map(pool.map((m) => [m.id, m]));
    scored = reranked
      .filter((h) => !alwaysIncludedIds.has(h.id))
      .map((h) => {
        const base = poolById.get(h.id) ?? h;
        return { ...base, score: h.score, reason: h.reason } as Scored;
      });
    // Append any pool memories not already in hits (low score tail) when q is short?
    // For recall, keep only hits when q present — pool's extra memories would be irrelevant.
  } else {
    scored = pool
      .filter((m) => !alwaysIncludedIds.has(m.id))
      .map((m) => ({
        ...m,
        score: m.importance + (m.isPinned ? 10 : 0),
        reason: "no-query:importance*",
      }))
      .sort((a, b) => {
        if ((b.isPinned ? 1 : 0) !== (a.isPinned ? 1 : 0)) return (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
        if (b.importance !== a.importance) return b.importance - a.importance;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      }) as Scored[];
  }

  // pinnedAlways: from the scored set + any alwaysIncluded pinned already excluded from scored.
  const pinnedFromScored = scored.filter((m) => m.isPinned);
  const nonPinnedScored = scored.filter((m) => !m.isPinned);
  // Always include pinned first.
  // scored order within pinned is already by score; non-pinned by score too.

  // 4) Budget fill.
  const budgetChars = budget > 0 ? budget : Number.MAX_SAFE_INTEGER;

  const included: Array<MemoryWithTags & { score?: number; reason?: string }> = [];

  // a) always-include (explicit, highest priority after pinned budget reserve).
  for (const m of alwaysIncluded) {
    if (included.some((x) => x.id === m.id)) continue;
    included.push(m);
  }

  // b) pinned (always, regardless of budget — but try to fit).
  const pinnedToAdd = pinnedFromScored.filter((m) => !included.some((x) => x.id === m.id));
  for (const m of pinnedToAdd) {
    included.push(m);
  }

  // c) fill with search hits by (importance*score) order until budget.
  let accChars = included.reduce((a, m) => a + renderItem(m).length + 1, 0);

  // For query path, sort by importance * score (or just score if importance unavailable).
  const fillSource = q
    ? [...nonPinnedScored].sort((a, b) => {
        const ia = (a.importance || 0.5) * (a.score || 0);
        const ib = (b.importance || 0.5) * (b.score || 0);
        return ib - ia;
      })
    : nonPinnedScored;

  for (const m of fillSource) {
    if (included.some((x) => x.id === m.id)) continue;
    const est = renderItem(m).length + 1;
    // Never omit pinned (already added); for non-pinned, stop when budget would overflow.
    if (budget > 0 && accChars + est > budgetChars && included.length > pinnedFromScored.length + alwaysIncluded.length) break;
    accChars += est;
    included.push(m);
  }

  // Touch lastAccessedAt for included ones.
  if (included.length > 0) {
    void touchLastAccessedAt(included.map((m) => m.id));
  }

  const totalPool = pool.length + alwaysIncluded.length * 0;
  const omitted = Math.max(0, scored.length + alwaysIncluded.length - included.length);

  // Group by type for markdown.
  const byType = new Map<MemoryType, (MemoryWithTags & { score?: number; reason?: string })[]>();
  for (const t of MEMORY_TYPE_ORDER) byType.set(t, []);
  for (const m of included) {
    const t = m.type as MemoryType;
    if (!byType.has(t)) continue;
    byType.get(t)!.push(m as MemoryWithTags);
  }

  const sections: string[] = [];
  for (const t of MEMORY_TYPE_ORDER) {
    const items = byType.get(t)!;
    if (items.length === 0) continue;
    sections.push(`## ${MEMORY_TYPE_LABELS[t]}s`);
    for (const m of items) sections.push(renderItem(m));
    sections.push("");
  }
  if (omitted > 0) {
    sections.push(`[+${omitted} more memories omitted - budget ${budget} chars; increase budget or use search]`, "");
  }
  const bodyMd = sections.join("\n").trim();
  const markdown = bodyMd.length === 0 ? "<!-- BEGIN:mnemo -->\n<!-- END:mnemo -->" : `<!-- BEGIN:mnemo -->\n${bodyMd}\n<!-- END:mnemo -->`;

  const hermesTxt = included.map(renderHermesLine).join("\n");

  const serializable = included.map(toSerializable);
  const jsonStr = JSON.stringify(
    {
      schema: "mnemo.memories.v1",
      generatedAt: new Date().toISOString(),
      budget,
      count: included.length,
      omitted,
      memories: serializable,
    },
    null,
    2,
  );

  const formatBody = format === "json" ? jsonStr : format === "hermes-txt" ? hermesTxt : markdown;
  const contentType =
    format === "json"
      ? "application/json; charset=utf-8"
      : format === "hermes-txt"
        ? "text/plain; charset=utf-8"
        : "text/markdown; charset=utf-8";

  return {
    format,
    markdown,
    hermesTxt,
    json: jsonStr,
    body: formatBody,
    contentType,
    tokens: Math.max(0, Math.round(formatBody.length / 4)),
    included,
    includedCount: included.length,
    totalCount: totalPool,
    omitted,
    budget,
    chars: formatBody.length,
  };
}
