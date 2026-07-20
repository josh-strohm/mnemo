import { ZodError } from "zod";
import { addLinks, removeLinks, getRelatedMemories } from "@/lib/memories";
import { linkUpdateSchema } from "@/lib/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  ctx: RouteContext,
) {
  const { id } = await ctx.params;
  const related = await getRelatedMemories(id);
  if (related.length === 0) {
    // Distinguish "memory missing" from "memory exists with no links": the
    // caller can HEAD/OPTIONS the parent resource to detect existence, so we
    // return an empty list (200) in both cases — only the parent GET 404s.
  }
  return Response.json({ relatedMemories: related });
}

export async function POST(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = linkUpdateSchema.parse(body);
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

  try {
    if (parsed.add && parsed.add.length > 0) {
      await addLinks(id, parsed.add);
    }
    if (parsed.remove && parsed.remove.length > 0) {
      await removeLinks(id, parsed.remove);
    }
  } catch (err) {
    if (err instanceof Error && err.message === "Memory not found") {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }

  const related = await getRelatedMemories(id);
  return Response.json({ relatedMemories: related });
}