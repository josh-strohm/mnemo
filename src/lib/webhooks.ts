import { createHmac } from "node:crypto";

export type WebhookEvent =
  | "memory.created"
  | "memory.updated"
  | "memory.deleted"
  | "memory.soft_deleted"
  | "memory.restored"
  | "memory.batch_created"
  | "memory.batch_deleted"
  | "memory.imported"
  | "memory.pinned"
  | "memory.unpinned";

export type WebhookPayload = {
  event: WebhookEvent | string;
  timestamp: string;
  data: Record<string, unknown>;
};

const MAX_RETRIES = 3;
const BACKOFF_MS = 700;

function buildHeaders(
  body: string,
  secret: string | undefined,
): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "mnemo-webhook/1.0",
  };
  if (secret) {
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    h["X-Mnemo-Signature"] = `sha256=${sig}`;
  }
  return h;
}

/**
 * Send a webhook POST to WEBHOOK_URL (if configured). Retries up to 3x with
 * linear backoff. Returns true on any 2xx, false otherwise. Never throws so
 * call sites can safely fire-and-forget.
 */
export async function triggerWebhook(
  event: WebhookEvent | string,
  data: Record<string, unknown>,
): Promise<boolean> {
  const url = process.env.WEBHOOK_URL;
  if (!url) return false;
  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };
  const body = JSON.stringify(payload);
  const secret = process.env.WEBHOOK_SECRET;
  const headers = buildHeaders(body, secret);

  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) return true;
      if (res.status >= 500 && attempt < MAX_RETRIES - 1) {
        await sleep(BACKOFF_MS * (attempt + 1));
        continue;
      }
      lastError = new Error(`webhook ${url} HTTP ${res.status}`);
      break;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        await sleep(BACKOFF_MS * (attempt + 1));
        continue;
      }
    }
  }
  console.warn("[webhook] failed after retries:", event, String(lastError ?? ""));
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function webhookHeadersForTest(
  body: string,
  secret: string,
): Record<string, string> {
  return buildHeaders(body, secret);
}
