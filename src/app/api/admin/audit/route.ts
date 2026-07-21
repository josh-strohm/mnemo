import { ZodError } from "zod";
import { auditFiltersSchema } from "@/lib/schemas";
import { listAuditLogs } from "@/lib/audit";

/**
 * GET /api/admin/audit — Tier 3 audit log listing.
 * Query: action?, memoryId?, projectId?, limit (1..200 default 50), offset.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  let parsed;
  try {
    parsed = auditFiltersSchema.parse({
      action: url.searchParams.get("action") ?? undefined,
      memoryId: url.searchParams.get("memoryId") ?? undefined,
      projectId: url.searchParams.get("projectId") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });
  } catch (err) {
    if (err instanceof ZodError)
      return Response.json({ error: "Validation failed", issues: err.issues }, { status: 400 });
    return Response.json({ error: "Unexpected validation error" }, { status: 400 });
  }

  const { items, total } = await listAuditLogs({
    action: parsed.action,
    memoryId: parsed.memoryId,
    projectId: parsed.projectId,
    limit: parsed.limit,
    offset: parsed.offset,
  });

  return new Response(JSON.stringify(items), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Total-Count": String(total),
    },
  });
}
