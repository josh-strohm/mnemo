import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, gcRateLimitStore } from "@/lib/rateLimit";

/**
 * Mnemo request proxy. Edge-compatible (must not import anything that
 * pulls in @libsql/client — that's why per-agent API key verification
 * lives in route handlers, not here).
 *
 * Responsibilities:
 *   - Per-IP sliding-window rate limit (default 100 req/min, RATE_LIMIT_RPM env).
 *   - Authenticate the admin MNEMO_API_KEY as Bearer for /api/*.
 *     Per-agent API keys (ApiKey table) are verified in individual route
 *     handlers via `withApiKeyAuth()` from @/lib/apiKeys which uses the Node
 *     runtime and the libsql adapter.
 *   - Cookie-gate the UI (/admin requires the admin key; other pages
 *     require the same key as a cookie).
 */

const COOKIE_NAME = "mnemo-auth";

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

/**
 * Edge-compatible bearer check. Accepts only the admin MNEMO_API_KEY.
 * Per-agent tokens pass through this proxy; they will be verified (or
 * rejected) inside the route handler via withApiKeyAuth if needed.
 */
function isAdminBearer(req: NextRequest): boolean {
  const primary = getApiKey();
  if (!primary) return true; // dev mode: permit all when no key configured
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  return Boolean(bearer && bearer === primary);
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

  // Tier 3: rate limit only API traffic. UI pages, prefetches, RSC roundtrips
  // and asset loads aren't rate-limited (those would burn through the budget
  // during normal navigation and break the app).
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }
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

  // API routes: admin key is enough. Per-agent keys are not edge-verifiable,
  // they get transparently passed through with an x-mnemo-per-agent hint,
  // and the route handler can decide to call withApiKeyAuth() if it cares.
  if (pathname.startsWith("/api/")) {
    if (pathname === "/api/openapi.json") {
      return NextResponse.next({ headers: rlHeaders });
    }

    const header = request.headers.get("authorization") ?? "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
    const hasAnyBearer = Boolean(bearer);

    // Admin key (or no bearer when API key is unset) → allow.
    if (!hasAnyBearer && !apiKey) {
      return NextResponse.next({ headers: rlHeaders });
    }
    if (hasAnyBearer && isAdminBearer(request)) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-mnemo-api-key-id", "primary");
      requestHeaders.set("x-mnemo-api-key-name", "admin");
      return NextResponse.next({
        request: { headers: requestHeaders },
        headers: rlHeaders,
      });
    }

    // Non-admin bearer: admit for now; per-route withApiKeyAuth will decide.
    // We pass a hint header so handlers don't re-parse.
    if (hasAnyBearer) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-mnemo-auth-pending", "1");
      return NextResponse.next({
        request: { headers: requestHeaders },
        headers: rlHeaders,
      });
    }

    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: rlHeaders },
    );
  }

  // UI: cookie-based auth for pages, public for static.
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
