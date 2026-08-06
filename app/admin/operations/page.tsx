import Link from "next/link";
import type { ReactNode } from "react";
import {
  getOperationsHealthDashboard,
  requireActiveAdminForOperations,
  type OperationsHealthDashboard,
} from "@/app/lib/admin/operationsHealth";
import type { HealthStatus, OpsWarning } from "@/app/lib/admin/operationsHealthShared";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
  "Operations health data is temporarily unavailable. Please refresh shortly.";

function statusTone(status: string): string {
  switch (status) {
    case "HEALTHY":
    case "yes":
    case "expected":
    case "ENABLED":
      return "bg-[var(--accent-strong)]/12 text-[var(--accent-strong)]";
    case "DEGRADED":
    case "NOT_CONFIGURED":
    case "DISABLED":
    case "no":
    case "not_expected":
      return "bg-[var(--surface)] text-[var(--heading)] border border-[var(--border)]";
    case "UNAVAILABLE":
    case "CRITICAL":
      return "bg-red-500/10 text-red-700 dark:text-red-300";
    case "NOT_IMPLEMENTED":
    case "NOT_AVAILABLE":
    case "NOT_VERIFIED":
    case "UNKNOWN":
    case "unknown":
    default:
      return "bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)]";
  }
}

function StatusPill({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] ${statusTone(value)}`}
    >
      {value}
    </span>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
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

function HealthCard({
  title,
  children,
  checkedAtLabel,
  freshness,
  status,
}: {
  title: string;
  children: ReactNode;
  checkedAtLabel: string;
  freshness: string;
  status?: HealthStatus | string;
}) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight text-[var(--heading)]">
          {title}
        </h2>
        {status ? <StatusPill value={status} /> : null}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{children}</div>
      <p className="mt-4 text-[11px] text-[var(--text-soft)]">
        Checked {checkedAtLabel} · {freshness.replaceAll("_", " ")}
      </p>
    </section>
  );
}

function WarningList({ warnings }: { warnings: OpsWarning[] }) {
  if (warnings.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        No operational warnings at this time.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {warnings.map((w) => (
        <li
          key={w.code}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill value={w.severity.toUpperCase()} />
            {w.href ? (
              <Link
                href={w.href}
                className="text-sm font-medium text-[var(--accent-strong)] underline-offset-2 hover:underline"
              >
                {w.message}
              </Link>
            ) : (
              <span className="text-sm font-medium text-[var(--heading)]">
                {w.message}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function DashboardBody({ data }: { data: OperationsHealthDashboard }) {
  const app = data.applicationDatabase;
  const recon = data.reconciliation;
  const email = data.email;
  const provider = data.provider;
  const payment = data.payment;
  const security = data.security;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Operations</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Read-only system health and operational risk. This page never sends
          email, places provider orders, or changes wallets, orders, or cases.
        </p>
        <p className="mt-2 text-xs text-[var(--text-soft)]">
          Generated {data.generatedAtLabel}
        </p>
      </header>

      <section
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4"
        aria-labelledby="ops-warnings-heading"
      >
        <h2
          id="ops-warnings-heading"
          className="text-base font-semibold tracking-tight text-[var(--heading)]"
        >
          Operational warnings
        </h2>
        <div className="mt-3">
          <WarningList warnings={data.warnings} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <HealthCard
          title="Application & database"
          status={app.databaseStatus}
          checkedAtLabel={app.checkedAtLabel}
          freshness={app.freshness}
        >
          <Metric label="Application" value={app.applicationStatus} />
          <Metric label="Database" value={app.databaseStatus} />
          <Metric
            label="DB latency"
            value={
              app.databaseLatencyMs == null ? "—" : `${app.databaseLatencyMs} ms`
            }
          />
          <Metric label="Environment" value={app.environmentLabel} />
          <Metric
            label="Deployment version"
            value={app.deploymentVersion ?? "Unavailable"}
          />
        </HealthCard>

        <HealthCard
          title="Reconciliation operations"
          checkedAtLabel={recon.checkedAtLabel}
          freshness={recon.freshness}
          status={
            recon.criticalPriorityCount > 0
              ? "DEGRADED"
              : recon.actionableCount > 0
                ? "DEGRADED"
                : "HEALTHY"
          }
        >
          <Metric label="Actionable" value={recon.actionableCount} />
          <Metric label="Open (unlocked)" value={recon.openCount} />
          <Metric label="Locked" value={recon.lockedCount} />
          <Metric label="Resolved (sample)" value={recon.resolvedCount} />
          <Metric label="HIGH priority" value={recon.highPriorityCount} />
          <Metric label="CRITICAL priority" value={recon.criticalPriorityCount} />
          <Metric
            label="Provider uncertain"
            value={recon.providerUncertainCount}
          />
          <Metric
            label="Finalization failed"
            value={recon.finalizationFailedCount}
          />
          <Metric label="Refund pending" value={recon.refundPendingCount} />
          <Metric label="Failed emails" value={recon.failedEmailCount} />
          <Metric label="ICCID pending/conflict" value={recon.iccidPendingCount} />
          <Metric
            label="Oldest unresolved age"
            value={recon.oldestUnresolvedAgeLabel}
          />
          <Metric
            label="Refresh/recovery in progress"
            value={recon.refreshOrRecoveryInProgressCount}
          />
          {recon.truncated ? (
            <p className="sm:col-span-2 text-xs text-[var(--text-muted)]">
              Counts may be truncated for large workloads. Open Reconciliation
              for the full filtered list.
            </p>
          ) : null}
          <p className="sm:col-span-2 text-xs">
            <Link
              href="/admin/reconciliation"
              className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
            >
              Open reconciliation center
            </Link>
          </p>
        </HealthCard>

        <HealthCard
          title="Email & notifications"
          status={email.billingSmtpStatus}
          checkedAtLabel={email.checkedAtLabel}
          freshness={email.freshness}
        >
          <Metric label="Billing SMTP" value={email.billingSmtpStatus} />
          <Metric
            label="Order email failures"
            value={email.orderEmailFailureCount}
          />
          <Metric
            label="Wallet notification failures"
            value={email.walletNotificationFailureCount}
          />
          <Metric
            label="Not-configured emails"
            value={email.notConfiguredEmailCount}
          />
          <Metric
            label="Oldest unresolved email age"
            value={email.oldestUnresolvedEmailAgeLabel}
          />
          <Metric label="Latest success" value={email.latestSuccessLabel} />
          <Metric label="Latest failure" value={email.latestFailureLabel} />
        </HealthCard>

        <HealthCard
          title="VeSIM / provider readiness"
          status={provider.environmentStatus}
          checkedAtLabel={provider.checkedAtLabel}
          freshness={provider.freshness}
        >
          <Metric label="Environment status" value={provider.environmentStatus} />
          <Metric label="Mode" value={provider.modeLabel} />
          <Metric
            label="Configuration"
            value={provider.configurationValid ? "valid" : "invalid"}
          />
          <Metric label="Broker host class" value={provider.brokerHostClass} />
          <Metric
            label="Latest success observation"
            value={provider.latestSuccessfulObservationLabel}
          />
          <Metric
            label="Latest failure/uncertainty"
            value={provider.latestFailureOrUncertaintyLabel}
          />
          <Metric
            label="Provider-uncertain cases"
            value={provider.providerUncertainCount}
          />
          <Metric
            label="Refresh in progress"
            value={provider.refreshInProgressCount}
          />
          <Metric label="Provider balance" value={provider.balanceSupport} />
        </HealthCard>

        <HealthCard
          title="Payment gateway readiness"
          status={payment.integrationStatus}
          checkedAtLabel={payment.checkedAtLabel}
          freshness={payment.freshness}
        >
          <Metric label="Integration" value={payment.integrationStatus} />
          <Metric
            label="Production credentials"
            value={payment.productionCredentials}
          />
          <Metric
            label="Webhook verification"
            value={payment.webhookVerification}
          />
          <Metric
            label="Payment reconciliation"
            value={payment.paymentReconciliation}
          />
          <Metric label="Guest checkout" value={payment.guestCheckout} />
        </HealthCard>

        <HealthCard
          title="Security & production readiness"
          checkedAtLabel={security.checkedAtLabel}
          freshness={security.freshness}
        >
          <Metric label="AUTH_SECRET" value={security.authSecretConfigured} />
          <Metric
            label="ICCID encryption key"
            value={security.iccidEncryptionConfigured}
          />
          <Metric label="AUTH_URL secure" value={security.authUrlSecure} />
          <Metric label="HSTS expectation" value={security.hstsExpectation} />
          <Metric label="CSP mode" value={security.cspMode} />
          <Metric label="Billing SMTP" value={security.billingSmtpConfigured} />
          <Metric label="Google OAuth" value={security.googleOAuthConfigured} />
          <Metric
            label="VeSIM configuration"
            value={security.vesimConfigurationValid}
          />
          <Metric
            label="Guest checkout enabled"
            value={security.guestCheckoutEnabled}
          />
          <Metric label="Environment" value={security.environmentLabel} />
          <Metric
            label="Deployment version"
            value={security.deploymentVersion ?? "Unavailable"}
          />
          <Metric
            label="Latest migration"
            value={security.latestMigrationName ?? "Unavailable"}
          />
          <Metric
            label="Migration finished"
            value={security.latestMigrationFinishedLabel}
          />
        </HealthCard>
      </div>
    </div>
  );
}

export default async function AdminOperationsPage() {
  await requireActiveAdminForOperations();

  let data: OperationsHealthDashboard;
  try {
    data = await getOperationsHealthDashboard();
  } catch {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Operations</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
            Read-only system health and operational risk.
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

  return <DashboardBody data={data} />;
}
