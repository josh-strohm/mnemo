import Link from "next/link";
import { listProjects } from "@/lib/projects";
import { createMemoryAction } from "@/app/actions";
import { MemoryForm } from "@/app/memories/MemoryForm";

export default async function NewMemoryPage() {
  const projects = await listProjects();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">New memory</h1>
        <Link
          href="/memories"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          Back
        </Link>
      </div>
      <MemoryForm
        action={createMemoryAction}
        projects={projects}
        submitLabel="Create memory"
      />
    </div>
  );
}