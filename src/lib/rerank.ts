/**
 * Optional reranking layer — Tier 3.
 * When COHERE_API_KEY (+ RERANK_ENABLED=true) or OPENAI_API_KEY +
 * RERANK_ENABLED=true, reranks the top N hits from hybridSearch so that
 * the final order reflects a cross-encoder or Cohere rerank rather than
 * just cosine/keyword. Within the free OSS path we degrade to a cheap
 * tag/title overlap boost so there's always some second-pass value.
 *
 * This module never throws; if rerank fails it returns the original order.
 */

import type { SearchHit } from "@/lib/search";

const MAX_RERANK_CANDIDATES = 30;

function tokenizeSmall(s: string): string[] {
  return s
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length >= 2);
}

/**
 * Cheap local rerank: score = existing + 0.2*tagOverlap + 0.15*titleOverlap.
 * No network call, deterministic, preserves most properties of the original.
 */
function localRerank(hits: SearchHit[], query: string): SearchHit[] {
  const qTokens = new Set(tokenizeSmall(query));
  if (qTokens.size === 0) return hits;

  return hits
    .map((h) => {
      const titleTokens = new Set(tokenizeSmall(h.title));
      const tagTokens = new Set(h.tags.map((t) => t.toLowerCase()));
      let tagOverlap = 0;
      let titleOverlap = 0;
      for (const t of qTokens) {
        if (tagTokens.has(t)) tagOverlap++;
        if (titleTokens.has(t)) titleOverlap++;
      }
      const boost = 0.2 * tagOverlap + 0.15 * titleOverlap;
      return { ...h, score: h.score + boost, reason: `${h.reason}+rerank:local(${boost.toFixed(2)})` };
    })
    .sort((a, b) => b.score - a.score);
}

async function cohereRerank(
  query: string,
  hits: SearchHit[],
): Promise<SearchHit[] | null> {
  const key = process.env.COHERE_API_KEY;
  if (!key) return null;

  try {
    const docs = hits.map((h) => `${h.title}\n${h.content}`);
    const res = await fetch("https://api.cohere.ai/v1/rerank", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "rerank-english-v3.0",
        query,
        documents: docs,
        top_n: hits.length,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn("[rerank] Cohere non-2xx:", res.status);
      return null;
    }
    const data = (await res.json()) as {
      results?: { index: number; relevance_score: number }[];
    };
    if (!data.results || data.results.length === 0) return null;

    // Build a lookup score from Cohere relevance_score.
    const orderedIndices = data.results
      .slice()
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .map((r) => r.index);

    const byIdx = new Map(
      orderedIndices.map((orig, newOrder) => {
        const s =
          data.results!.find((x) => x.index === orig)?.relevance_score ?? 0;
        return [orig, { newOrder, score: s }] as const;
      }),
    );
    void byIdx;
    // Actually just use the cohere-provided order.
    const reranked = orderedIndices.map((origIdx) => {
      const h = hits[origIdx];
      const cohereScore =
        (data.results!.find((r) => r.index === origIdx)?.relevance_score) ?? 0;
      return { ...h, score: cohereScore, reason: `${h.reason}+rerank:cohere(${cohereScore.toFixed(3)})` };
    });
    // Drop any undefined if indices were out of range.
    return reranked.filter(Boolean) as SearchHit[];
  } catch (err) {
    console.warn("[rerank] Cohere error:", err);
    return null;
  }
}

/**
 * Main entry: rerank the provided hits by `query`. Attempts Cohere when
 * COHERE_API_KEY is set; falls back to local tag/title overlap boost.
 *
 * Returns hits in (possibly) new order. Never throws.
 */
export async function rerankHits(
  query: string,
  hits: SearchHit[],
  opts: { enabled?: boolean } = {},
): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed || hits.length <= 1) return hits;

  const enabled =
    opts.enabled ?? (process.env.RERANK_ENABLED === "true" || Boolean(process.env.COHERE_API_KEY));
  if (!enabled) return hits;

  // Cap candidate set so Cohere / expensive paths don't explode.
  const candidates = hits.slice(0, MAX_RERANK_CANDIDATES);
  const tail = hits.slice(MAX_RERANK_CANDIDATES);

  // Cohere passthrough when available and query tokens > 0.
  if (process.env.COHERE_API_KEY) {
    const cohere = await cohereRerank(trimmed, candidates);
    if (cohere) return [...cohere, ...tail];
  }

  // Fallback: local tag/title boost.
  return [...localRerank(candidates, trimmed), ...tail];
}

export function rerankEnabled(): boolean {
  return process.env.RERANK_ENABLED === "true" || Boolean(process.env.COHERE_API_KEY);
}
