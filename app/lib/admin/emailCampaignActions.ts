"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/app/lib/auth/session";
import {
  createAdminEmailCampaign,
  EmailCampaignError,
  sendAdminEmailCampaignBulk,
  sendAdminEmailCampaignTest,
} from "@/app/lib/admin/emailCampaigns";

export type EmailCampaignActionState =
  | null
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function revalidateCampaignPaths(campaignId: string): void {
  revalidatePath("/admin/email-campaigns");
  revalidatePath(
    `/admin/email-campaigns/${encodeURIComponent(campaignId)}`
  );
}

function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    String((error as { digest: string }).digest).startsWith("NEXT_REDIRECT")
  );
}

export async function createEmailCampaignAction(
  _prev: EmailCampaignActionState,
  formData: FormData
): Promise<EmailCampaignActionState> {
  const admin = await requireRole("ADMIN");
  try {
    const created = await createAdminEmailCampaign({
      adminUserId: admin.id,
      subject: String(formData.get("subject") ?? ""),
      bodyText: String(formData.get("bodyText") ?? ""),
      audienceRaw: String(formData.get("audience") ?? ""),
    });
    redirect(`/admin/email-campaigns/${created.id}`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof EmailCampaignError) {
      return {
        ok: false,
        error: error.message,
        fieldErrors: error.field ? { [error.field]: error.message } : undefined,
      };
    }
    return { ok: false, error: "Campaign could not be saved. Please try again." };
  }
}

export async function sendEmailCampaignTestAction(
  _prev: EmailCampaignActionState,
  formData: FormData
): Promise<EmailCampaignActionState> {
  const admin = await requireRole("ADMIN");
  try {
    const campaignId = String(formData.get("campaignId") ?? "");
    await sendAdminEmailCampaignTest({
      adminUserId: admin.id,
      campaignId,
      testEmail: String(formData.get("testEmail") ?? admin.email ?? ""),
    });
    revalidateCampaignPaths(campaignId);
    return { ok: true, message: "Test email sent." };
  } catch (error) {
    if (error instanceof EmailCampaignError) {
      return {
        ok: false,
        error: error.message,
        fieldErrors: error.field ? { [error.field]: error.message } : undefined,
      };
    }
    return { ok: false, error: "Test email could not be sent." };
  }
}

export async function sendEmailCampaignBulkAction(
  _prev: EmailCampaignActionState,
  formData: FormData
): Promise<EmailCampaignActionState> {
  const admin = await requireRole("ADMIN");
  try {
    const campaignId = String(formData.get("campaignId") ?? "");
    const result = await sendAdminEmailCampaignBulk({
      adminUserId: admin.id,
      campaignId,
      confirmPhrase: String(formData.get("confirmPhrase") ?? ""),
      expectedRecipientCount: Number(formData.get("expectedRecipientCount") ?? ""),
    });
    revalidateCampaignPaths(campaignId);
    if (result.remaining > 0) {
      return {
        ok: true,
        message: `Sent ${result.sentThisBatch} in this batch. ${result.remaining} remaining — continue sending.`,
      };
    }
    return {
      ok: true,
      message: `Campaign send finished. Status: ${result.status}.`,
    };
  } catch (error) {
    if (error instanceof EmailCampaignError) {
      return {
        ok: false,
        error: error.message,
        fieldErrors: error.field ? { [error.field]: error.message } : undefined,
      };
    }
    return { ok: false, error: "Campaign could not be sent." };
  }
}
