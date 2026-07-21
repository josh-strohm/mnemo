// One-off: apply Tier 2 + Tier 3 migrations to the local dev.db file.
// Idempotent — safe to run multiple times.
import { createClient } from "@libsql/client";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";

async function splitSql(sql) {
  // Same approach as scripts/migrate.mjs: respect BEGIN/END blocks while
  // splitting on top-level semicolons.
  const stripped = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const stmts = [];
  let buf = "";
  let depth = 0;
  const lower = stripped.toLowerCase();
  let i = 0;
  while (i < stripped.length) {
    const sub = lower.slice(i);
    if (sub.startsWith("begin") && /[^a-z0-9_]/.test(lower[i + 5] || " ")) {
      depth++;
      buf += stripped.slice(i, i + 5);
      i += 5;
      continue;
    }
    if (sub.startsWith("end") && /[^a-z0-9_]/.test(lower[i + 3] || " ")) {
      if (depth > 0) depth--;
      buf += stripped.slice(i, i + 3);
      i += 3;
      continue;
    }
    const ch = stripped[i];
    if (ch === ";" && depth === 0) {
      const trimmed = buf.replace(/;$/, "").trim();
      if (trimmed.length > 0) stmts.push(trimmed);
      buf = "";
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  const tail = buf.trim();
  if (tail.length > 0) stmts.push(tail);
  return stmts;
}

const client = createClient({ url: dbUrl });

// Apply ALL migration files in db/migrations/0001_*.sql ... 0003_*.sql in order.
const dir = path.join(process.cwd(), "db/migrations");
const files = readdirSync(dir)
  .filter((f) => /^\d+_.+\.sql$/.test(f))
  .sort();

let applied = 0;
let skipped = 0;
for (const file of files) {
  const sql = readFileSync(path.join(dir, file), "utf8");
  const stmts = await splitSql(sql);
  for (const stmt of stmts) {
    try {
      await client.execute(stmt);
      applied++;
      process.stdout.write(`ok    | ${file} | ${stmt.replace(/\s+/g, " ").slice(0, 80)}\n`);
    } catch (err) {
      skipped++;
      const msg = String(err instanceof Error ? err.message : err).slice(0, 120);
      process.stdout.write(`skip  | ${file} | ${msg}\n`);
    }
  }
}

// FTS5 might not be available in libsql client file URLs — verify.
try {
  await client.execute(
    `CREATE VIRTUAL TABLE IF NOT EXISTS MemoryFts_check USING fts5(memoryId UNINDEXED, title, content, tags, tokenize = 'porter unicode61')`,
  );
  process.stdout.write(`ok    | verified FTS5 available\n`);
  await client.execute("DROP TABLE IF EXISTS MemoryFts_check");
} catch (err) {
  process.stdout.write(`skip  | FTS5 check failed: ${String(err)}\n`);
}

const cols = await client.execute("PRAGMA table_info(Memory)");
process.stdout.write(`\nMemory columns:\n`);
for (const row of cols.rows) process.stdout.write(JSON.stringify(row) + "\n");
process.stdout.write(`\n${applied} applied, ${skipped} skipped.\n`);
