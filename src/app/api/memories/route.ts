import { ZodError } from "zod";
import { listMemories, createMemory } from "@/lib/memories";
import { getProjectBySlug, createProject } from "@/lib/projects";
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
  }

  const input: MemoryCreateInput = {
    type: parsed.type,
    title: parsed.title,
    content: parsed.content,
    tags: parsed.tags,
    projectId,
    importance: parsed.importance,
    expiresAt: parsed.expiresAt,
    source: parsed.source,
  };

  const created = await createMemory(input);
  return Response.json(created, { status: 201 });
}