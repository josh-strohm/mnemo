import Link from "next/link";
import { createProjectAction } from "@/app/actions";

export default async function NewProjectPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">New project</h1>
        <Link
          href="/projects"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          Back
        </Link>
      </div>

      <form action={createProjectAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Name</span>
          <input
            type="text"
            name="name"
            required
            maxLength={100}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Slug (kebab-case)</span>
          <input
            type="text"
            name="slug"
            required
            maxLength={100}
            placeholder="my-project"
            className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="self-start rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black px-5 py-2 text-sm font-medium hover:opacity-90"
        >
          Create project
        </button>
      </form>
    </div>
  );
}