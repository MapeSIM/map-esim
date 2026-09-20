import {
  getMonitoringAlertsDashboard,
  requireActiveAdminForAlerts,
} from "@/app/lib/admin/monitoringAlerts";
import {
  ALERT_CATEGORIES,
  ALERT_SEVERITIES,
  categoryLabel,
  isSafeAdminHref,
  type AlertCategory,
  type AlertSeverity,
  type MonitoringAlert,
} from "@/app/lib/admin/monitoringAlertShared";
import {
  ADMIN_WALLET_RESERVATIONS_HREF,
  isWalletReservationAlertInventoryCode,
} from "@/app/lib/admin/walletReservationMonitorShared";
import {
  deriveDisplayStatus,
  formatNotificationStatusLabel,
  isAlertEligibleForNotification,
  type DerivedNotificationDisplayStatus,
  type SanitizedRecentDeliveryView,
} from "@/app/lib/admin/alertNotificationShared";
import {
  loadNotificationViewsForAlerts,
  loadRecentNotificationActivity,
} from "@/app/lib/admin/alertNotificationState";
import { canAccessAdminPath } from "@/app/lib/admin/adminPageAccess";
import { loadAdminAccess } from "@/app/lib/admin/adminPermissionAccess";
import { formatUtcTimestamp } from "@/app/lib/admin/operationsHealthShared";
import {
  AdminButton,
  AdminKpiCard,
  AdminStatusPill,
} from "@/app/components/admin/ui";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Alert monitoring is temporarily unavailable. Please refresh shortly.";

const EMPTY_CLASS =
  "rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]";

const CARD_CLASS =
  "min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5";

function buildHref(options: {
  severity?: AlertSeverity | "ALL";
  category?: AlertCategory | "ALL";
}): string {
  const params = new URLSearchParams();
  if (options.severity && options.severity !== "ALL") {
    params.set("severity", options.severity);
  }
  if (options.category && options.category !== "ALL") {
    params.set("category", options.category);
  }
  const q = params.toString();
  return q ? `/admin/alerts?${q}` : "/admin/alerts";
}

function AlertCard({
  alert,
  notificationStatus,
  lastAttemptLabel,
  lastSuccessLabel,
  canOpenWalletReservations,
}: {
  alert: MonitoringAlert;
  notificationStatus: DerivedNotificationDisplayStatus;
  lastAttemptLabel: string;
  lastSuccessLabel: string;
  canOpenWalletReservations: boolean;
}) {
  const href =
    alert.href && isSafeAdminHref(alert.href) ? alert.href : undefined;
  // Secondary inventory CTA only — primary alert.href deep links stay unchanged.
  const inventoryHref =
    canOpenWalletReservations &&
    isWalletReservationAlertInventoryCode(alert.code) &&
    isSafeAdminHref(ADMIN_WALLET_RESERVATIONS_HREF)
      ? ADMIN_WALLET_RESERVATIONS_HREF
      : undefined;
  return (
    <article className={CARD_CLASS} aria-labelledby={`alert-${alert.id}`}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <AdminStatusPill value={alert.severity}>
              {alert.severity}
            </AdminStatusPill>
            <AdminStatusPill value={categoryLabel(alert.category)}>
              {categoryLabel(alert.category)}
            </AdminStatusPill>
            <AdminStatusPill value={alert.state}>{alert.state}</AdminStatusPill>
            <AdminStatusPill value={formatNotificationStatusLabel(notificationStatus)}>
              {formatNotificationStatusLabel(notificationStatus)}
            </AdminStatusPill>
          </div>
          <h2
            id={`alert-${alert.id}`}
            className="text-base font-semibold tracking-tight text-[var(--heading)]"
          >
            {alert.title}
          </h2>
          <p className="text-sm text-[var(--text-muted)]">{alert.description}</p>
        </div>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Source time
          </dt>
          <dd className="mt-1 text-sm text-[var(--heading)]">
            {alert.sourceTimestampLabel}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Age
          </dt>
          <dd className="mt-1 text-sm text-[var(--heading)]">{alert.ageLabel}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Freshness
          </dt>
          <dd className="mt-1 text-sm text-[var(--heading)]">
            {alert.freshness.replaceAll("_", " ")}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Code
          </dt>
          <dd className="mt-1 break-all font-mono text-xs text-[var(--heading)]">
            {alert.code}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Last notify attempt
          </dt>
          <dd className="mt-1 text-sm text-[var(--heading)]">{lastAttemptLabel}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Last notify success
          </dt>
          <dd className="mt-1 text-sm text-[var(--heading)]">{lastSuccessLabel}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-[var(--heading)]">
        <span className="font-semibold">Recommended next step: </span>
        {alert.recommendedAction}
      </p>
      {href || inventoryHref ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {href ? (
            <AdminButton href={href} variant="primary" size="sm">
              Open related admin view
            </AdminButton>
          ) : null}
          {inventoryHref ? (
            <AdminButton href={inventoryHref} variant="secondary" size="sm">
              Wallet Holds inventory
            </AdminButton>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export default async function AdminAlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string; category?: string }>;
}) {
  const { admin } = await requireActiveAdminForAlerts();
  const access = await loadAdminAccess(admin.id);
  const canOpenWalletReservations = canAccessAdminPath(
    access?.permissions ?? [],
    ADMIN_WALLET_RESERVATIONS_HREF
  );
  const params = await searchParams;

  let data;
  let notifyViews: Awaited<ReturnType<typeof loadNotificationViewsForAlerts>> =
    new Map();
  let recentActivity: SanitizedRecentDeliveryView[] = [];
  try {
    data = await getMonitoringAlertsDashboard({
      severity: params.severity,
      category: params.category,
    });
    // Read-only notification status — never triggers sends on page render.
    const checkedAt = new Date();
    notifyViews = await loadNotificationViewsForAlerts({
      alertIds: data.alerts.map((a) => a.id),
      checkedAt,
    });
    recentActivity = await loadRecentNotificationActivity(20);
  } catch {
    return (
      <div className="min-w-0 space-y-6">
        <header className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">System Alerts</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
            Read-only internal monitoring for operational risk.
          </p>
        </header>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            {UNAVAILABLE}
          </p>
        </div>
      </div>
    );
  }

  const summary = data.summary;

  return (
    <div className="min-w-0 space-y-8">
      <header className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">System Alerts</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Read-only internal alert center. Alerts are derived from local database
          evidence and safe configuration checks. This page never refunds,
          retries, resends, cancels, finalizes, unlocks, resolves, or mutates
          customer or provider records.
        </p>
        <p className="mt-2 text-xs text-[var(--text-soft)]">
          Generated {data.generatedAtLabel} · Detection{" "}
          {summary.detectionStatus.replaceAll("_", " ")} ·{" "}
          {summary.freshness.replaceAll("_", " ")}
        </p>
        <p className="mt-3 flex flex-wrap gap-2">
          {canOpenWalletReservations ? (
            <AdminButton
              href={
                isSafeAdminHref(ADMIN_WALLET_RESERVATIONS_HREF)
                  ? ADMIN_WALLET_RESERVATIONS_HREF
                  : "/admin/operations"
              }
              variant="secondary"
              size="sm"
            >
              Wallet Holds
            </AdminButton>
          ) : null}
          <AdminButton href="/admin/operations" variant="ghost" size="sm">
            Operations Dashboard
          </AdminButton>
        </p>
      </header>

      {data.unavailable || summary.detectionStatus === "UNAVAILABLE" ? (
        <div
          className="rounded-2xl border border-red-600/30 bg-red-500/5 px-4 py-3 text-sm text-red-800 dark:text-red-200"
          role="status"
        >
          {UNAVAILABLE}
        </div>
      ) : summary.detectionStatus === "DEGRADED" ? (
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--heading)]"
          role="status"
        >
          Some monitoring sections are degraded. Available alerts are shown;
          do not treat missing sections as healthy.
        </div>
      ) : null}

      <section aria-labelledby="alert-summary-heading" className="min-w-0 space-y-3">
        <h2
          id="alert-summary-heading"
          className="text-base font-semibold tracking-tight text-[var(--heading)]"
        >
          Active alert summary
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <AdminKpiCard label="Active" value={summary.totalActive} />
          <AdminKpiCard label="Critical" value={summary.criticalCount} />
          <AdminKpiCard label="High" value={summary.highCount} />
          <AdminKpiCard label="Warning" value={summary.warningCount} />
          <AdminKpiCard label="Oldest age" value={summary.oldestActiveAgeLabel} />
        </div>
      </section>

      <nav className="flex min-w-0 flex-wrap gap-2" aria-label="Alert severity filters">
        {(["ALL", ...ALERT_SEVERITIES] as const).map((severity) => {
          const active = data.filterSeverity === severity;
          return (
            <AdminButton
              key={severity}
              href={buildHref({
                severity,
                category: data.filterCategory,
              })}
              variant={active ? "primary" : "secondary"}
              size="sm"
              className="!h-10 !px-4 !text-sm"
            >
              {severity}
            </AdminButton>
          );
        })}
      </nav>

      <nav className="flex min-w-0 flex-wrap gap-2" aria-label="Alert category filters">
        {(["ALL", ...ALERT_CATEGORIES] as const).map((category) => {
          const active = data.filterCategory === category;
          return (
            <AdminButton
              key={category}
              href={buildHref({
                severity: data.filterSeverity,
                category,
              })}
              variant={active ? "primary" : "secondary"}
              size="sm"
              className="!h-10 !px-4 !text-sm"
            >
              {category === "ALL" ? "ALL" : categoryLabel(category)}
            </AdminButton>
          );
        })}
      </nav>

      {data.alerts.length === 0 ? (
        <div className={EMPTY_CLASS} role="status">
          <p className="font-medium text-[var(--heading)]">
            {data.unavailable
              ? UNAVAILABLE
              : "No active alerts match the current filters."}
          </p>
          <p className="mt-2">
            Informational payment and security readiness alerts appear when
            detection is healthy. Use Operations Dashboard for configuration
            context.
          </p>
          <div className="mt-4">
            <AdminButton href="/admin/operations" variant="primary" size="sm">
              Open Operations Dashboard
            </AdminButton>
          </div>
        </div>
      ) : (
        <div className="min-w-0 space-y-3">
          {data.alerts.map((alert) => {
            const view = notifyViews.get(alert.id);
            const checkedAt = new Date();
            const notificationStatus = deriveDisplayStatus({
              eligible: isAlertEligibleForNotification(alert),
              latestDeliveryStatus: view?.latestDeliveryStatus ?? null,
              lastNotifiedAt: view?.lastNotifiedAt ?? null,
              checkedAt,
            });
            return (
              <AlertCard
                key={alert.id}
                alert={alert}
                notificationStatus={notificationStatus}
                lastAttemptLabel={
                  view?.lastAttemptAt
                    ? formatUtcTimestamp(view.lastAttemptAt)
                    : "—"
                }
                lastSuccessLabel={
                  view?.lastSuccessAt
                    ? formatUtcTimestamp(view.lastSuccessAt)
                    : "—"
                }
                canOpenWalletReservations={canOpenWalletReservations}
              />
            );
          })}
        </div>
      )}

      <section className={CARD_CLASS} aria-labelledby="recent-notification-activity-heading">
        <h2
          id="recent-notification-activity-heading"
          className="text-base font-semibold tracking-tight text-[var(--heading)]"
        >
          Recent notification activity
        </h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Read-only delivery history (initial / reminder / recovery). No resend
          or mute controls.
        </p>
        {recentActivity.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--text-muted)]" role="status">
            No notification delivery events yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {recentActivity.map((row, idx) => (
              <li
                key={`${row.alertCode}-${row.eventType}-${row.atLabel}-${idx}`}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[var(--heading)]">
                    {row.eventType}
                  </span>
                  <AdminStatusPill value={row.status}>{row.status}</AdminStatusPill>
                  <AdminStatusPill value={row.severity}>
                    {row.severity}
                  </AdminStatusPill>
                  <span className="font-mono text-xs text-[var(--text-muted)]">
                    {row.alertCode}
                  </span>
                </div>
                <span className="mt-1 block text-[11px] text-[var(--text-soft)]">
                  {row.atLabel}
                  {row.sourceType ? ` · ${row.sourceType}` : ""}
                  {row.sourceRecordRef ? ` · ${row.sourceRecordRef}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
