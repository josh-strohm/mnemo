import { ZodError } from "zod";
import { createMemory } from "@/lib/memories";
import { getProjectBySlug, createProject } from "@/lib/projects";
import { findPossibleDuplicates, backfillEmbeddingForMemory } from "@/lib/search";
import { parseMnemoBlocks } from "@/lib/importParse";
import { importMnemoSchema, normalizeSlug, type MemoryCreateInput } from "@/lib/schemas";
import { logAudit, auditRequestInfo } from "@/lib/audit";
import { triggerWebhook } from "@/lib/webhooks";

/**
 * POST /api/import — Tier 3 BEGIN/END block parser.
 * Body: { content: "<!-- BEGIN:mnemo -->...<!-- END:mnemo -->", projectSlug?, allowDuplicate?, source?, createMissingProjects? }
 *
 * Parses all blocks in `content` into {type, title, content, tags, importance}
 * entries, dedupes by (title lower + content lead), checks duplicates against
 * the DB (optional), and creates memories. Returns a per-entry report similar
 * to /api/memories/batch so clients can report omissions.
 */

type CreatedResult = {
  index: number;
  status: "created" | "duplicate" | "error";
  memory?: Awaited<ReturnType<typeof createMemory>>;
  similar?: Awaited<ReturnType<typeof findPossibleDuplicates>>;
  error?: string;
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = importMnemoSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError)
      return Response.json({ error: "Validation failed", issues: err.issues }, { status: 400 });
    return Response.json({ error: "Unexpected validation error" }, { status: 400 });
  }

  // Resolve project.
  let projectId: string | null = null;
  if (parsed.projectSlug) {
    const slug = normalizeSlug(parsed.projectSlug);
    if (!slug) return Response.json({ error: "projectSlug normalized to empty" }, { status: 400 });
    let project = await getProjectBySlug(slug);
    if (!project) {
      if (parsed.createMissingProjects === false)
        return Response.json({ error: `Project not found: ${slug}` }, { status: 404 });
      project = await createProject({ name: slug, slug });
    }
    projectId = project.id;
  }

  const allowDuplicate =
    parsed.allowDuplicate === true || request.headers.get("x-allow-duplicate") === "true";

  const rawEntries = parseMnemoBlocks(parsed.content);
  if (rawEntries.length === 0) {
    return Response.json(
      { error: "No parseable memories found in content", blocksFound: 0 },
      { status: 400 },
    );
  }

  const results: CreatedResult[] = [];
  let createdCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rawEntries.length; i++) {
    const entry = rawEntries[i];
    try {
      if (!allowDuplicate) {
        const dup = await findPossibleDuplicates({
          title: entry.title,
          content: entry.content,
          projectId,
        });
        if (dup.length > 0) {
          results.push({ index: i, status: "duplicate", similar: dup });
          duplicateCount++;
          continue;
        }
      }

      const input: MemoryCreateInput = {
        type: entry.type,
        title: entry.title.slice(0, 200),
        content: entry.content,
        tags: entry.tags,
        projectId,
        importance: entry.importance ?? 0.5,
        source: parsed.source ?? "IMPORTED",
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

  // Audit + webhook
  const { actorIp, userAgent } = auditRequestInfo(request);
  void logAudit("import", {
    projectId,
    actorIp,
    userAgent,
    metadata: { created: createdCount, duplicates: duplicateCount, errors: errorCount, source: parsed.source ?? "IMPORTED" },
  });
  if (createdCount > 0) {
    void triggerWebhook("memory.imported", {
      projectId,
      created: createdCount,
      duplicates: duplicateCount,
    });
  }

  const allOk = errorCount === 0 && duplicateCount === 0;
  return Response.json(
    {
      created: createdCount,
      duplicates: duplicateCount,
      errors: errorCount,
      parsedEntries: rawEntries.length,
      results,
    },
    { status: allOk ? 200 : 207 },
  );
}
