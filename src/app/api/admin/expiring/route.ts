import { ZodError } from "zod";
import { getProjectBySlug } from "@/lib/projects";
import { expiringQuerySchema } from "@/lib/schemas";
import { listExpiring } from "@/lib/expiration";

/**
 * GET /api/admin/expiring?days=7&project= optional
 * Lists non-deleted memories whose expiresAt is within `days` from now.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  let parsed;
  try {
    parsed = expiringQuerySchema.parse({
      days: url.searchParams.get("days") ?? undefined,
      project: url.searchParams.get("project") ?? undefined,
    });
  } catch (err) {
    if (err instanceof ZodError)
      return Response.json({ error: "Validation failed", issues: err.issues }, { status: 400 });
    return Response.json({ error: "Unexpected validation error" }, { status: 400 });
  }

  let projectId: string | null | undefined = undefined;
  if (parsed.project) {
    if (parsed.project === "global") projectId = null;
    else {
      const found = await getProjectBySlug(parsed.project);
      if (!found && parsed.project.length >= 10) projectId = parsed.project;
      else if (!found)
        return Response.json({ error: `Project not found: ${parsed.project}` }, { status: 404 });
      else projectId = found.id;
    }
  }

  const items = await listExpiring(parsed.days, { projectId });

  return Response.json({ items, count: items.length, days: parsed.days });
}
