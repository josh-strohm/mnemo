import { ZodError } from "zod";
import { apiKeyCreateSchema } from "@/lib/schemas";
import { createApiKey, listApiKeys } from "@/lib/apiKeys";
import { logAudit, auditRequestInfo } from "@/lib/audit";

/**
 * GET /api/api-keys — list API keys (no plaintext shown).
 * POST /api/api-keys — create a new API key; returns plaintext once.
 *
 * POST body: { name, scopes?, expiresAt? }
 * - scopes: array of known scopes, defaults to ["memory:read"].
 * - expiresAt: ISO string optional.
 *
 * Auth: requires primary MNEMO_API_KEY (admin) via proxy.
 */

export async function GET() {
  const keys = await listApiKeys();
  // Strip keyHash from the list (don't leak hashes in list).
  return Response.json(
    keys.map((k) => ({
      id: k.id,
      name: k.name,
      scopes: k.scopes,
      expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null,
      lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
      isActive: k.isActive,
      createdAt: k.createdAt.toISOString(),
      updatedAt: k.updatedAt.toISOString(),
    })),
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = apiKeyCreateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError)
      return Response.json({ error: "Validation failed", issues: err.issues }, { status: 400 });
    return Response.json({ error: "Unexpected validation error" }, { status: 400 });
  }

  const { apiKey, token } = await createApiKey({
    name: parsed.name,
    scopes: parsed.scopes,
    expiresAt: parsed.expiresAt ?? null,
  });

  const { actorIp, userAgent } = auditRequestInfo(request);
  void logAudit("api_key_create", {
    actorIp,
    userAgent,
    apiKeyId: apiKey.id,
    metadata: { name: parsed.name, scopes: parsed.scopes },
  });

  return Response.json(
    {
      id: apiKey.id,
      name: apiKey.name,
      scopes: apiKey.scopes,
      expiresAt: apiKey.expiresAt ? apiKey.expiresAt.toISOString() : null,
      isActive: apiKey.isActive,
      createdAt: apiKey.createdAt.toISOString(),
      // Plaintext token: returned exactly once, never retrievable again.
      token,
    },
    { status: 201 },
  );
}
