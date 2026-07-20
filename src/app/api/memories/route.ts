import { ZodError } from "zod";
import { listMemories, createMemory } from "@/lib/memories";
import { getProjectBySlug, createProject } from "@/lib/projects";
import {
  findPossibleDuplicates,
  backfillEmbeddingForMemory,
} from "@/lib/search";
import {
  memoryApiCreateSchema,
  memoryFiltersSchema,
  normalizeSlug,
  type MemoryCreateInput,
} from "@/lib/schemas";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectParam = url.searchParams.get("project") ?? "all";

  let filterProject: string | "global" | undefined = undefined;
  if (projectParam === "all") {
    filterProject = undefined;
  } else if (projectParam === "global") {
    filterProject = "global";
  } else {
    const found = await getProjectBySlug(projectParam);
    if (!found) {
      return Response.json(
        { error: `Project not found: ${projectParam}` },
        { status: 404 },
      );
    }
    filterProject = found.id;
  }

  let filters;
  try {
    filters = memoryFiltersSchema.parse({
      q: url.searchParams.get("q") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
      project: filterProject,
      tag: url.searchParams.get("tag") ?? undefined,
      includeDeleted: url.searchParams.get("include_deleted") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
      sort: url.searchParams.get("sort") ?? undefined,
    });
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

  const { items, total } = await listMemories(filters);
  return new Response(JSON.stringify(items), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Total-Count": String(total),
    },
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Malformed JSON body" },
      { status: 400 },
    );
  }

  let parsed;
  try {
    parsed = memoryApiCreateSchema.parse(body);
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

  let projectId: string | null = null;
  let projectDefaultImportance: number | null = null;
  if (parsed.projectSlug) {
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
    projectId = project.id;
    projectDefaultImportance = project.defaultImportance;
  }

  // Duplicate detection (overridable via header or body field).
  const allowDuplicate =
    request.headers.get("x-allow-duplicate") === "true" ||
    parsed.allowDuplicate === true;
  if (!allowDuplicate) {
    const dup = await findPossibleDuplicates({
      title: parsed.title,
      content: parsed.content,
      projectId,
    });
    if (dup.length > 0) {
      return Response.json(
        {
          error: "possible_duplicate",
          similar: dup,
          suggestion: "Use PUT /api/memories/[id] to update instead",
        },
        { status: 409 },
      );
    }
  }

  // Default-importance fallback: when the caller omits importance, use the
  // project's configured default (or 0.5 for global) so project-scoped
  // memories get a sensible baseline without an explicit per-call value.
  const importance =
    parsed.importance ??
    (projectDefaultImportance !== null ? projectDefaultImportance : undefined);

  const input: MemoryCreateInput = {
    type: parsed.type,
    title: parsed.title,
    content: parsed.content,
    tags: parsed.tags,
    projectId,
    importance,
    expiresAt: parsed.expiresAt,
    source: parsed.source,
  };

  const created = await createMemory(input);

  // Fire-and-forget embedding generation.
  void backfillEmbeddingForMemory(
    created.id,
    created.title,
    created.content,
  );

  return Response.json(created, { status: 201 });
}