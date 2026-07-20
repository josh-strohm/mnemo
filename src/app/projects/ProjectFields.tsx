const INPUT_CLASS =
  "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 px-3 py-2 text-sm";

export function ProjectFields({
  defaultValues,
}: {
  defaultValues?: {
    name?: string;
    slug?: string;
    description?: string | null;
    color?: string | null;
    icon?: string | null;
    defaultImportance?: number;
    isArchived?: boolean;
  };
}) {
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Name</span>
        <input
          type="text"
          name="name"
          required
          maxLength={100}
          defaultValue={defaultValues?.name ?? ""}
          className={INPUT_CLASS}
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
          defaultValue={defaultValues?.slug ?? ""}
          className={INPUT_CLASS}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Description (optional)</span>
        <textarea
          name="description"
          maxLength={500}
          rows={3}
          defaultValue={defaultValues?.description ?? ""}
          className={`${INPUT_CLASS} resize-y`}
        />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Color (optional hex)</span>
          <input
            type="text"
            name="color"
            maxLength={20}
            placeholder="#RRGGBB"
            defaultValue={defaultValues?.color ?? ""}
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Icon (optional)</span>
          <input
            type="text"
            name="icon"
            maxLength={50}
            placeholder="emoji or short name"
            defaultValue={defaultValues?.icon ?? ""}
            className={INPUT_CLASS}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          Default importance (0..1, blank = 0.5)
        </span>
        <input
          type="number"
          name="defaultImportance"
          min={0}
          max={1}
          step={0.05}
          defaultValue={
            defaultValues?.defaultImportance !== undefined
              ? defaultValues.defaultImportance
              : ""
          }
          className={INPUT_CLASS}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isArchived"
          value="yes"
          defaultChecked={defaultValues?.isArchived === true}
          className="rounded"
        />
        <span className="font-medium">Archived</span>
      </label>
    </>
  );
}