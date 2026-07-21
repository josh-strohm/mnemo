import { hardDeleteApiKey, revokeApiKey } from "@/lib/apiKeys";
import { logAudit, auditRequestInfo } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/api-keys/[id] — revoke (?hard not set) or hard-delete (?hard=true).
 */
export async function DELETE(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const hard = url.searchParams.get("hard") === "true";

  const ok = hard ? await hardDeleteApiKey(id) : await revokeApiKey(id);

  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });

  const { actorIp, userAgent } = auditRequestInfo(request);
  void logAudit(hard ? "api_key_revoke" : "api_key_revoke", {
    apiKeyId: id,
    actorIp,
    userAgent,
    metadata: { hard: hard ? true : false },
  });

  return Response.json({ ok: true, id, hard });
}
