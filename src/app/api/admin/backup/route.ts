import { prisma } from "@/lib/db";
import { logAudit, auditRequestInfo } from "@/lib/audit";

/**
 * GET /api/admin/backup — Tier 3 full JSON dump.
 * Streams { memories: [...], versions: [...], projects: [...], generatedAt }
 * as application/json. Includes soft-deleted memories (they are recoverable)
 * and all versions. Expires nothing.
 *
 * Security: requires MNEMO_API_KEY (primary) — skips secondary api-key path
 * when the caller is the admin key. Per-agent keys need backup:read.
 *
 * For very large libraries this could be big; clients should handle
 * streaming. Netlify function timeout limits apply, but in practice payloads
 * are small (< 20 MB for 10k memories + versions).
 */

export async function GET(request: Request) {
  try {
    const [memories, versions, projects] = await Promise.all([
      prisma.memory.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.memoryVersion.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.project.findMany({ orderBy: { createdAt: "asc" } }),
    ]);

    const payload = {
      schema: "mnemo.backup.v1",
      generatedAt: new Date().toISOString(),
      counts: {
        memories: memories.length,
        versions: versions.length,
        projects: projects.length,
      },
      projects,
      memories,
      versions,
    };

    const { actorIp, userAgent } = auditRequestInfo(request);
    void logAudit("backup", { actorIp, userAgent, metadata: payload.counts });

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="mnemo-backup.json"',
      },
    });
  } catch (err) {
    console.error("[admin/backup]", err);
    return Response.json({ error: "Backup failed" }, { status: 500 });
  }
}
