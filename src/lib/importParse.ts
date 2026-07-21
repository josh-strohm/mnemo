/**
 * Parse `<!-- BEGIN:mnemo -->` ... `<!-- END:mnemo -->` blocks into raw
 * memory-like items. This powers POST /api/import so that existing
 * AGENTS.md / CLAUDE.md files containing mnemo blocks can be (re-)ingested
 * without manual copy/paste per memory.
 *
 * Parsing strategy:
 *  1. Extract each BEGIN/END block (there may be more than one).
 *  2. Within a block, lines are grouped by `## <Type>s` headings into types.
 *  3. Each bullet line ` - **Title** (meta) — content #tag ...` is parsed.
 *  4. Fallback: any non-heading, non-empty line not starting with `-` is
 *     collected as a plain FACT with its text as content.
 *  5. Returns raw entries {type, title, content, tags, importance?, source?}.
 */

import type { MemoryType } from "@/lib/schemas";
import { MEMORY_TYPES } from "@/lib/schemas";

export type ParsedMnemoEntry = {
  type: MemoryType;
  title: string;
  content: string;
  tags: string[];
  importance?: number;
  source?: string;
};

const BLOCK_RE =
  /<!--\s*BEGIN:mnemo\s*-->([\s\S]*?)<!--\s*END:mnemo\s*-->/gi;

// Maps plural/bare heading labels to type (e.g. "Conventions" -> CONVENTION).
const HEADING_TO_TYPE: Record<string, MemoryType> = {
  convention: "CONVENTION",
  conventions: "CONVENTION",
  lesson: "LESSON",
  lessons: "LESSON",
  decision: "DECISION",
  decisions: "DECISION",
  fact: "FACT",
  facts: "FACT",
};

const DEFAULT_TYPE: MemoryType = "FACT";

/**
 * Extract raw block bodies from a multi-block or single-block source.
 * When no mnemo markers are found, the entire input is treated as one
 * implicit block (so importing a bare memory list still works).
 */
export function extractMnemoBlocks(content: string): string[] {
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  BLOCK_RE.lastIndex = 0;
  while ((m = BLOCK_RE.exec(content)) !== null) {
    const body = m[1].trim();
    if (body.length > 0) blocks.push(body);
  }
  if (blocks.length === 0) {
    const trimmed = content.trim();
    if (trimmed.length > 0) return [trimmed];
    return [];
  }
  return blocks;
}

/**
 * Tokenise inline meta like "(updated Jul 17; importance: 0.90)".
 * Returns importance as a float when found, otherwise undefined.
 */
function parseImportanceFromMeta(metaStr: string | undefined): number | undefined {
  if (!metaStr) return undefined;
  const m = metaStr.match(/importance\s*:\s*([0-9.]+)/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : undefined;
}

/**
 * Split an entry line into title, content, tags, importance.
 * Tries to handle the canonical rendered form:
 *   - **Title** (updated ...; importance: 0.90) — content #tag #tag2
 * but is deliberately tolerant of partial forms.
 */
function parseBulletLine(
  line: string,
): { title: string; content: string; tags: string[]; importance?: number } | null {
  const trimmed = line.trim();
  const body = trimmed.startsWith("-") ? trimmed.slice(1).trim() : trimmed;
  if (body.length === 0) return null;

  // Try to extract a **Title** prefix.
  const boldRe = /^\*\*(.+?)\*\*\s*(?:\(([^)]+)\))?\s*[—-]\s*/;
  const boldMatch = body.match(boldRe);
  let title: string;
  let rest: string;
  let importance: number | undefined;

  if (boldMatch) {
    title = boldMatch[1].trim();
    importance = parseImportanceFromMeta(boldMatch[2]);
    rest = body.slice(boldMatch[0].length);
  } else {
    // No **Title** — treat first sentence or first 80 chars as title.
    const firstDash = body.indexOf(" — ");
    const dash2 = body.indexOf(" - ");
    const dashIdx = firstDash >= 0 ? firstDash : dash2 >= 0 ? dash2 : -1;
    if (dashIdx >= 0) {
      title = body.slice(0, dashIdx).trim().replace(/^\*\*|\*\*$/g, "").trim();
      rest = body.slice(dashIdx + 3).trim();
    } else {
      // No dash-separated split — first up-to-80 chars as title, rest content.
      const words = body.split(/\s+/).slice(0, 8).join(" ");
      title = words.slice(0, 100);
      rest = body.slice(title.length).trim();
      if (rest.length === 0) {
        rest = body;
        title = body.split(/\s+/).slice(0, 4).join(" ").slice(0, 80);
      }
    }
  }

  // Extract trailing #tags.
  const tagRe = /#([a-zA-Z0-9_-]+)/g;
  const tags: string[] = [];
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagRe.exec(rest)) !== null) {
    tags.push(tagMatch[1]);
  }
  // Remove tags from content for a cleaner stored copy.
  let content = rest.replace(/#[a-zA-Z0-9_-]+/g, "").trim();
  if (content.length === 0) content = rest;

  if (!title) return null;
  return { title: title.slice(0, 200), content, tags, importance };
}

export function parseBlockEntries(block: string): ParsedMnemoEntry[] {
  const entries: ParsedMnemoEntry[] = [];
  const lines = block.split(/\r?\n/);
  let currentType: MemoryType = DEFAULT_TYPE;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Heading lines: ## Conventions / ## Lessons / ...
    const headingMatch = trimmed.match(/^#{1,3}\s*(.+?)\s*$/);
    if (headingMatch) {
      const labelLower = headingMatch[1].toLowerCase().trim();
      const mapped = HEADING_TO_TYPE[labelLower];
      if (mapped) currentType = mapped;
      continue;
    }

    const parsed = parseBulletLine(trimmed);
    if (!parsed) continue;
    // Guard: skip obvious omitted footer lines.
    if (/^\[\+\d+ more/.test(parsed.title)) continue;
    if (/more memories omitted/.test(parsed.content)) continue;

    entries.push({
      type: currentType,
      title: parsed.title,
      content: parsed.content,
      tags: parsed.tags,
      importance: parsed.importance,
    });
  }

  // Validate types against known set.
  return entries.filter((e) => (MEMORY_TYPES as readonly string[]).includes(e.type));
}

/**
 * Top-level parser: extracts all BEGIN/END blocks from `content` in document
 * order, parses each block's entries, and returns the combined list deduped
 * by (lowercased title + first 80 chars of lowercased content) so that
 * copy-pasting the same block twice doesn't create duplicates.
 */
export function parseMnemoBlocks(content: string): ParsedMnemoEntry[] {
  const rawBlocks = extractMnemoBlocks(content);
  const all: ParsedMnemoEntry[] = [];
  for (const block of rawBlocks) {
    all.push(...parseBlockEntries(block));
  }

  const seen = new Set<string>();
  const deduped: ParsedMnemoEntry[] = [];
  for (const e of all) {
    const key = `${e.title.toLowerCase()}|${e.content.toLowerCase().slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(e);
  }
  return deduped;
}
