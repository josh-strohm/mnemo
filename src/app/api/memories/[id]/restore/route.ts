import { ZodError } from "zod";
import { z } from "zod";
import { restoreMemory, updateMemoryPartial } from "@/lib/memories";
import { restoreVersion } from "@/lib/versions";

type RouteContext = { params: Promise<{ id: string }> };

const restoreBodySchema = z
  .object({
    versionId: z.string().min(1).optional(),
  })
  .optional()
  .default({});

export async function POST(
  request: Request,
  ctx: RouteContext,
) {
  const { id } = await ctx.params;

  let body: unknown = {};
  const text = await request.text();
  if (text.trim().length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      return Response.json({ error: "Malformed JSON body" }, { status: 400 });
    }
  }

  let parsed;
  try {
    parsed = restoreBodySchema.parse(body);
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

  // Version restore path.
  if (parsed.versionId) {
    const result = await restoreVersion(id, parsed.versionId, (memId, fields) =>
      updateMemoryPartial(memId, fields, fields.projectId),
    );
    if (!result) {
      return Response.json(
        { error: "Version or memory not found" },
        { status: 404 },
      );
    }
    return Response.json({
      memory: result.memory,
      restoredFromVersion: result.version,
      snapshotBeforeRestore: result.snapshotBeforeRestore,
    });
  }

  // Undelete path: only allowed if currently soft-deleted.
  const existing = await restoreMemory(id);
  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  // restoreMemory returns the row even if it wasn't deleted; report accurately.
  return Response.json({ memory: existing, restored: true });
}