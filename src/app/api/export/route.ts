import { compileExport } from "@/lib/export";
import { getProjectBySlug } from "@/lib/projects";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const project = url.searchParams.get("project") ?? "global";

  let selection: string | "global" | "all" = "global";
  if (project === "all" || project === "global") {
    selection = project;
  } else {
    const found = await getProjectBySlug(project);
    if (!found) {
      return Response.json(
        { error: `Project not found: ${project}` },
        { status: 404 },
      );
    }
    selection = found.id;
  }

  const markdown = await compileExport(selection);
  return new Response(markdown, {
    status: 200,
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}