import { prisma } from "@/lib/db";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "soft_delete"
  | "restore"
  | "search"
  | "export"
  | "batch_create"
  | "batch_delete"
  | "import"
  | "backup"
  | "api_key_create"
  | "api_key_revoke"
  | "context";

export type AuditMeta = Record<string, unknown>;

type LogAuditArgs = {
  memoryId?: string | null;
  projectId?: string | null;
  actorIp?: string | null;
  userAgent?: string | null;
  apiKeyId?: string | null;
  metadata?: AuditMeta | string | null;
};

/**
 * Fire-and-forget audit logger — never throws so request handlers stay fast.
 * Call `await` if you want the log to appear before the response, or `void`
 * to fire-and-forget. For latency-sensitive paths prefer `void logAudit(...)`.
 */
export async function logAudit(
  action: AuditAction | string,
  args: LogAuditArgs = {},
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        memoryId: args.memoryId ?? null,
        projectId: args.projectId ?? null,
        actorIp: args.actorIp ?? null,
        userAgent: args.userAgent ?? null,
        apiKeyId: args.apiKeyId ?? null,
        metadata:
          args.metadata == null
            ? null
            : typeof args.metadata === "string"
              ? args.metadata
              : JSON.stringify(args.metadata),
      },
    });
  } catch {
    // non-critical
  }
}

export type AuditLogRow = {
  id: string;
  action: string;
  memoryId: string | null;
  projectId: string | null;
  actorIp: string | null;
  userAgent: string | null;
  apiKeyId: string | null;
  metadata: string | null;
  createdAt: Date;
};

export type ListAuditOptions = {
  limit?: number;
  offset?: number;
  action?: string;
  memoryId?: string;
  projectId?: string;
};

export async function listAuditLogs(opts: ListAuditOptions = {}): Promise<{
  items: AuditLogRow[];
  total: number;
}> {
  const where: Record<string, unknown> = {};
  if (opts.action) where.action = opts.action;
  if (opts.memoryId) where.memoryId = opts.memoryId;
  if (opts.projectId) where.projectId = opts.projectId;

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: opts.offset ?? 0,
      take: Math.min(opts.limit ?? 50, 200),
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      action: r.action,
      memoryId: r.memoryId ?? null,
      projectId: r.projectId ?? null,
      actorIp: r.actorIp ?? null,
      userAgent: r.userAgent ?? null,
      apiKeyId: r.apiKeyId ?? null,
      metadata: r.metadata ?? null,
      createdAt: r.createdAt,
    })),
    total,
  };
}

export function auditRequestInfo(req: Request): {
  actorIp: string | null;
  userAgent: string | null;
} {
  const fwd = req.headers.get("x-forwarded-for");
  const realIp =
    fwd?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    req.headers.get("cf-connecting-ip") ??
    null;
  return {
    actorIp: realIp,
    userAgent: req.headers.get("user-agent") ?? null,
  };
}
