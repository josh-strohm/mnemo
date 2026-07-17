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

export const memoryCreateSchema = z.object({
  type: memoryTypeSchema,
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  tags: csvToTags,
  projectId: z.string().nullable().optional(),
});
export type MemoryCreateInput = z.infer<typeof memoryCreateSchema>;

export const memoryUpdateSchema = z.object({
  id: z.string().min(1),
  type: memoryTypeSchema,
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  tags: csvToTags,
  projectId: z.string().nullable().optional(),
});
export type MemoryUpdateInput = z.infer<typeof memoryUpdateSchema>;

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

export const memoryFiltersSchema = z.object({
  q: z.string().trim().optional(),
  type: memoryTypeSchema.optional(),
  project: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === "") return undefined;
      if (v === "global") return "global" as const;
      return v;
    }),
  tag: z.string().trim().optional(),
});
export type MemoryFilters = z.infer<typeof memoryFiltersSchema>;