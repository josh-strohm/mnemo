/**
 * Simple in-memory sliding-window rate limiting.
 * Works per-process (Netlify serverless: per-instance best-effort; good
 * enough for abuse mitigation, not strong global limiting).
 *
 * 100 req/min per key by default (configurable via RATE_LIMIT_RPM env).
 * Keys are IP or API key fingerprint.
 */

const DEFAULT_RPM = 100;
const WINDOW_MS = 60_000;

type Entry = number[]; // timestamps (ms)

const store = new Map<string, Entry>();

function rpm(): number {
  const raw = process.env.RATE_LIMIT_RPM;
  if (!raw) return DEFAULT_RPM;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RPM;
}

function now(): number {
  return Date.now();
}

/** How many requests may `key` still make in this window (after this one). */
export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  limit: number;
};

export function checkRateLimit(
  key: string,
  limitOverride?: number,
): RateLimitResult {
  const limit = limitOverride ?? rpm();
  const n = now();
  const windowStart = n - WINDOW_MS;

  const entry = store.get(key) ?? [];
  const recent = entry.filter((t) => t > windowStart);

  if (recent.length >= limit) {
    const oldestInWindow = recent[0];
    const resetMs = oldestInWindow + WINDOW_MS - n;
    return {
      allowed: false,
      remaining: 0,
      resetMs: Math.max(0, resetMs),
      limit,
    };
  }

  recent.push(n);
  store.set(key, recent);
  return {
    allowed: true,
    remaining: Math.max(0, limit - recent.length),
    resetMs: WINDOW_MS,
    limit,
  };
}

/** Remove expired window entries; call periodically or rely on lazy GC. */
export function gcRateLimitStore(): void {
  const cutoff = now() - WINDOW_MS;
  for (const [k, timestamps] of store.entries()) {
    const kept = timestamps.filter((t) => t > cutoff);
    if (kept.length === 0) store.delete(k);
    else store.set(k, kept);
  }
}

export function resetRateLimitStore(): void {
  store.clear();
}
