import Link from "next/link";
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

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Alert monitoring is temporarily unavailable. Please refresh shortly.";

function severityTone(severity: string): string {
  switch (severity) {
    case "CRITICAL":
      return "bg-red-500/10 text-red-700 dark:text-red-300";
    case "HIGH":
      return "bg-amber-500/10 text-amber-800 dark:text-amber-200";
    case "WARNING":
      return "bg-[var(--surface)] text-[var(--heading)] border border-[var(--border)]";
    case "INFO":
    default:
      return "bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)]";
  }
}

function StatusPill({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] ${severityTone(value)}`}
    >
      {value}
    </span>
  );
}

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

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold text-[var(--heading)]">
        {value}
      </p>
    </div>
  );
}

function AlertCard({ alert }: { alert: MonitoringAlert }) {
  const href =
    alert.href && isSafeAdminHref(alert.href) ? alert.href : undefined;
  return (
    <article
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5"
      aria-labelledby={`alert-${alert.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill value={alert.severity} />
            <StatusPill value={categoryLabel(alert.category)} />
            <StatusPill value={alert.state} />
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
      </dl>
      <p className="mt-4 text-sm text-[var(--heading)]">
        <span className="font-semibold">Recommended next step: </span>
        {alert.recommendedAction}
      </p>
      {href ? (
        <p className="mt-3">
          <Link
            href={href}
            className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
          >
            Open related admin view
          </Link>
        </p>
      ) : null}
    </article>
  );
}

export default async function AdminAlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string; category?: string }>;
}) {
  await requireActiveAdminForAlerts();
  const params = await searchParams;

  let data;
  try {
    data = await getMonitoringAlertsDashboard({
      severity: params.severity,
      category: params.category,
    });
  } catch {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
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
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
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

      <section
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5"
        aria-labelledby="alert-summary-heading"
      >
        <h2
          id="alert-summary-heading"
          className="text-base font-semibold tracking-tight text-[var(--heading)]"
        >
          Active alert summary
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Active" value={summary.totalActive} />
          <Metric label="Critical" value={summary.criticalCount} />
          <Metric label="High" value={summary.highCount} />
          <Metric label="Warning" value={summary.warningCount} />
          <Metric label="Oldest age" value={summary.oldestActiveAgeLabel} />
        </div>
      </section>

      <nav className="flex flex-wrap gap-2" aria-label="Alert severity filters">
        {(["ALL", ...ALERT_SEVERITIES] as const).map((severity) => {
          const active = data.filterSeverity === severity;
          return (
            <Link
              key={severity}
              href={buildHref({
                severity,
                category: data.filterCategory,
              })}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "rounded-lg bg-[var(--accent-strong)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--accent-strong)]"
                  : "rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-2)]"
              }
            >
              {severity}
            </Link>
          );
        })}
      </nav>

      <nav className="flex flex-wrap gap-2" aria-label="Alert category filters">
        {(["ALL", ...ALERT_CATEGORIES] as const).map((category) => {
          const active = data.filterCategory === category;
          return (
            <Link
              key={category}
              href={buildHref({
                severity: data.filterSeverity,
                category,
              })}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "rounded-lg bg-[var(--accent-strong)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--accent-strong)]"
                  : "rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-2)]"
              }
            >
              {category === "ALL" ? "ALL" : categoryLabel(category)}
            </Link>
          );
        })}
      </nav>

      {data.alerts.length === 0 ? (
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            {data.unavailable
              ? UNAVAILABLE
              : "No active alerts match the current filters."}
          </p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Informational payment and security readiness alerts appear when
            detection is healthy. Use Operations for configuration context.
          </p>
          <p className="mt-3">
            <Link
              href="/admin/operations"
              className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
            >
              Open Operations
            </Link>
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </div>
  );
}
