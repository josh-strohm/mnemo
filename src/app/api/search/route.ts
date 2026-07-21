import { ZodError } from "zod";
import { hybridSearch } from "@/lib/search";
import { getProjectBySlug } from "@/lib/projects";
import { searchQuerySchema } from "@/lib/schemas";
import { logAudit, auditRequestInfo } from "@/lib/audit";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectParam = url.searchParams.get("project") ?? "all";

  let projectId: string | null | undefined = undefined;
  if (projectParam === "all") {
    projectId = undefined;
  } else if (projectParam === "global") {
    projectId = null;
  } else {
    const found = await getProjectBySlug(projectParam);
    if (!found) {
      return Response.json(
        { error: `Project not found: ${projectParam}` },
        { status: 404 },
      );
    }
    projectId = found.id;
  }

  let query;
  try {
    query = searchQuerySchema.parse({
      q: url.searchParams.get("q") ?? undefined,
      project: projectParam,
      k: url.searchParams.get("k") ?? undefined,
      includeExpired: url.searchParams.get("include_expired") ?? undefined,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json(
        { error: "Validation failed", issues: err.issues },
        { status: 400 },
      );
    }
    return Response.json({ error: "Unexpected validation error" }, { status: 400 });
  }

  const hits = await hybridSearch({
    q: query.q,
    projectId,
    k: query.k,
    includeExpired: query.includeExpired,
  });

  // Tier 3: audit (fire-and-forget)
  const { actorIp, userAgent } = auditRequestInfo(request);
  void logAudit("search", {
    projectId: projectId ?? null,
    actorIp,
    userAgent,
    metadata: { q: query.q, k: query.k, hits: hits.length },
  });

  return Response.json(
    hits.map((h) => ({
      ...h,
      score: h.score,
      matchedTokens: h.matchedTokens,
    })),
    { status: 200 },
  );
}