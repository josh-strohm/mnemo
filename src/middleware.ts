import { NextRequest, NextResponse } from "next/server";

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

export function middleware(request: NextRequest) {
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

  if (!apiKey) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    const header = request.headers.get("authorization") ?? "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (bearer !== apiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (!isPublicPath(pathname)) {
    const cookie = request.cookies.get(COOKIE_NAME)?.value;
    if (!cookie || cookie !== apiKey) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};