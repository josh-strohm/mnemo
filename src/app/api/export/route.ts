import { ZodError, z } from "zod";
import { compileExport, type ExportFormat } from "@/lib/export";
import { getProjectBySlug } from "@/lib/projects";
import { exportQuerySchema } from "@/lib/schemas";
import { logAudit, auditRequestInfo } from "@/lib/audit";

const formatSchema = z
  .enum(["markdown", "json", "hermes-txt"])
  .catch("markdown")
  .default("markdown");

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectParam = url.searchParams.get("project") ?? "global";

  let selection: string | "global" | "all" = "global";
  if (projectParam === "all" || projectParam === "global") {
    selection = projectParam;
  } else {
    const found = await getProjectBySlug(projectParam);
    if (!found) {
      return Response.json(
        { error: `Project not found: ${projectParam}` },
        { status: 404 },
      );
    }
    selection = found.id;
  }

  let query;
  try {
    query = exportQuerySchema.parse({
      project: projectParam,
      maxChars: url.searchParams.get("max_chars") ?? undefined,
      priority: url.searchParams.get("priority") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
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

  const format: ExportFormat = formatSchema.parse(
    url.searchParams.get("format") ?? undefined,
  );

  const result = await compileExport(selection, {
    maxChars: query.maxChars || undefined,
    priority: query.priority,
    query: query.q,
    includeExpired: query.includeExpired,
    format,
  });

  // Tier 3: audit (fire-and-forget)
  const { actorIp, userAgent } = auditRequestInfo(request);
  void logAudit("export", {
    projectId: typeof selection === "string" ? selection : null,
    actorIp,
    userAgent,
    metadata: {
      format,
      chars: result.chars,
      includedCount: result.includedCount,
      totalCount: result.totalCount,
      priority: query.priority,
      hasQuery: Boolean(query.q),
    },
  });

  const tokens = Math.max(0, Math.round(result.chars / 4));
  return new Response(result.body, {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "X-Mnemo-Tokens": String(tokens),
      "X-Mnemo-Count": `${result.includedCount}/${result.totalCount}`,
    },
  });
}