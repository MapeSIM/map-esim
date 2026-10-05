/**
 * Pure display helpers for the shared VeSIM-style Order Details card.
 * Never invents expiry — only formats provider/cache timestamps.
 */

import type { ProviderLifecycleCacheView } from "@/app/lib/orders/providerLifecycleShared";

export type EsimOrderDetailUsageView = {
  statusLabel: string;
  initialDataGB: number | null;
  remainingDataGB: number | null;
  usedDataGB: number | null;
  usagePercent: number | null;
  isUnlimited: boolean;
  reportsDataAllowance: boolean;
  activatedAt: string | null;
  expiresAt: string | null;
  daysRemaining: number | null;
  isExpired: boolean | null;
};

export type EsimOrderDetailDataTone = "healthy" | "low" | "depleted" | "unknown";

export function isUnlimitedDataAllowance(
  dataAllowance: string | null | undefined
): boolean {
  const raw = (dataAllowance ?? "").trim();
  if (!raw) return false;
  return /\bunlimited\b|\b∞\b/i.test(raw);
}

/**
 * Unlimited plans must never render as metered "0 GB / Data Depleted".
 * Detect via live flag, catalog labels, or VeSIM's common 0 GB total report.
 */
export function resolveIsUnlimitedPlan(input: {
  isUnlimited?: boolean | null;
  dataAllowance?: string | null;
  dataPlan?: string | null;
  initialDataGB?: number | null;
  remainingDataGB?: number | null;
  reportsDataAllowance?: boolean | null;
}): boolean {
  if (input.isUnlimited === true) return true;
  if (
    isUnlimitedDataAllowance(input.dataAllowance) ||
    isUnlimitedDataAllowance(input.dataPlan)
  ) {
    return true;
  }
  void input.reportsDataAllowance;
  void input.remainingDataGB;
  // VeSIM often reports initial/remaining as 0 for unlimited lines.
  if (
    typeof input.initialDataGB === "number" &&
    Number.isFinite(input.initialDataGB) &&
    input.initialDataGB <= 0
  ) {
    return true;
  }
  return false;
}

export function formatOrderDetailGb(
  value: number | null | undefined,
  opts?: { unit?: "GB" | "auto"; suffix?: string }
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const unit = opts?.unit ?? "GB";
  const abs = Math.abs(value);
  let label: string;
  if (unit === "auto" && abs > 0 && abs < 1) {
    const mb = value * 1024;
    label = Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(0)} MB`;
  } else if (Number.isInteger(value)) {
    label = `${value} GB`;
  } else {
    label = `${value.toFixed(2)} GB`;
  }
  return opts?.suffix ? `${label}${opts.suffix}` : label;
}

export function formatOrderDetailWhen(
  iso: string | null | undefined
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return (
    new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }).format(d) + " UTC"
  );
}

/** Relative day badge from provider expiry only — never from catalog validity. */
export function daysLeftFromExpiresAt(
  expiresAtIso: string | null | undefined,
  nowMs: number = Date.now()
): number | null {
  if (!expiresAtIso) return null;
  const ms = Date.parse(expiresAtIso);
  if (!Number.isFinite(ms)) return null;
  return Math.ceil((ms - nowMs) / 86_400_000);
}

export function daysLeftBadgeLabel(
  daysLeft: number | null | undefined
): string | null {
  if (daysLeft == null || !Number.isFinite(daysLeft)) return null;
  if (daysLeft < 0) return "Expired";
  if (daysLeft === 0) return "Expires today";
  if (daysLeft === 1) return "1 day left";
  return `${daysLeft} days left`;
}

export function remainingPercent(
  remainingDataGB: number | null,
  initialDataGB: number | null
): number | null {
  if (
    remainingDataGB == null ||
    initialDataGB == null ||
    !Number.isFinite(remainingDataGB) ||
    !Number.isFinite(initialDataGB) ||
    initialDataGB <= 0
  ) {
    return null;
  }
  return Math.min(100, Math.max(0, (remainingDataGB / initialDataGB) * 100));
}

export function dataUsageTone(
  remainingPct: number | null,
  remainingDataGB: number | null
): EsimOrderDetailDataTone {
  if (
    (remainingDataGB != null &&
      Number.isFinite(remainingDataGB) &&
      remainingDataGB <= 0) ||
    (remainingPct != null && remainingPct <= 0)
  ) {
    return "depleted";
  }
  if (remainingPct != null && remainingPct <= 20) {
    return "low";
  }
  if (remainingPct != null) return "healthy";
  return "unknown";
}

/**
 * Dynamic eSIM status chip text (VeSIM-style).
 * Prefer live usage when present; otherwise cached lifecycle + order badge.
 */
export function composeEsimStatusBadgeText(input: {
  isRefunded: boolean;
  orderStatusLabel?: string | null;
  lifecycle?: ProviderLifecycleCacheView | null;
  usage?: EsimOrderDetailUsageView | null;
  dataAllowance?: string | null;
  dataPlan?: string | null;
  nowMs?: number;
}): string {
  if (input.isRefunded) return "Refunded";

  const usage = input.usage;
  const unlimited = resolveIsUnlimitedPlan({
    isUnlimited: usage?.isUnlimited,
    dataAllowance: input.dataAllowance,
    dataPlan: input.dataPlan,
    initialDataGB: usage?.initialDataGB,
    remainingDataGB: usage?.remainingDataGB,
    reportsDataAllowance: usage?.reportsDataAllowance,
  });

  if (usage?.isExpired === true || /expir/i.test(usage?.statusLabel ?? "")) {
    return "eSIM Expired";
  }

  const lifecycle = input.lifecycle?.lifecycleStatus ?? null;
  if (lifecycle === "EXPIRED") return "eSIM Expired";

  // Unlimited must never show as Data Depleted (even if cache says DEPLETED / 0 GB).
  if (
    !unlimited &&
    ((usage &&
      usage.remainingDataGB != null &&
      usage.remainingDataGB <= 0) ||
      lifecycle === "DEPLETED")
  ) {
    return "Data Depleted";
  }

  const expiresAt =
    usage?.expiresAt ?? input.lifecycle?.expiresAtIso ?? null;
  const days =
    usage?.daysRemaining ??
    daysLeftFromExpiresAt(expiresAt, input.nowMs ?? Date.now());

  const looksActive =
    unlimited ||
    lifecycle === "ACTIVE" ||
    /active/i.test(usage?.statusLabel ?? "") ||
    // Cached DEPLETED on an unlimited catalog plan still means Active.
    (lifecycle === "DEPLETED" && unlimited);

  if (looksActive) {
    if (days != null && days >= 0) {
      return days === 1
        ? "Active (1 day left)"
        : `Active (${days} days left)`;
    }
    if (
      usage &&
      !unlimited &&
      usage.usedDataGB != null &&
      Number.isFinite(usage.usedDataGB)
    ) {
      const used = Number.isInteger(usage.usedDataGB)
        ? String(usage.usedDataGB)
        : usage.usedDataGB.toFixed(2);
      return `Active · Used: ${used}`;
    }
    return "Active";
  }

  if (lifecycle === "NOT_ACTIVE") return "Ready to install";

  const fallback = (input.orderStatusLabel ?? "").trim();
  if (fallback) return fallback;
  return usage?.statusLabel?.trim() || "Unknown";
}

export function lifecycleToUsageView(
  lifecycle: ProviderLifecycleCacheView | null | undefined,
  dataAllowance?: string | null,
  dataPlan?: string | null
): EsimOrderDetailUsageView | null {
  if (!lifecycle) return null;
  const hasMeter =
    lifecycle.remainingDataGb != null ||
    lifecycle.initialDataGb != null ||
    lifecycle.usedDataGb != null;
  if (
    !lifecycle.lifecycleStatus &&
    !lifecycle.expiresAtIso &&
    !lifecycle.activatedAtIso &&
    !hasMeter
  ) {
    return null;
  }

  const unlimited = resolveIsUnlimitedPlan({
    dataAllowance,
    dataPlan,
    initialDataGB: lifecycle.initialDataGb,
    remainingDataGB: lifecycle.remainingDataGb,
  });

  const used = unlimited
    ? null
    : lifecycle.usedDataGb ??
      (lifecycle.initialDataGb != null && lifecycle.remainingDataGb != null
        ? Math.max(lifecycle.initialDataGb - lifecycle.remainingDataGb, 0)
        : null);

  return {
    statusLabel: unlimited
      ? lifecycle.lifecycleStatus === "EXPIRED"
        ? "Expired"
        : "Active"
      : lifecycle.lifecycleLabel ?? "Unknown",
    initialDataGB: unlimited ? null : lifecycle.initialDataGb,
    remainingDataGB: unlimited ? null : lifecycle.remainingDataGb,
    usedDataGB: used,
    usagePercent: unlimited ? null : lifecycle.usagePercent,
    isUnlimited: unlimited,
    reportsDataAllowance: !unlimited && hasMeter,
    activatedAt: lifecycle.activatedAtIso,
    expiresAt: lifecycle.expiresAtIso,
    daysRemaining: daysLeftFromExpiresAt(lifecycle.expiresAtIso),
    isExpired: lifecycle.lifecycleStatus === "EXPIRED",
  };
}
