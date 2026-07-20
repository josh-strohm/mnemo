// Applies a SQL migration file against the configured libsql/Turso database.
// Continues past per-statement errors (e.g. "duplicate column") so the
// migration is idempotent. Default file: prisma/migrations/0001_tier1.sql
import "dotenv/config";
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

const file = process.argv[2] ?? "db/migrations/0001_tier1.sql";

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const sql = readFileSync(file, "utf8");
// Drop comment lines first so leading comments don't bundle the first
// statement into a fragment that gets filtered out.
const stripped = sql
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");
// Split on statement-ending semicolons, keeping BEGIN ... END; trigger
// bodies intact (they contain inner semicolons). Balanced against the
// keyword count so CREATE TRIGGER ... BEGIN ...; END stays one statement.
const statements = [];
{
  let depth = 0;
  let buf = "";
  const lower = stripped.toLowerCase();
  let i = 0;
  while (i < stripped.length) {
    const ch = stripped[i];
    const atBegin = isKeywordAt(lower, i, "begin");
    const atEnd = isKeywordAt(lower, i, "end");
    if (atBegin) {
      depth++;
      buf += stripped.slice(i, i + 5);
      i += 5;
      continue;
    }
    if (atEnd) {
      if (depth > 0) depth--;
      buf += stripped.slice(i, i + 3);
      i += 3;
      continue;
    }
    if (ch === ";" && depth === 0) {
      const trimmed = buf.replace(/;$/, "").trim();
      if (trimmed.length > 0) statements.push(trimmed);
      buf = "";
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  const tail = buf.trim();
  if (tail.length > 0) statements.push(tail);
}

function isKeywordAt(s, i, kw) {
  if (s.slice(i, i + kw.length) !== kw) return false;
  const before = i === 0 ? " " : s[i - 1];
  const after = s[i + kw.length] ?? " ";
  return /[^a-z0-9_]/.test(before) && /[^a-z0-9_]/.test(after);
}

let applied = 0;
let skipped = 0;
for (const stmt of statements) {
  try {
    await db.execute(stmt);
    applied++;
    process.stdout.write(`ok    | ${stmt.replace(/\s+/g, " ").slice(0, 80)}\n`);
  } catch (err) {
    skipped++;
    process.stdout.write(
      `skip  | ${String(err instanceof Error ? err.message : err).slice(0, 100)}\n`,
    );
  }
}

const cols = await db.execute("PRAGMA table_info(Memory)");
console.log("\nMemory columns now:");
for (const row of cols.rows) {
  console.log(row);
}
console.log(`\nApplied ${applied} statement(s), skipped ${skipped}.`);