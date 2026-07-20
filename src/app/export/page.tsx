import { listProjects } from "@/lib/projects";
import { compileExport, type ExportFormat } from "@/lib/export";
import { CopyButton } from "@/app/export/CopyButton";
import { AutoRefresh } from "@/app/AutoRefresh";

const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: "markdown", label: "Markdown (AGENTS.md block)" },
  { value: "hermes-txt", label: "Hermes-TXT (one line per memory)" },
  { value: "json", label: "JSON (structured)" },
];

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = await searchParams;
  const projectParam = Array.isArray(raw.project) ? raw.project[0] : raw.project;
  const selection = projectParam ?? "global";
  const formatParam = Array.isArray(raw.format) ? raw.format[0] : raw.format;
  const format: ExportFormat =
    formatParam === "json" || formatParam === "hermes-txt" ? formatParam : "markdown";

  const [projects, compiled] = await Promise.all([
    listProjects(),
    compileExport(selection as string | "global" | "all", { format }),
  ]);
  const preview = compiled.body;

  return (
    <AutoRefresh>
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Export</h1>

      <form method="GET" action="/export" className="flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium">Project:</label>
        <select
          name="project"
          defaultValue={selection}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 px-3 py-2 text-sm"
        >
          <option value="global">Global memories only</option>
          <option value="all">All memories</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} (project + global)
            </option>
          ))}
        </select>
        <label className="text-sm font-medium ml-2">Format:</label>
        <select
          name="format"
          defaultValue={format}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 px-3 py-2 text-sm"
        >
          {FORMAT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
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
          {format === "markdown"
            ? "Paste this block into your repo\u2019s AGENTS.md."
            : format === "hermes-txt"
              ? "One memory per line, pipe-separated fields."
              : "Structured memory array (mnemo.memories.v1)."}
        </span>
        <CopyButton text={preview} />
      </div>

      <pre className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 text-xs overflow-x-auto whitespace-pre-wrap">
        {preview}
      </pre>
    </div>
    </AutoRefresh>
  );
}