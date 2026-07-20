import { cosineSimilarity as _cos } from "@/lib/scoring";

export { _cos as cosineSimilarity };

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const EMBEDDINGS_MODEL = "text-embedding-3-small";

/**
 * Generate an embedding for `text` using OpenAI if OPENAI_API_KEY is set.
 * Returns null when no key is configured (Tier 1 keyword fallback path).
 * Uses fetch so no extra dependency is required.
 */
export async function generateEmbedding(
  text: string,
): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  try {
    const res = await fetch(OPENAI_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ model: EMBEDDINGS_MODEL, input: trimmed }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: { embedding?: number[] }[];
    };
    const emb = data.data?.[0]?.embedding;
    if (!Array.isArray(emb)) return null;
    return emb.filter((n) => typeof n === "number");
  } catch {
    return null;
  }
}

export function parseEmbedding(json: string | null): number[] | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (
      Array.isArray(parsed) &&
      parsed.every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      return parsed as number[];
    }
  } catch {
    // malformed
  }
  return null;
}

export function embeddingsEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}