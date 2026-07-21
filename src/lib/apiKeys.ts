import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { parseDbTags } from "@/lib/schemas";

export type ApiKeyWithMeta = {
  id: string;
  name: string;
  scopes: string[];
  keyHash: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type VerifiedApiKey = ApiKeyWithMeta & { plain?: string };

export const KNOWN_SCOPES = [
  "memory:read",
  "memory:write",
  "memory:delete",
  "project:read",
  "project:write",
  "project:delete",
  "admin:read",
  "admin:write",
  "export:read",
  "import:write",
  "search:read",
  "context:read",
  "backup:read",
  "audit:read",
] as const;

export type ApiKeyScope = (typeof KNOWN_SCOPES)[number];

/**
 * Hash an API key token with SHA-256 for storage/lookup.
 * The key format is `mnemo_<random>`; we hash the whole token.
 */
export function hashApiKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateApiKeyToken(): string {
  const rand = randomBytes(24).toString("base64url");
  return `mnemo_${rand}`;
}

function parseScopes(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? arr.filter((s): s is string => typeof s === "string")
      : [];
  } catch {
    return [];
  }
}

function toWithMeta(row: {
  id: string;
  name: string;
  keyHash: string;
  scopes: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ApiKeyWithMeta {
  return {
    id: row.id,
    name: row.name,
    keyHash: row.keyHash,
    scopes: parseScopes(row.scopes),
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Create an API key. Returns the plaintext token exactly once (caller must
 * persist/show it). The hash is stored, not the plaintext.
 */
export async function createApiKey(input: {
  name: string;
  scopes: string[];
  expiresAt?: Date | null;
}): Promise<{ apiKey: ApiKeyWithMeta; token: string }> {
  const token = generateApiKeyToken();
  const keyHash = hashApiKey(token);
  const created = await prisma.apiKey.create({
    data: {
      keyHash,
      name: input.name,
      scopes: JSON.stringify(input.scopes),
      expiresAt: input.expiresAt ?? null,
    },
  });
  return { apiKey: toWithMeta(created), token };
}

export async function listApiKeys(): Promise<ApiKeyWithMeta[]> {
  const rows = await prisma.apiKey.findMany({
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toWithMeta);
}

export async function getApiKeyById(id: string): Promise<ApiKeyWithMeta | null> {
  const row = await prisma.apiKey.findUnique({ where: { id } });
  return row ? toWithMeta(row) : null;
}

export async function revokeApiKey(id: string): Promise<boolean> {
  try {
    await prisma.apiKey.update({
      where: { id },
      data: { isActive: false },
    });
    return true;
  } catch {
    return false;
  }
}

export async function hardDeleteApiKey(id: string): Promise<boolean> {
  try {
    await prisma.apiKey.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

/**
 * Verify a Bearer token against stored API key hashes.
 * Returns the matched key (with scope check optional) or null.
 */
export async function verifyApiKeyToken(
  token: string,
): Promise<ApiKeyWithMeta | null> {
  if (!token || token.length < 8) return null;
  const hash = hashApiKey(token);
  const row = await prisma.apiKey.findUnique({ where: { keyHash: hash } });
  if (!row) return null;
  if (!row.isActive) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
  // Fire-and-forget lastUsedAt bump.
  void prisma.apiKey
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
  return toWithMeta(row);
}

export function apiKeyHasScope(
  apiKey: ApiKeyWithMeta,
  required: string,
): boolean {
  if (apiKey.scopes.length === 0) return false;
  // `admin:write` implies all scopes; `admin:read` implies all read scopes.
  if (apiKey.scopes.includes("admin:write")) return true;
  if (apiKey.scopes.includes(required)) return true;
  if (
    apiKey.scopes.includes("admin:read") &&
    (required.endsWith(":read") || required === "export:read")
  )
    return true;
  return false;
}

export { parseDbTags as _internalParseTags_UNUSED };
