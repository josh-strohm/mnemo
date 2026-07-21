import { ZodError } from "zod";
import { deleteMemory } from "@/lib/memories";
import { batchDeleteSchema } from "@/lib/schemas";
import { logAudit, auditRequestInfo } from "@/lib/audit";
import { triggerWebhook } from "@/lib/webhooks";

type ItemOk = { id: string; ok: true; soft: boolean };
type ItemErr = { id: string; ok: false; error: string };
export type BatchDeleteItem = ItemOk | ItemErr;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = batchDeleteSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json(
        { error: "Validation failed", issues: err.issues },
        { status: 400 },
      );
    }
    return Response.json({ error: "Unexpected validation error" }, { status: 400 });
  }

  const hard = parsed.hard === true;
  const results: BatchDeleteItem[] = [];
  let softCount = 0;
  let hardCount = 0;
  let missingCount = 0;

  // De-dupe ids while keeping insertion order.
  const seen = new Set<string>();
  const orderedIds: string[] = [];
  for (const id of parsed.ids) {
    if (!seen.has(id)) {
      seen.add(id);
      orderedIds.push(id);
    }
  }

  for (const id of orderedIds) {
    try {
      const result = await deleteMemory(id, { hard });
      if (!result) {
        results.push({ id, ok: false, error: "Not found" });
        missingCount++;
        continue;
      }
      results.push({ id, ok: true, soft: result.soft });
      if (result.soft) softCount++;
      else hardCount++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      results.push({ id, ok: false, error: msg });
      missingCount++;
    }
  }

  const allOk = missingCount === 0;

  // Tier 3: audit + webhook.
  const { actorIp, userAgent } = auditRequestInfo(request);
  void logAudit("batch_delete", {
    actorIp,
    userAgent,
    metadata: { softCount, hardCount, missingCount, total: orderedIds.length },
  });
  if (softCount + hardCount > 0) {
    void triggerWebhook("memory.batch_deleted", {
      soft: softCount,
      hard: hardCount,
      missing: missingCount,
    });
  }

  return Response.json(
    {
      results,
      soft: softCount,
      hard: hardCount,
      missing: missingCount,
    },
    { status: allOk ? 200 : 207 },
  );
}