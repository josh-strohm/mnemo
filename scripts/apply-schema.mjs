import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const sql = readFileSync("schema.sql", "utf8");
await db.executeMultiple(sql);

const res = await db.execute("SELECT name FROM sqlite_master WHERE type='table'");
console.log(res.rows);