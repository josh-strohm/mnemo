import { ZodError } from "zod";
import { getMemory, updateMemoryPartial, deleteMemory } from "@/lib/memories";
import { getProjectBySlug, createProject } from "@/lib/projects";
import { memoryApiUpdateSchema, normalizeSlug } from "@/lib/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  ctx: RouteContext,
) {
  const { id } = await ctx.params;
  const memory = await getMemory(id);
  if (!memory) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(memory);
}

export async function PUT(
  request: Request,
  ctx: RouteContext,
) {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = memoryApiUpdateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json(
        { error: "Validation failed", issues: err.issues },
        { status: 400 },
      );
    }
    return Response.json(
      { error: "Unexpected validation error" },
      { status: 400 },
    );
  }

  const existing = await getMemory(id);
  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Resolve the target project: explicit projectId wins, then projectSlug
  // (create the project if missing), otherwise fall back to the existing value.
  let resolvedProjectId: string | null = existing.projectId;
  if (parsed.projectId !== undefined) {
    resolvedProjectId = parsed.projectId;
  } else if (parsed.projectSlug !== undefined) {
    if (parsed.projectSlug === null) {
      resolvedProjectId = null;
    } else {
      const slug = normalizeSlug(parsed.projectSlug);
      if (slug.length === 0) {
        return Response.json(
          { error: "projectSlug normalized to empty string" },
          { status: 400 },
        );
      }
      let project = await getProjectBySlug(slug);
      if (!project) {
        project = await createProject({ name: slug, slug });
      }
      resolvedProjectId = project.id;
    }
  }

  try {
    const updated = await updateMemoryPartial(
      id,
      parsed,
      resolvedProjectId,
    );
    if (!updated) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json(updated);
  } catch (err) {
    if (
      err instanceof Error &&
      /^The record to update was not found/.test(err.message)
    ) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext,
) {
  const { id } = await ctx.params;
  try {
    await deleteMemory(id);
  } catch (err) {
    if (
      err instanceof Error &&
      /^The record to delete was not found/.test(err.message)
    ) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
  return Response.json({ ok: true, id });
}