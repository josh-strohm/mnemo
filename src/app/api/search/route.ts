import { ZodError } from "zod";
import { hybridSearch } from "@/lib/search";
import { getProjectBySlug } from "@/lib/projects";
import { searchQuerySchema } from "@/lib/schemas";

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

  return Response.json(
    hits.map((h) => ({
      ...h,
      score: h.score,
      matchedTokens: h.matchedTokens,
    })),
    { status: 200 },
  );
}