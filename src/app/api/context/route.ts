import { ZodError } from "zod";
import { assembleContext } from "@/lib/context";
import { getProjectBySlug } from "@/lib/projects";
import { contextQuerySchema } from "@/lib/schemas";
import { logAudit, auditRequestInfo } from "@/lib/audit";
import { rerankEnabled } from "@/lib/rerank";

/**
 * GET /api/context — Tier 3 context assembly endpoint.
 * Query:
 *   project   slug|id|all|global (default all)
 *   q         keyword query (optional; when present uses hybridSearch+rerank)
 *   budget    max chars for markdown/hermes-txt body (default 3500, 0 = unlimited)
 *   always_include  comma-separated memory ids that must appear
 *   include_expired bool
 *   format    markdown | hermes-txt | json (default markdown)
 *   include_global bool (default true) — whether global memories merge into project-scoped results
 *
 * Returns text/markdown (or text/plain / application/json based on format)
 * with body = compiled block, plus metadata in X-Mnemo-* headers.
 *
 * This is the endpoint Hermes session_start should call when it wants a
 * query-scoped, budget-aware memory bundle (vs. /api/export for fixed-size).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  let parsed;
  try {
    parsed = contextQuerySchema.parse({
      project: url.searchParams.get("project") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      budget: url.searchParams.get("budget") ?? undefined,
      alwaysInclude: url.searchParams.get("always_include") ?? undefined,
      includeExpired: url.searchParams.get("include_expired") ?? undefined,
      format: url.searchParams.get("format") ?? undefined,
      includeGlobal: url.searchParams.get("include_global") ?? undefined,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json({ error: "Validation failed", issues: err.issues }, { status: 400 });
    }
    return Response.json({ error: "Unexpected validation error" }, { status: 400 });
  }

  // Validate project slug if non-standard.
  if (parsed.project && parsed.project !== "all" && parsed.project !== "global") {
    const found = await getProjectBySlug(parsed.project);
    if (!found && parsed.project.length < 10) {
      // Non-cuid and not a known slug: 404. cuid-looking values are tolerated as raw ids.
      return Response.json({ error: `Project not found: ${parsed.project}` }, { status: 404 });
    }
  }

  const alwaysIncludeIds = parsed.alwaysInclude
    ? parsed.alwaysInclude
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .slice(0, 50)
    : [];

  const assembled = await assembleContext({
    project: parsed.project ?? "all",
    q: parsed.q,
    budget: parsed.budget,
    alwaysIncludeIds,
    includeExpired: parsed.includeExpired,
    includeGlobal: parsed.includeGlobal,
    format: parsed.format as "markdown" | "hermes-txt" | "json",
  });

  // Audit (fire-and-forget)
  const { actorIp, userAgent } = auditRequestInfo(request);
  void logAudit("context", {
    projectId: parsed.project ?? null,
    actorIp,
    userAgent,
    metadata: {
      q: parsed.q,
      budget: parsed.budget,
      includedCount: assembled.includedCount,
      omitted: assembled.omitted,
      rerank: rerankEnabled(),
    },
  });

  // Mirror the export endpoint's X-Mnemo-* headers and also include context-specific ones.
  return new Response(assembled.body, {
    status: 200,
    headers: {
      "Content-Type": assembled.contentType,
      "X-Mnemo-Tokens": String(assembled.tokens),
      "X-Mnemo-Count": `${assembled.includedCount}/${assembled.totalCount}`,
      "X-Mnemo-Omitted": String(assembled.omitted),
      "X-Mnemo-Budget": String(assembled.budget),
      "X-Mnemo-Rerank": rerankEnabled() ? "true" : "false",
    },
  });
}
