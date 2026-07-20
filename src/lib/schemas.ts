import { z } from "zod";

export const MEMORY_TYPES = ["LESSON", "CONVENTION", "DECISION", "FACT"] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export const MEMORY_TYPE_LABELS: Record<MemoryType, string> = {
  CONVENTION: "Convention",
  LESSON: "Lesson",
  DECISION: "Decision",
  FACT: "Fact",
};

export const MEMORY_TYPE_ORDER: MemoryType[] = [
  "CONVENTION",
  "LESSON",
  "DECISION",
  "FACT",
];

export const memoryTypeSchema = z.enum(MEMORY_TYPES);

export const MEMORY_SOURCES = [
  "USER_SAID",
  "AGENT_INFERRED",
  "CORRECTION",
  "IMPORTED",
] as const;
export type MemorySource = (typeof MEMORY_SOURCES)[number];

export const MEMORY_SOURCE_LABELS: Record<MemorySource, string> = {
  USER_SAID: "User said",
  AGENT_INFERRED: "Inferred",
  CORRECTION: "Correction",
  IMPORTED: "Imported",
};

export const memorySourceSchema = z.enum(MEMORY_SOURCES);

export const csvToTags = z
  .string()
  .default("")
  .transform((s): string[] =>
    s
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0),
  );

export const tagsToDbString = (tags: string[]): string =>
  JSON.stringify(tags);

export const parseDbTags = (s: string): string[] => {
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === "string");
    }
  } catch {
    // not JSON
  }
  return [];
};

// Shared scalar schemas ----------------------------------------------------

export const importanceSchema = z.number().min(0).max(1).default(0.5);

export const expiresAtSchema = z
  .string()
  .min(1)
  .nullable()
  .optional()
  .transform((v): Date | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  });

// A slug for create/update payloads (projectSlug). Empty string -> null.
const projectSlugSchema = z
  .string()
  .min(1)
  .max(100)
  .nullable()
  .optional()
  .transform((v): string | null | undefined => {
    if (v === undefined) return undefined;
    return v;
  });

// Helpers for coercing query-string numbers while staying total (no throws).
const optionalInt = (min: number, max: number, fallback: number) =>
  z.preprocess((v) => {
    if (v === undefined || v === null || v === "") return fallback;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  }, z.number().int().min(min).max(max));

const optionalEnum = <T extends readonly string[]>(
  values: T,
  fallback: T[number],
) =>
  z.preprocess((v) => {
    if (v === undefined || v === "") return fallback;
    return v;
  }, z.enum(values).catch(fallback));

const optionalBoolean = (fallback = false) =>
  z.preprocess((v) => {
    if (v === undefined || v === "") return fallback;
    if (typeof v === "boolean") return v;
    return v === "true";
  }, z.boolean());

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;
export const SORT_OPTIONS = ["newest", "oldest", "updated"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];
export const PRIORITY_OPTIONS = ["importance", "recent", "query"] as const;
export type PriorityOption = (typeof PRIORITY_OPTIONS)[number];

// Memory create/update (UI + server actions) ----------------------------

export const memoryCreateSchema = z.object({
  type: memoryTypeSchema,
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  tags: csvToTags,
  projectId: z.string().nullable().optional(),
  importance: importanceSchema.optional(),
  expiresAt: expiresAtSchema.optional(),
  source: memorySourceSchema.optional(),
});
export type MemoryCreateInput = z.infer<typeof memoryCreateSchema>;

export const memoryUpdateSchema = z.object({
  id: z.string().min(1),
  type: memoryTypeSchema,
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  tags: csvToTags,
  projectId: z.string().nullable().optional(),
  importance: importanceSchema.optional(),
  expiresAt: expiresAtSchema.optional(),
  source: memorySourceSchema.optional(),
});
export type MemoryUpdateInput = z.infer<typeof memoryUpdateSchema>;

// Project schemas ---------------------------------------------------------

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case"),
});
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;

export const projectUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .transform((s) => normalizeSlug(s)),
});
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

// Filters / pagination ----------------------------------------------------

const emptyStringToUndefined = z.preprocess((v) =>
  v === "" ? undefined : v,
  z.string().optional(),
);

export const memoryFiltersSchema = z.object({
  q: emptyStringToUndefined,
  type: z.preprocess(
    (v) => (v === "" ? undefined : v),
    memoryTypeSchema.optional(),
  ),
  project: emptyStringToUndefined.transform(
    (v): string | "global" | undefined => {
      if (v === undefined) return undefined;
      if (v === "global") return "global" as const;
      return v;
    },
  ),
  tag: emptyStringToUndefined,
  includeDeleted: optionalBoolean(false),
  limit: optionalInt(1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE),
  offset: optionalInt(0, 1_000_000, 0),
  sort: optionalEnum(SORT_OPTIONS, "newest"),
});
export type MemoryFilters = {
  q?: string;
  type?: MemoryType;
  project?: string | "global";
  tag?: string;
  includeDeleted?: boolean;
  limit: number;
  offset: number;
  sort: SortOption;
};

// API create / update ------------------------------------------------------

export const memoryApiCreateSchema = z.object({
  type: memoryTypeSchema,
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).max(50).default([]),
  projectSlug: projectSlugSchema,
  importance: importanceSchema.optional(),
  expiresAt: expiresAtSchema.optional(),
  source: memorySourceSchema.optional(),
  allowDuplicate: z.boolean().optional(),
});
export type MemoryApiCreateInput = z.infer<typeof memoryApiCreateSchema>;

export const memoryApiUpdateSchema = z.object({
  type: memoryTypeSchema.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).max(50).optional(),
  projectId: z.string().nullable().optional(),
  projectSlug: projectSlugSchema,
  importance: z.number().min(0).max(1).optional(),
  expiresAt: expiresAtSchema.optional(),
  source: memorySourceSchema.optional(),
});
export type MemoryApiUpdateInput = z.infer<typeof memoryApiUpdateSchema>;

// Search query -------------------------------------------------------------

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1),
  project: z.string().optional(),
  k: optionalInt(1, 100, 10),
  includeExpired: optionalBoolean(false),
});
export type SearchQuery = {
  q: string;
  project?: string;
  k: number;
  includeExpired: boolean;
};

// Export query ------------------------------------------------------------

export const exportQuerySchema = z.object({
  project: z.string().optional(),
  maxChars: optionalInt(0, 1_000_000, 0),
  priority: optionalEnum(PRIORITY_OPTIONS, "recent"),
  q: z.string().optional(),
  includeExpired: optionalBoolean(false),
});
export type ExportQuery = {
  project?: string;
  maxChars: number;
  priority: PriorityOption;
  q?: string;
  includeExpired: boolean;
};

export function normalizeSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}