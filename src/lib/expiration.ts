/**
 * Expiration helpers — Tier 3.
 * - listExpiring(days, project?)
 * - purgeExpiredMemories({before, hard, projectId?}) -> count
 */

import { prisma } from "@/lib/db";

export type ExpiringMemoryRow = {
  id: string;
  title: string;
  expiresAt: Date;
  projectId: string | null;
};

export async function listExpiring(
  days: number,
  opts: { projectId?: string | null } = {},
): Promise<ExpiringMemoryRow[]> {
  const now = new Date();
  const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const where: Record<string, unknown> = {
    deletedAt: null,
    expiresAt: { gte: now, lte: cutoff },
  };
  if (opts.projectId === null) {
    (where as Record<string, unknown>).projectId = null;
  } else if (opts.projectId !== undefined) {
    (where as Record<string, unknown>).projectId = opts.projectId;
  }

  const rows = await prisma.memory.findMany({
    where: where as never,
    select: { id: true, title: true, expiresAt: true, projectId: true },
    orderBy: { expiresAt: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    expiresAt: r.expiresAt as Date,
    projectId: r.projectId,
  }));
}

export type PurgeResult = {
  softDeleted: number;
  hardDeleted: number;
};

/**
 * Purge expired memories: those with expiresAt < before.
 * soft = soft-delete (default); hard = permanent.
 */
export async function purgeExpiredMemories(
  opts: {
    before?: Date;
    hard?: boolean;
    projectId?: string | null;
  } = {},
): Promise<PurgeResult> {
  const before = opts.before ?? new Date();
  const where: Record<string, unknown> = {
    expiresAt: { lt: before },
    deletedAt: null,
  };
  if (opts.projectId === null) {
    (where as Record<string, unknown>).projectId = null;
  } else if (opts.projectId !== undefined) {
    (where as Record<string, unknown>).projectId = opts.projectId;
  }

  if (opts.hard === true) {
    const res = await prisma.memory.deleteMany({ where: where as never });
    return { softDeleted: 0, hardDeleted: res.count };
  }

  // Soft-delete path.
  const res = await prisma.memory.updateMany({
    where: where as never,
    data: { deletedAt: new Date() },
  });
  return { softDeleted: res.count, hardDeleted: 0 };
}

export function isStale(lastAccessedAt: Date | null, updatedAt: Date, days = 90): boolean {
  const ref = lastAccessedAt ?? updatedAt;
  const ageMs = Date.now() - ref.getTime();
  return ageMs > days * 24 * 60 * 60 * 1000;
}

export function calculateDecayedImportance(
  importance: number,
  lastAccessedAt: Date | null,
  updatedAt: Date,
): { decayed: number; isStale: boolean } {
  const ref = lastAccessedAt ?? updatedAt;
  const days = (Date.now() - ref.getTime()) / (24 * 60 * 60 * 1000);
  if (days <= 90) return { decayed: importance, isStale: false };
  const periods = Math.floor((days - 90) / 90);
  const decayed = Math.max(0.05, importance * Math.pow(0.95, periods));
  return { decayed: Math.round(decayed * 1000) / 1000, isStale: true };
}
