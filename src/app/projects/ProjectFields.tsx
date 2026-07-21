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
    /** Tier 3 additions (optional — older callers omit) */
    exportTemplate?: string | null;
    maxExportChars?: number | null;
    includeGlobal?: boolean;
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

      <fieldset className="border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-3">
        <legend className="text-xs uppercase tracking-wide text-zinc-500 px-2">
          Tier 3 export defaults (optional)
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Default export format</span>
            <select
              name="exportTemplate"
              defaultValue={defaultValues?.exportTemplate ?? ""}
              className={INPUT_CLASS}
            >
              <option value="">(follow URL ?format=)</option>
              <option value="markdown">markdown (AGENTS.md block)</option>
              <option value="hermes-txt">hermes-txt (one line/memory)</option>
              <option value="json">json (structured)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">
              Max export chars (empty = unlimited)
            </span>
            <input
              type="number"
              name="maxExportChars"
              min={0}
              max={1_000_000}
              step={100}
              defaultValue={defaultValues?.maxExportChars ?? ""}
              className={INPUT_CLASS}
            />
          </label>
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="includeGlobal"
            value="yes"
            defaultChecked={
              defaultValues?.includeGlobal === undefined
                ? true
                : Boolean(defaultValues.includeGlobal)
            }
            className="rounded"
          />
          <span className="font-medium">
            Include global-scope memories in this project&apos;s export
          </span>
        </label>
        <p className="mt-2 text-xs text-zinc-500">
          These set the default when calling <code>/export?project={`{slug}`}</code> for
          this project. Callers can still override via query string.
        </p>
      </fieldset>

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
