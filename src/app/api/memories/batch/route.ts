import { ZodError } from "zod";
import { createMemory } from "@/lib/memories";
import { getProjectBySlug, createProject } from "@/lib/projects";
import { findPossibleDuplicates, backfillEmbeddingForMemory } from "@/lib/search";
import {
  batchCreateSchema,
  normalizeSlug,
  type MemoryApiCreateInput,
  type MemoryCreateInput,
} from "@/lib/schemas";

type BatchItemResult = {
  index: number;
  ok: true;
  status: "created";
  memory: Awaited<ReturnType<typeof createMemory>>;
} | {
  index: number;
  ok: false;
  status: "duplicate";
  similar: Awaited<ReturnType<typeof findPossibleDuplicates>>;
} | {
  index: number;
  ok: false;
  status: "error";
  error: string;
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
    parsed = batchCreateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json(
        { error: "Validation failed", issues: err.issues },
        { status: 400 },
      );
    }
    return Response.json({ error: "Unexpected validation error" }, { status: 400 });
  }

  const headerAllowsDup = request.headers.get("x-allow-duplicate") === "true";
  const allowDuplicate = parsed.allowDuplicate === true || headerAllowsDup;
  const createMissingProjects = parsed.createMissingProjects !== false;

  const results: BatchItemResult[] = [];
  let createdCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  for (let i = 0; i < parsed.memories.length; i++) {
    const entry: MemoryApiCreateInput = parsed.memories[i];
    try {
      let projectId: string | null = null;
      if (entry.projectSlug && entry.projectSlug.length > 0) {
        const slug = normalizeSlug(entry.projectSlug);
        if (slug.length === 0) {
          results.push({
            index: i,
            ok: false,
            status: "error",
            error: "projectSlug normalized to empty string",
          });
          errorCount++;
          continue;
        }
        let project = await getProjectBySlug(slug);
        if (!project) {
          if (!createMissingProjects) {
            results.push({
              index: i,
              ok: false,
              status: "error",
              error: `Project not found: ${slug}`,
            });
            errorCount++;
            continue;
          }
          project = await createProject({ name: slug, slug });
        }
        projectId = project.id;
      }

      if (!allowDuplicate && entry.allowDuplicate !== true) {
        const dup = await findPossibleDuplicates({
          title: entry.title,
          content: entry.content,
          projectId,
        });
        if (dup.length > 0) {
          results.push({ index: i, ok: false, status: "duplicate", similar: dup });
          duplicateCount++;
          continue;
        }
      }

      const input: MemoryCreateInput = {
        type: entry.type,
        title: entry.title,
        content: entry.content,
        tags: entry.tags,
        projectId,
        importance: entry.importance,
        expiresAt: entry.expiresAt,
        source: entry.source,
      };
      const created = await createMemory(input);
      createdCount++;
      results.push({ index: i, ok: true, status: "created", memory: created });

      // Fire-and-forget embedding generation.
      void backfillEmbeddingForMemory(created.id, created.title, created.content);
    } catch (err) {
      errorCount++;
      results.push({
        index: i,
        ok: false,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const allOk = errorCount === 0 && duplicateCount === 0;
  const status = allOk ? 200 : 207;
  return Response.json(
    {
      created: createdCount,
      duplicates: duplicateCount,
      errors: errorCount,
      results,
    },
    { status },
  );
}