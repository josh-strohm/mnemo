import {
  listAllForExport,
  listGlobalAndProject,
  touchLastAccessedAt,
  type MemoryWithTags,
} from "@/lib/memories";
import { scoreMemoryAgainstQuery, tokenizeQuery } from "@/lib/scoring";

export type SearchHit = MemoryWithTags & {
  score: number;
  reason: string;
  matchedTokens: string[];
};

export type HybridSearchParams = {
  q: string;
  /** undefined = all projects, null = global scope only, string = project id */
  projectId?: string | null;
  k?: number;
  includeExpired?: boolean;
  /** optional override for deterministic tests */
  now?: Date;
};

/**
 * Hybrid keyword (+ optional vector) search. With no embeddings configured
 * this degrades to pure tokenized keyword scoring, which is sufficient for
 * the Tier 1 corpus size.
 */
export async function hybridSearch(
  params: HybridSearchParams,
): Promise<SearchHit[]> {
  const { q, projectId, k = 10, includeExpired = false, now } = params;
  const now_ = now ?? new Date();

  let memories: MemoryWithTags[];
  if (projectId === undefined) {
    memories = await listAllForExport({ includeExpired });
  } else {
    const all = await listGlobalAndProject(projectId);
    memories = includeExpired ? all : all.filter((m) => !isExpired(m.expiresAt, now_));
  }

  // If a project is specified we want that project + global (already handled by
  // listGlobalAndProject). When undefined (all) listAllForExport returns every
  // project's memories + global.

  const tokens = tokenizeQuery(q);
  const hits = memories
    .map((m) => {
      const s = scoreMemoryAgainstQuery({
        title: m.title,
        content: m.content,
        tags: m.tags,
        tokens,
        updatedAt: m.updatedAt,
        now: now_,
      });
      return { ...m, score: s.score, reason: s.reason, matchedTokens: s.matchedTokens };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, k));

  if (hits.length > 0) {
    void touchLastAccessedAt(hits.map((h) => h.id));
  }

  return hits;
}

function isExpired(expiresAt: Date | null, now: Date): boolean {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}