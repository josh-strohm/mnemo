import { listMemories } from "@/lib/memories";
import { getProjectBySlug } from "@/lib/projects";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const project = url.searchParams.get("project") ?? "all";

  let filterProject: string | "global" | undefined = undefined;
  if (project === "all") {
    filterProject = undefined;
  } else if (project === "global") {
    filterProject = "global";
  } else {
    const found = await getProjectBySlug(project);
    if (!found) {
      return Response.json(
        { error: `Project not found: ${project}` },
        { status: 404 },
      );
    }
    filterProject = found.id;
  }

  const memories = await listMemories({ project: filterProject });
  return Response.json(memories, { status: 200 });
}