import { listProjects } from "@/lib/projects";
import { compileExport } from "@/lib/export";
import { CopyButton } from "@/app/export/CopyButton";

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = await searchParams;
  const projectParam = Array.isArray(raw.project) ? raw.project[0] : raw.project;
  const selection = projectParam ?? "global";

  const [projects, compiled] = await Promise.all([
    listProjects(),
    compileExport(selection as string | "global" | "all"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Export</h1>

      <form method="GET" action="/export" className="flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium">Project:</label>
        <select
          name="project"
          defaultValue={selection}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
        >
          <option value="global">Global memories only</option>
          <option value="all">All memories</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} (project + global)
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900"
        >
          Compile
        </button>
      </form>

      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500">
          Paste this block into your repo&apos;s AGENTS.md.
        </span>
        <CopyButton text={compiled} />
      </div>

      <pre className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 text-xs overflow-x-auto whitespace-pre-wrap">
        {compiled}
      </pre>
    </div>
  );
}