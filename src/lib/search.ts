import {
  listAllForExport,
  listGlobalAndProject,
  touchLastAccessedAt,
  setEmbedding,
  searchFtsIds,
  type MemoryWithTags,
} from "@/lib/memories";
import { scoreMemoryAgainstQuery, tokenizeQuery } from "@/lib/scoring";
import {
  generateEmbedding,
  parseEmbedding,
  cosineSimilarity,
  embeddingsEnabled,
} from "@/lib/embeddings";

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

function isExpired(expiresAt: Date | null, now: Date): boolean {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

/**
 * Hybrid keyword (+ optional vector) search. With no OpenAI key configured
 * this degrades to pure tokenized keyword scoring. When embeddings are
 * available for the query and at least one candidate memory, cosine
 * similarity (weight 0.7) is blended with normalized keyword score (0.3).
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

  // Narrow candidates via FTS5 MATCH when the query has usable tokens. This
  // replaces the exhaustive in-memory scan and scales the search path beyond
  // a few thousand memories. Falls back to the full set when FTS yields
  // nothing (e.g. punctuation-only or no-token query) so recall is preserved.
  try {
    const ftsIds = await searchFtsIds(q, {
      includeDeleted: false,
      limit: 500,
    });
    if (ftsIds && ftsIds.length > 0) {
      const idSet = new Set(ftsIds);
      memories = memories.filter((m) => idSet.has(m.id));
    }
  } catch (err) {
    // FTS unavailable / not yet migrated — degrade to the full-scan path.
    console.error("[search] FTS narrowing failed:", err);
  }

  const tokens = tokenizeQuery(q);

  // Keyword scores first (always).
  const keywordScored = memories.map((m) => {
    const s = scoreMemoryAgainstQuery({
      title: m.title,
      content: m.content,
      tags: m.tags,
      tokens,
      updatedAt: m.updatedAt,
      now: now_,
    });
    return { m, kw: s };
  });
  const maxKw = keywordScored.reduce((acc, x) => Math.max(acc, x.kw.score), 0);

  // Vector path (only if a key is configured).
  let queryEmb: number[] | null = null;
  if (embeddingsEnabled()) {
    queryEmb = await generateEmbedding(q);
  }
  const anyEmbedding = memories.some((m) => m.embedding);
  const useVector = queryEmb !== null && anyEmbedding;

  const hits = keywordScored
    .map((x) => {
      let score: number;
      let reason: string;
      if (useVector && queryEmb) {
        const emb = parseEmbedding(x.m.embedding);
        const cos = emb ? cosineSimilarity(queryEmb, emb) : 0;
        const normKw = maxKw > 0 ? x.kw.score / maxKw : 0;
        score = 0.7 * cos + 0.3 * normKw;
        reason = `vector:${cos.toFixed(3)}|kw:${normKw.toFixed(3)}`;
      } else {
        score = x.kw.score;
        reason = x.kw.reason;
      }
      return {
        ...x.m,
        score: Math.round(score * 1000) / 1000,
        reason,
        matchedTokens: x.kw.matchedTokens,
      };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, k));

  if (hits.length > 0) {
    void touchLastAccessedAt(hits.map((h) => h.id));
  }

  return hits;
}

export type DuplicateCandidate = {
  id: string;
  type: string;
  title: string;
  score: number;
  similarity: number;
  matchedTokens: string[];
};

/**
 * Heuristic duplicate detector. Searches the same project scope for
 * near-duplicates of (title, content) and returns any whose similarity is
 * >= threshold. Similarity is cosine when embeddings are available,
 * otherwise the fraction of query tokens matched in the candidate.
 */
export async function findPossibleDuplicates(args: {
  title: string;
  content: string;
  /** undefined = all, null = global, string = project id */
  projectId?: string | null;
  k?: number;
  threshold?: number;
}): Promise<DuplicateCandidate[]> {
  const query = `${args.title} ${args.content}`;
  const hits = await hybridSearch({
    q: query,
    projectId: args.projectId,
    k: args.k ?? 5,
    includeExpired: true,
  });
  const queryTokenCount = Math.max(1, tokenizeQuery(query).length);
  const threshold = args.threshold ?? 0.85;

  return hits
    .map((h) => {
      const tokenSimilarity =
        h.matchedTokens.length / queryTokenCount;
      const similarity = h.reason.startsWith("vector:")
        ? Math.max(
            Number.parseFloat(h.reason.split("vector:")[1].split("|")[0]),
            tokenSimilarity,
          )
        : tokenSimilarity;
      return {
        id: h.id,
        type: h.type,
        title: h.title,
        score: h.score,
        similarity: Math.round(similarity * 1000) / 1000,
        matchedTokens: h.matchedTokens,
      };
    })
    .filter((c) => c.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);
}

/**
 * Fire-and-forget embedding generation for a memory. Skips silently when no
 * OpenAI key is configured. Never throws so request handlers stay resilient.
 */
export async function backfillEmbeddingForMemory(
  id: string,
  title: string,
  content: string,
): Promise<void> {
  if (!embeddingsEnabled()) return;
  try {
    const emb = await generateEmbedding(`${title}\n${content}`);
    if (emb) await setEmbedding(id, emb);
  } catch (err) {
    console.error(`[embeddings] failed for ${id}:`, err);
  }
}