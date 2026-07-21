import { ZodError } from "zod";
import { createMemory } from "@/lib/memories";
import { getProjectBySlug, createProject } from "@/lib/projects";
import { findPossibleDuplicates, backfillEmbeddingForMemory } from "@/lib/search";
import { importHermesSchema, normalizeSlug, type MemoryCreateInput, type MemoryType } from "@/lib/schemas";
import { logAudit, auditRequestInfo } from "@/lib/audit";
import { triggerWebhook } from "@/lib/webhooks";

/**
 * POST /api/import/hermes — Tier 3 Hermes built-in memory sync.
 *
 * Reconciles Hermes's local `MEMORY.md` entries with Mnemo:
 *   body { entries: [{text, type?, title?, tags?, projectSlug?}], projectSlug?, allowDuplicate? }
 *
 * Each entry.text is split into a short title (first 60 chars or first line)
 * and full content. type defaults to FACT, tags from the entry if present.
 * A global projectSlug override can be supplied via body.projectSlug.
 */

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = importHermesSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError)
      return Response.json({ error: "Validation failed", issues: err.issues }, { status: 400 });
    return Response.json({ error: "Unexpected validation error" }, { status: 400 });
  }

  const allowDuplicate =
    parsed.allowDuplicate === true || request.headers.get("x-allow-duplicate") === "true";

  // Resolve fallback project once.
  let fallbackProjectId: string | null = null;
  if (parsed.projectSlug) {
    const slug = normalizeSlug(parsed.projectSlug);
    if (slug) {
      let p = await getProjectBySlug(slug);
      if (!p) p = await createProject({ name: slug, slug });
      fallbackProjectId = p.id;
    }
  }

  type Result =
    | { index: number; status: "created"; memory: Awaited<ReturnType<typeof createMemory>> }
    | { index: number; status: "duplicate"; similar: Awaited<ReturnType<typeof findPossibleDuplicates>> }
    | { index: number; status: "error"; error: string };

  const results: Result[] = [];
  let createdCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  for (let i = 0; i < parsed.entries.length; i++) {
    const e = parsed.entries[i];
    try {
      let projectId: string | null = fallbackProjectId;
      // Per-entry projectSlug overrides global fallback.
      if (e.projectSlug) {
        const eslug = normalizeSlug(e.projectSlug);
        if (eslug.length > 0) {
          let proj = await getProjectBySlug(eslug);
          if (!proj) proj = await createProject({ name: eslug, slug: eslug });
          projectId = proj.id;
        }
      }

      const title =
        (e.title ??
          (e.text
            .split(/\r?\n/)[0]
            .slice(0, 100)
            .trim() || "Hermes entry"));

      const type: MemoryType = e.type ?? "FACT";

      if (!allowDuplicate) {
        const dup = await findPossibleDuplicates({ title, content: e.text, projectId });
        if (dup.length > 0) {
          results.push({ index: i, status: "duplicate", similar: dup });
          duplicateCount++;
          continue;
        }
      }

      const input: MemoryCreateInput = {
        type,
        title: title.slice(0, 200),
        content: e.text,
        tags: (e.tags ?? []).map((t) => String(t).trim()).filter((t) => t.length > 0),
        projectId,
        source: "IMPORTED",
      };
      const created = await createMemory(input);
      createdCount++;
      results.push({ index: i, status: "created", memory: created });
      void backfillEmbeddingForMemory(created.id, created.title, created.content);
    } catch (err) {
      errorCount++;
      results.push({
        index: i,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const { actorIp, userAgent } = auditRequestInfo(request);
  void logAudit("import", {
    projectId: fallbackProjectId,
    actorIp,
    userAgent,
    metadata: { source: "hermes", created: createdCount, duplicates: duplicateCount, errors: errorCount },
  });
  if (createdCount > 0) {
    void triggerWebhook("memory.imported", {
      created: createdCount,
      duplicates: duplicateCount,
      source: "hermes",
    });
  }

  const allOk = errorCount === 0 && duplicateCount === 0;
  return Response.json(
    {
      created: createdCount,
      duplicates: duplicateCount,
      errors: errorCount,
      results,
    },
    { status: allOk ? 200 : 207 },
  );
}
