/**
 * GET /api/openapi.json — Tier 3 minimal OpenAPI spec.
 *
 * Describes the Mnemo API surface at a high level. Kept simple to avoid
 * broken-by-TS syntax issues with reserved keywords (delete: ...) inside
 * path operations.
 */

const ENDPOINTS = [
  {
    path: "/api/memories",
    methods: ["get", "post"],
    summary: "List or create memories",
  },
  { path: "/api/memories/batch", methods: ["post"], summary: "Batch create" },
  { path: "/api/memories/batch-delete", methods: ["post"], summary: "Batch soft/hard delete" },
  { path: "/api/memories/{id}", methods: ["get", "put"], summary: "Get or update a memory" },
  { path: "/api/memories/{id}", methods: ["delete"], summary: "Soft (default) or hard delete" },
  { path: "/api/memories/{id}/links", methods: ["get", "post"], summary: "List/add/remove related links" },
  { path: "/api/memories/{id}/restore", methods: ["post"], summary: "Restore deleted memory or version" },
  { path: "/api/search", methods: ["get"], summary: "Hybrid keyword + vector search" },
  { path: "/api/export", methods: ["get"], summary: "Compiled memory export (AGENTS.md block)" },
  { path: "/api/context", methods: ["get"], summary: "Tier 3 — budget-aware context assembly" },
  { path: "/api/import", methods: ["post"], summary: "Tier 3 — import BEGIN/END mnemo blocks" },
  { path: "/api/import/hermes", methods: ["post"], summary: "Tier 3 — import Hermes built-in memory entries" },
  { path: "/api/tags", methods: ["get"], summary: "Tag counts" },
  { path: "/api/trash", methods: ["get"], summary: "List soft-deleted memories" },
  { path: "/api/admin/stats", methods: ["get"], summary: "Tier 3 — admin stats snapshot" },
  { path: "/api/admin/backup", methods: ["get"], summary: "Tier 3 — full JSON backup" },
  { path: "/api/admin/audit", methods: ["get"], summary: "Tier 3 — audit log listing" },
  { path: "/api/admin/expiring", methods: ["get"], summary: "Tier 3 — expiring memories" },
  { path: "/api/api-keys", methods: ["get", "post"], summary: "Tier 3 — per-agent API keys" },
  { path: "/api/api-keys/{id}", methods: ["delete"], summary: "Tier 3 — revoke/hard-delete an API key" },
  { path: "/api/openapi.json", methods: ["get"], summary: "This OpenAPI spec document" },
];

export async function GET() {
  const spec: Record<string, unknown> = {
    openapi: "3.1.0",
    info: {
      title: "Mnemo API",
      version: "3.0.0",
      description:
        "Agent memory manager — REST API. Auth: Bearer MNEMO_API_KEY (primary) or per-agent API keys.",
    },
    servers: [{ url: "https://mnemo.joshstrohm.me", description: "Production" }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
    },
    paths: {},
  };
  const paths = spec.paths as Record<string, Record<string, unknown>>;
  for (const ep of ENDPOINTS) {
    const entry = (paths[ep.path] ??= {});
    for (const method of ep.methods) {
      entry[method] = { summary: ep.summary, responses: { "200": { description: "OK" } } };
    }
  }
  return new Response(JSON.stringify(spec, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=600",
    },
  });
}
