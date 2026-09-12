import "server-only";

import {
  EmailCampaignAudience,
  EmailCampaignRecipientStatus,
  EmailCampaignStatus,
  OrderStatus,
  Prisma,
  Role,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import {
  EMAIL_CAMPAIGN_CHANNEL,
  EMAIL_CAMPAIGN_HISTORY_LIMIT,
  EMAIL_CAMPAIGN_LOG_LIMIT,
  EMAIL_CAMPAIGN_SEND_BATCH,
  campaignCanContinueBulkSend,
  campaignCanStartBulkSend,
  campaignConfirmPhraseMatches,
  emailCampaignAudienceLabel,
  emailCampaignRecipientStatusLabel,
  emailCampaignStatusLabel,
  parseEmailCampaignAudience,
  sanitizeCampaignBody,
  sanitizeCampaignSubject,
  type EmailCampaignAudienceId,
} from "@/app/lib/admin/emailCampaignShared";
import {
  renderCampaignEmailHtml,
  renderCampaignEmailText,
} from "@/app/lib/email/campaignTemplate";
import { isValidEmail } from "@/app/lib/email/isValidEmail";
import { sendChannelMail } from "@/app/lib/email/transport";

export class EmailCampaignError extends Error {
  constructor(
    message: string,
    readonly field?: string
  ) {
    super(message);
    this.name = "EmailCampaignError";
  }
}

function audienceWhere(
  audience: EmailCampaignAudienceId
): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = {
    role: Role.CUSTOMER,
    deletedAt: null,
  };
  if (audience === "PURCHASED_CUSTOMERS") {
    return {
      ...base,
      orders: { some: { status: OrderStatus.COMPLETED } },
    };
  }
  if (audience === "ACTIVE_CUSTOMERS") {
    return {
      ...base,
      blockedAt: null,
      emailVerifiedAt: { not: null },
    };
  }
  return base;
}

function isSendableCustomerEmail(email: string | null | undefined): boolean {
  const value = String(email ?? "")
    .trim()
    .toLowerCase();
  return Boolean(value) && value.length <= 254 && isValidEmail(value);
}

export async function countCampaignAudience(
  audience: EmailCampaignAudienceId
): Promise<number> {
  const rows = await prisma.user.findMany({
    where: audienceWhere(audience),
    select: { email: true },
  });
  return rows.filter((row) => isSendableCustomerEmail(row.email)).length;
}

export async function listCampaignAudienceRecipients(
  audience: EmailCampaignAudienceId
): Promise<Array<{ id: string; email: string }>> {
  const rows = await prisma.user.findMany({
    where: audienceWhere(audience),
    select: { id: true, email: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const seen = new Set<string>();
  const out: Array<{ id: string; email: string }> = [];
  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    if (!isSendableCustomerEmail(email) || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push({ id: row.id, email });
  }
  return out;
}

async function sendCampaignMessage(input: {
  to: string;
  subject: string;
  bodyText: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const subject = sanitizeCampaignSubject(input.subject);
  const bodyText = sanitizeCampaignBody(input.bodyText);
  if (!subject || !bodyText) {
    return { ok: false, reason: "send_failed" };
  }
  return sendChannelMail({
    channel: EMAIL_CAMPAIGN_CHANNEL,
    to: input.to,
    subject,
    text: renderCampaignEmailText({ subject, bodyText }),
    html: renderCampaignEmailHtml({ subject, bodyText }),
  });
}

function formatCreatedAt(date: Date): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date) + " UTC"
  );
}

export type AdminEmailCampaignListRow = {
  id: string;
  subject: string;
  audienceLabel: string;
  statusLabel: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdAtLabel: string;
};

export async function listAdminEmailCampaigns(): Promise<
  AdminEmailCampaignListRow[]
> {
  const rows = await prisma.emailCampaign.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: EMAIL_CAMPAIGN_HISTORY_LIMIT,
    select: {
      id: true,
      subject: true,
      audience: true,
      status: true,
      recipientCount: true,
      sentCount: true,
      failedCount: true,
      createdAt: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    subject: row.subject,
    audienceLabel: emailCampaignAudienceLabel(row.audience),
    statusLabel: emailCampaignStatusLabel(row.status),
    recipientCount: row.recipientCount,
    sentCount: row.sentCount,
    failedCount: row.failedCount,
    createdAtLabel: formatCreatedAt(row.createdAt),
  }));
}

export type AdminEmailCampaignDetail = {
  id: string;
  subject: string;
  bodyText: string;
  previewHtml: string;
  audience: EmailCampaignAudienceId;
  audienceLabel: string;
  status: string;
  statusLabel: string;
  liveRecipientCount: number;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  pendingCount: number;
  testSentTo: string | null;
  testSentAtLabel: string | null;
  createdAtLabel: string;
  canStartBulk: boolean;
  canContinueBulk: boolean;
  logs: Array<{
    id: string;
    email: string;
    statusLabel: string;
    errorCode: string | null;
    sentAtLabel: string | null;
  }>;
};

export async function getAdminEmailCampaignDetail(
  campaignId: string
): Promise<AdminEmailCampaignDetail | null> {
  const id = campaignId.trim();
  if (!id || id.length > 64) return null;
  const row = await prisma.emailCampaign.findUnique({
    where: { id },
    include: {
      recipients: {
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: EMAIL_CAMPAIGN_LOG_LIMIT,
        select: {
          id: true,
          email: true,
          status: true,
          errorCode: true,
          sentAt: true,
        },
      },
    },
  });
  if (!row) return null;
  const audience = row.audience as EmailCampaignAudienceId;
  const [liveRecipientCount, pendingCount] = await Promise.all([
    countCampaignAudience(audience),
    prisma.emailCampaignRecipient.count({
      where: { campaignId: row.id, status: EmailCampaignRecipientStatus.PENDING },
    }),
  ]);
  return {
    id: row.id,
    subject: row.subject,
    bodyText: row.bodyText,
    previewHtml: renderCampaignEmailHtml({
      subject: row.subject,
      bodyText: row.bodyText,
    }),
    audience,
    audienceLabel: emailCampaignAudienceLabel(row.audience),
    status: row.status,
    statusLabel: emailCampaignStatusLabel(row.status),
    liveRecipientCount,
    recipientCount: row.recipientCount,
    sentCount: row.sentCount,
    failedCount: row.failedCount,
    skippedCount: row.skippedCount,
    pendingCount,
    testSentTo: row.testSentTo,
    testSentAtLabel: row.testSentAt ? formatCreatedAt(row.testSentAt) : null,
    createdAtLabel: formatCreatedAt(row.createdAt),
    canStartBulk: campaignCanStartBulkSend(row.status),
    canContinueBulk: campaignCanContinueBulkSend(row.status) && pendingCount > 0,
    logs: row.recipients.map((log) => ({
      id: log.id,
      email: log.email,
      statusLabel: emailCampaignRecipientStatusLabel(log.status),
      errorCode: log.errorCode,
      sentAtLabel: log.sentAt ? formatCreatedAt(log.sentAt) : null,
    })),
  };
}

export async function createAdminEmailCampaign(input: {
  adminUserId: string;
  subject: string;
  bodyText: string;
  audienceRaw: string;
}): Promise<{ id: string }> {
  const subject = sanitizeCampaignSubject(input.subject);
  const bodyText = sanitizeCampaignBody(input.bodyText);
  const audience = parseEmailCampaignAudience(input.audienceRaw);
  if (!subject) {
    throw new EmailCampaignError("Enter a subject.", "subject");
  }
  if (!bodyText) {
    throw new EmailCampaignError("Enter email content.", "bodyText");
  }
  if (!audience) {
    throw new EmailCampaignError("Choose an audience.", "audience");
  }
  const created = await prisma.emailCampaign.create({
    data: {
      createdByAdminId: input.adminUserId,
      subject,
      bodyText,
      audience: audience as EmailCampaignAudience,
      status: EmailCampaignStatus.DRAFT,
    },
    select: { id: true },
  });
  await prisma.auditLog.create({
    data: {
      actorUserId: input.adminUserId,
      action: "email_campaign.created",
      targetType: "EmailCampaign",
      targetId: created.id,
      metadata: { audience },
    },
  });
  return created;
}

export async function sendAdminEmailCampaignTest(input: {
  adminUserId: string;
  campaignId: string;
  testEmail: string;
}): Promise<void> {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: input.campaignId.trim() },
    select: { id: true, subject: true, bodyText: true, status: true },
  });
  if (!campaign) {
    throw new EmailCampaignError("Campaign not found.");
  }
  const to = input.testEmail.trim().toLowerCase();
  if (!isSendableCustomerEmail(to)) {
    throw new EmailCampaignError("Enter a valid test email.", "testEmail");
  }
  const result = await sendCampaignMessage({
    to,
    subject: campaign.subject,
    bodyText: campaign.bodyText,
  });
  if (!result.ok) {
    throw new EmailCampaignError(
      result.reason === "not_configured"
        ? "Email is not configured."
        : "Test email could not be sent."
    );
  }
  const nextStatus =
    campaign.status === EmailCampaignStatus.DRAFT
      ? EmailCampaignStatus.TEST_SENT
      : campaign.status;
  await prisma.emailCampaign.update({
    where: { id: campaign.id },
    data: {
      status: nextStatus,
      testSentTo: to,
      testSentAt: new Date(),
    },
  });
  await prisma.auditLog.create({
    data: {
      actorUserId: input.adminUserId,
      action: "email_campaign.test_sent",
      targetType: "EmailCampaign",
      targetId: campaign.id,
      metadata: { result: "sent" },
    },
  });
}

async function refreshCampaignCounts(campaignId: string): Promise<void> {
  const [sentCount, failedCount, skippedCount, pendingCount] = await Promise.all([
    prisma.emailCampaignRecipient.count({
      where: { campaignId, status: EmailCampaignRecipientStatus.SENT },
    }),
    prisma.emailCampaignRecipient.count({
      where: { campaignId, status: EmailCampaignRecipientStatus.FAILED },
    }),
    prisma.emailCampaignRecipient.count({
      where: { campaignId, status: EmailCampaignRecipientStatus.SKIPPED },
    }),
    prisma.emailCampaignRecipient.count({
      where: { campaignId, status: EmailCampaignRecipientStatus.PENDING },
    }),
  ]);
  const done = pendingCount === 0;
  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: {
      sentCount,
      failedCount,
      skippedCount,
      ...(done
        ? {
            status:
              sentCount === 0 && failedCount > 0
                ? EmailCampaignStatus.FAILED
                : EmailCampaignStatus.SENT,
            completedAt: new Date(),
            lastError: null,
          }
        : {}),
    },
  });
}

export async function sendAdminEmailCampaignBulk(input: {
  adminUserId: string;
  campaignId: string;
  confirmPhrase: string;
  expectedRecipientCount: number;
}): Promise<{ sentThisBatch: number; remaining: number; status: string }> {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: input.campaignId.trim() },
    select: {
      id: true,
      subject: true,
      bodyText: true,
      audience: true,
      status: true,
    },
  });
  if (!campaign) {
    throw new EmailCampaignError("Campaign not found.");
  }

  const starting = campaignCanStartBulkSend(campaign.status);
  const continuing = campaignCanContinueBulkSend(campaign.status);
  if (!starting && !continuing) {
    throw new EmailCampaignError("This campaign is no longer sendable.");
  }
  if (starting && !campaignConfirmPhraseMatches(input.confirmPhrase)) {
    throw new EmailCampaignError(
      "Type the confirmation phrase exactly to send.",
      "confirmPhrase"
    );
  }

  if (starting) {
    const recipients = await listCampaignAudienceRecipients(
      campaign.audience as EmailCampaignAudienceId
    );
    const liveCount = recipients.length;
    if (liveCount <= 0) {
      throw new EmailCampaignError("This audience has no eligible customers.");
    }
    if (
      !Number.isInteger(input.expectedRecipientCount) ||
      input.expectedRecipientCount !== liveCount
    ) {
      throw new EmailCampaignError(
        `Recipient count changed (${liveCount}). Refresh and confirm again.`,
        "expectedRecipientCount"
      );
    }

    const claimed = await prisma.emailCampaign.updateMany({
      where: {
        id: campaign.id,
        status: {
          in: [EmailCampaignStatus.DRAFT, EmailCampaignStatus.TEST_SENT],
        },
      },
      data: {
        status: EmailCampaignStatus.SENDING,
        startedAt: new Date(),
        recipientCount: liveCount,
        lastError: null,
      },
    });
    if (claimed.count !== 1) {
      throw new EmailCampaignError("This campaign is no longer sendable.");
    }

    await prisma.emailCampaignRecipient.createMany({
      data: recipients.map((row) => ({
        campaignId: campaign.id,
        customerUserId: row.id,
        email: row.email,
        status: EmailCampaignRecipientStatus.PENDING,
      })),
      skipDuplicates: true,
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: input.adminUserId,
        action: "email_campaign.bulk_started",
        targetType: "EmailCampaign",
        targetId: campaign.id,
        metadata: {
          audience: campaign.audience,
          recipientCount: liveCount,
        },
      },
    });
  }

  const pending = await prisma.emailCampaignRecipient.findMany({
    where: {
      campaignId: campaign.id,
      status: EmailCampaignRecipientStatus.PENDING,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: EMAIL_CAMPAIGN_SEND_BATCH,
    select: { id: true, email: true },
  });

  let sentThisBatch = 0;
  for (const row of pending) {
    const result = await sendCampaignMessage({
      to: row.email,
      subject: campaign.subject,
      bodyText: campaign.bodyText,
    });
    if (result.ok) {
      sentThisBatch += 1;
      await prisma.emailCampaignRecipient.update({
        where: { id: row.id },
        data: {
          status: EmailCampaignRecipientStatus.SENT,
          sentAt: new Date(),
          errorCode: null,
        },
      });
    } else {
      await prisma.emailCampaignRecipient.update({
        where: { id: row.id },
        data: {
          status:
            result.reason === "invalid_recipient"
              ? EmailCampaignRecipientStatus.SKIPPED
              : EmailCampaignRecipientStatus.FAILED,
          errorCode: result.reason,
        },
      });
    }
  }

  await refreshCampaignCounts(campaign.id);
  const remaining = await prisma.emailCampaignRecipient.count({
    where: {
      campaignId: campaign.id,
      status: EmailCampaignRecipientStatus.PENDING,
    },
  });
  const latest = await prisma.emailCampaign.findUnique({
    where: { id: campaign.id },
    select: { status: true },
  });
  if (remaining === 0) {
    await prisma.auditLog.create({
      data: {
        actorUserId: input.adminUserId,
        action: "email_campaign.bulk_completed",
        targetType: "EmailCampaign",
        targetId: campaign.id,
        metadata: { remaining: 0 },
      },
    });
  }
  return {
    sentThisBatch,
    remaining,
    status: latest?.status ?? campaign.status,
  };
}
