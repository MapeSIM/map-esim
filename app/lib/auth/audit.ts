import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/db";

export async function writeAuditLog(options: {
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: options.actorUserId || null,
        action: options.action,
        targetType: options.targetType,
        targetId: options.targetId || null,
        metadata: options.metadata,
      },
    });
  } catch {
    // Never fail the primary flow because of audit logging.
    console.error("Audit log write failed");
  }
}
