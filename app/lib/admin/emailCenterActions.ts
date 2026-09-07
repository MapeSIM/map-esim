"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/auth/session";
import {
  retryAdminEmailCenterSend,
  type EmailCenterRetryResult,
} from "@/app/lib/admin/emailCenterRetry";

export type EmailCenterRetryFormState = EmailCenterRetryResult | null;

export async function retryEmailCenterSendAction(
  _prev: EmailCenterRetryFormState,
  formData: FormData
): Promise<EmailCenterRetryFormState> {
  const admin = await requireRole("ADMIN");

  const result = await retryAdminEmailCenterSend({
    adminUserId: admin.id,
    retryKind: String(formData.get("retryKind") ?? ""),
    targetId: String(formData.get("targetId") ?? ""),
    emailEvent: String(formData.get("emailEvent") ?? "") || null,
  });

  if (result.ok) {
    revalidatePath("/admin/emails");
  }

  return result;
}
