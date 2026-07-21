import { ZodError } from "zod";
import {
  getMemory,
  updateMemoryPartial,
  deleteMemory,
  getRelatedMemories,
} from "@/lib/memories";
import { getProjectBySlug, createProject } from "@/lib/projects";
import { backfillEmbeddingForMemory } from "@/lib/search";
import { memoryApiUpdateSchema, normalizeSlug } from "@/lib/schemas";
import { logAudit, auditRequestInfo } from "@/lib/audit";
import { triggerWebhook } from "@/lib/webhooks";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  request: Request,
  ctx: RouteContext,
) {
  const { id } = await ctx.params;
  const memory = await getMemory(id);
  if (!memory) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  // ?expand=related populates the graph links so callers can render traversal
  // edges without a second request.
  const wantRelated =
    new URL(request.url).searchParams.get("expand") === "related";
  if (!wantRelated) return Response.json(memory);
  const related = await getRelatedMemories(id);
  return Response.json({ ...memory, relatedMemories: related });
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
    // Re-generate embedding if text may have changed.
    void backfillEmbeddingForMemory(updated.id, updated.title, updated.content);

    // Tier 3: audit + webhook.
    const { actorIp, userAgent } = auditRequestInfo(request);
    void logAudit("update", {
      memoryId: updated.id,
      projectId: updated.projectId,
      actorIp,
      userAgent,
      metadata: { fields: Object.keys(parsed).filter((k) => k !== "allowDuplicate") },
    });
    void triggerWebhook("memory.updated", {
      id: updated.id,
      type: updated.type,
      projectId: updated.projectId,
      pinnedChanged:
        parsed.isPinned !== undefined
          ? Boolean(parsed.isPinned) !==
            Boolean((existing as unknown as { isPinned?: boolean }).isPinned)
          : false,
    });

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
  request: Request,
  ctx: RouteContext,
) {
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const hard = url.searchParams.get("hard") === "true";
  try {
    const result = await deleteMemory(id, { hard });
    if (!result) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    // Tier 3: audit + webhook.
    const { actorIp, userAgent } = auditRequestInfo(request);
    void logAudit(hard ? "delete" : "soft_delete", {
      memoryId: id,
      actorIp,
      userAgent,
      metadata: { hard },
    });
    void triggerWebhook(hard ? "memory.deleted" : "memory.soft_deleted", {
      id,
      hard,
    });
    return Response.json(result);
  } catch (err) {
    if (
      err instanceof Error &&
      /^The record to delete was not found/.test(err.message)
    ) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
}