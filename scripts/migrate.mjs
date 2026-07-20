// Applies a SQL migration file against the configured libsql/Turso database.
// Continues past per-statement errors (e.g. "duplicate column") so the
// migration is idempotent. Default file: prisma/migrations/0001_tier1.sql
import "dotenv/config";
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

const file = process.argv[2] ?? "prisma/migrations/0001_tier1.sql";

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
const statements = stripped
  .split(/;\s*/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

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