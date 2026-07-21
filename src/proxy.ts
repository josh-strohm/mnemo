import { NextRequest, NextResponse } from "next/server";
import { verifyApiKeyToken, type ApiKeyWithMeta, apiKeyHasScope } from "@/lib/apiKeys";
import { checkRateLimit, gcRateLimitStore } from "@/lib/rateLimit";

/**
 * Mnemo request proxy. Tier 3:
 *   - Per-IP sliding-window rate limit (default 100 req/min, RATE_LIMIT_RPM env).
 *   - Multi-tenant API keys: per-agent tokens verified against the ApiKey
 *     table (sha256-hashed); admin key (MNEMO_API_KEY) retains full access.
 *   - Scope checks for reserved paths (e.g. /api/admin/*, /api/api-keys/*,
 *     /api/import, /api/admin/backup, /api/memories write methods).
 *
 * UI route layout unchanged: cookie auth still gates non-API pages.
 */

const COOKIE_NAME = "mnemo-auth";
const SCOPE_PROTECTED_RW: Array<{ pattern: RegExp; required: string }> = [
  { pattern: /^\/api\/api-keys(\/.+)?$/, required: "admin:write" },
  { pattern: /^\/api\/admin\/backup(\/.+)?$/, required: "admin:write" },
  { pattern: /^\/api\/admin(\/.+)?$/, required: "admin:read" },
  { pattern: /^\/api\/import(\/.+)?$/, required: "import:write" },
];

if (!process.env.MNEMO_API_KEY && process.env.NODE_ENV !== "production") {
  console.warn(
    "[mnemo] WARNING: MNEMO_API_KEY is not set. Authentication is skipped in development.",
  );
}

function getApiKey(): string | undefined {
  return process.env.MNEMO_API_KEY || undefined;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/static")
  );
}

function isUiAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function rateLimitKeyFor(req: NextRequest): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
  return `ip:${ip}`;
}

function rateLimitHeaders(rl: { limit: number; remaining: number; resetMs: number }, allowed: boolean) {
  return {
    "X-RateLimit-Limit": String(rl.limit),
    "X-RateLimit-Remaining": String(rl.remaining),
    "X-RateLimit-Reset": String(Math.ceil(rl.resetMs / 1000)),
    ...(allowed ? {} : { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) }),
  };
}

type AuthResult =
  | { kind: "anonymous"; apiKey: ApiKeyWithMeta | null }
  | { kind: "admin"; apiKey: null }
  | { kind: "unauthorized" };

async function authenticateBearer(req: NextRequest): Promise<AuthResult> {
  const primary = getApiKey();
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!bearer) return { kind: "anonymous", apiKey: null };
  if (primary && bearer === primary) return { kind: "admin", apiKey: null };
  try {
    const apiKey = await verifyApiKeyToken(bearer);
    if (apiKey) return { kind: "anonymous", apiKey };
  } catch {
    // fallthrough
  }
  return { kind: "unauthorized" };
}

function isWriteMethod(method: string): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

function requiredScopeFor(method: string, pathname: string): string | null {
  for (const { pattern, required } of SCOPE_PROTECTED_RW) {
    if (pattern.test(pathname)) return required;
  }
  if (pathname === "/api/openapi.json") return null; // public for code-gen
  if (pathname.startsWith("/api/")) {
    if (isWriteMethod(method)) return "memory:write";
    if (method === "GET") return "memory:read";
  }
  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const apiKey = getApiKey();

  if (isProduction() && !apiKey) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Service unavailable: API key not configured" },
        { status: 503 },
      );
    }
    return new NextResponse("Service unavailable: API key not configured", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Tier 3: rate limiting (apply to API traffic and the UI equally — soft cap).
  // gcRateLimitStore keeps the map tidy on every 100th call.
  if (Math.random() < 0.05) gcRateLimitStore();
  const rlKey = rateLimitKeyFor(request);
  const rl = checkRateLimit(rlKey);
  const rlHeaders = rateLimitHeaders(rl, rl.allowed);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterMs: rl.resetMs },
      { status: 429, headers: rlHeaders },
    );
  }

  if (!apiKey) {
    // Dev: no key configured → permit everything but warn.
    return NextResponse.next();
  }

  // API routes: check Bearer (primary or per-agent). Backwards compatible.
  if (pathname.startsWith("/api/")) {
    if (pathname === "/api/openapi.json") {
      // OpenAPI spec is treated as read-only metadata; no auth required so
      // codegen tools don't need credentials. Hot path.
      return NextResponse.next({ headers: rlHeaders });
    }

    const auth = await authenticateBearer(request);
    if (auth.kind === "unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: rlHeaders });
    }

    const required = requiredScopeFor(request.method, pathname);
    if (required) {
      const holding = auth.apiKey; // null for admin (primary key) → full access
      if (holding && !apiKeyHasScope(holding, required)) {
        return NextResponse.json(
          { error: "Forbidden: missing scope", required },
          { status: 403, headers: rlHeaders },
        );
      }
    }

    // Surface the auth state for downstream API routes (so audit can attribute).
    const requestHeaders = new Headers(request.headers);
    if (auth.kind === "anonymous" && auth.apiKey) {
      requestHeaders.set("x-mnemo-api-key-id", auth.apiKey.id);
      requestHeaders.set("x-mnemo-api-key-name", auth.apiKey.name);
    } else if (auth.kind === "admin") {
      requestHeaders.set("x-mnemo-api-key-id", "primary");
      requestHeaders.set("x-mnemo-api-key-name", "admin");
    }

    return NextResponse.next({ request: { headers: requestHeaders }, headers: rlHeaders });
  }

  // UI: cookie-based auth for pages, public for static.
  // /admin (and subpaths) requires the admin key (cookie must equal MNEMO_API_KEY).
  if (isUiAdminPath(pathname)) {
    const cookie = request.cookies.get(COOKIE_NAME)?.value;
    if (!cookie || cookie !== apiKey) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  if (!isPublicPath(pathname)) {
    const cookie = request.cookies.get(COOKIE_NAME)?.value;
    if (!cookie || cookie !== apiKey) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next({ headers: rlHeaders });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
