// Pure keyword-scoring helpers shared by listMemories and hybridSearch.
// Kept dependency-free to avoid circular imports with the data layer.

export const NUMBER_TOKEN_REGEX = /\b\d{3,}\b/g;

export type ScoredMatch = {
  score: number;
  matchedTokens: string[];
  reason: string;
};

export function tokenizeQuery(q: string): string[] {
  return q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

const dayMs = 24 * 60 * 60 * 1000;

export function scoreMemoryAgainstQuery(args: {
  title: string;
  content: string;
  tags: string[];
  tokens: string[];
  updatedAt: Date;
  now?: Date;
}): ScoredMatch {
  const { tokens, tags } = args;
  const titleLower = args.title.toLowerCase();
  const contentLower = args.content.toLowerCase();
  const tagsLower = tags.map((t) => t.toLowerCase());
  const now = args.now ?? new Date();

  let score = 0;
  const matched = new Set<string>();

  for (const token of tokens) {
    const isNumberToken = /^\d{3,}$/.test(token);
    let matchedThis = false;

    if (isNumberToken) {
      if (titleLower.includes(token) || contentLower.includes(token)) {
        score += 10;
        matchedThis = true;
      }
    }
    if (!matchedThis && tagsLower.includes(token)) {
      score += 5;
      matchedThis = true;
    }
    if (!matchedThis && titleLower.includes(token)) {
      score += 3;
      matchedThis = true;
    }
    if (!matchedThis && contentLower.includes(token)) {
      score += 1;
      matchedThis = true;
    }
    if (matchedThis) matched.add(token);
  }

  // Recency boost: newer memories get a small additive boost. Decays with
  // age so it never dominates pure relevance (max +0.1).
  const daysSinceUpdate = Math.max(0, (now.getTime() - args.updatedAt.getTime()) / dayMs);
  score += 0.1 / (daysSinceUpdate + 1);

  const matchedTokens = Array.from(matched);
  const reason =
    matchedTokens.length > 0
      ? `keyword:${matchedTokens.join(",")}`
      : score > 0
        ? "recency"
        : "no-match";

  return { score: Math.round(score * 1000) / 1000, matchedTokens, reason };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}