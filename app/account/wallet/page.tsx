import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Plus,
  RefreshCw,
  Wallet,
  XCircle,
} from "lucide-react";
import { requireRole } from "@/app/lib/auth/session";
import { getCustomerWalletTransactions } from "@/app/lib/wallet/read";
import { isPaymentGatewayConfigured } from "@/app/lib/payments/disabledAdapter";
import type { WalletStatusLabel } from "@/app/lib/wallet/display";
import WalletTopupForm from "@/app/components/account/WalletTopupForm";

export const dynamic = "force-dynamic";

const WALLET_UNAVAILABLE =
  "Wallet data is temporarily unavailable. Please refresh shortly.";

function buildWalletHref(page: number): string {
  if (page <= 1) return "/account/wallet";
  return `/account/wallet?page=${page}`;
}

function parseNotice(
  raw: string | string[] | undefined
): "credited" | "pending" | "failed" | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "credited" || value === "pending" || value === "failed") {
    return value;
  }
  return null;
}

function statusBadge(status: WalletStatusLabel): {
  label: string;
  className: string;
  icon: typeof CheckCircle2;
} {
  switch (status) {
    case "Completed":
      return {
        label: status,
        className:
          "border-[var(--accent-strong)]/35 bg-[var(--accent-strong)]/12 text-[var(--heading)]",
        icon: CheckCircle2,
      };
    case "Pending":
      return {
        label: status,
        className:
          "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-text)]",
        icon: Clock3,
      };
    case "Failed":
      return {
        label: status,
        className:
          "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
        icon: XCircle,
      };
    case "Reversed":
      return {
        label: status,
        className:
          "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-muted)]",
        icon: AlertTriangle,
      };
    default:
      return {
        label: status,
        className:
          "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]",
        icon: Clock3,
      };
  }
}

export default async function AccountWalletPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; notice?: string }>;
}) {
  const user = await requireRole("CUSTOMER");
  const params = await searchParams;
  const gatewayReady = isPaymentGatewayConfigured();
  const notice = parseNotice(params.notice);

  let data: Awaited<ReturnType<typeof getCustomerWalletTransactions>>;
  try {
    data = await getCustomerWalletTransactions(user.id, params.page);
  } catch {
    return (
      <div className="min-w-0 w-full max-w-full space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Wallet</h1>
        </header>
        <div
          className="min-w-0 w-full max-w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)] break-words">
            {WALLET_UNAVAILABLE}
          </p>
          <Link
            href="/account/wallet"
            className="mt-4 inline-flex h-10 items-center justify-center rounded-[14px] border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)]"
          >
            Refresh
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-w-0 w-full max-w-full space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Wallet</h1>
        </header>
        <div
          className="min-w-0 w-full max-w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)] break-words">
            {WALLET_UNAVAILABLE}
          </p>
          <Link
            href="/account/wallet"
            className="mt-4 inline-flex h-10 items-center justify-center rounded-[14px] border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)]"
          >
            Refresh
          </Link>
        </div>
      </div>
    );
  }

  const isZeroBalance = data.balanceCents <= 0;
  const refreshHref = buildWalletHref(data.page);

  return (
    <div className="min-w-0 w-full max-w-full space-y-6 sm:space-y-8">
      <header className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-soft)]">
            MAP eSIM
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--heading)] sm:text-3xl">
            Wallet
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--text-muted)] break-words">
            Your MAP eSIM wallet balance and history.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={refreshHref}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
            aria-label="Refresh wallet"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </Link>
          {data.hasWallet ? (
            <Link
              href="/account/esim/buy"
              className="inline-flex h-10 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
            >
              Buy eSIM
            </Link>
          ) : null}
        </div>
      </header>

      {notice === "credited" ? (
        <div
          className="flex gap-3 rounded-2xl border border-[var(--accent-strong)]/35 bg-[var(--accent-strong)]/12 px-4 py-3 text-sm text-[var(--heading)]"
          role="status"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Payment successful. Your wallet credit is available below after a
            verified confirmation.
          </p>
        </div>
      ) : null}
      {notice === "pending" ? (
        <div
          className="flex gap-3 rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3 text-sm text-[var(--warning-text)]"
          role="status"
        >
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Payment pending. Refresh this page shortly — returning from checkout
            does not credit your wallet by itself.
          </p>
        </div>
      ) : null}
      {notice === "failed" ? (
        <div
          className="flex gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300"
          role="status"
        >
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Payment failed or expired. No funds were added. You can start a new
            top-up below.
          </p>
        </div>
      ) : null}

      <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-5 sm:p-6">
          <div
            className="pointer-events-none absolute inset-0 opacity-80"
            style={{
              background:
                "radial-gradient(circle at top right, color-mix(in srgb, var(--accent-strong) 22%, transparent), transparent 55%)",
            }}
            aria-hidden="true"
          />
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
                  Available balance
                </p>
                <p className="mt-2 break-words text-4xl font-bold tracking-tight text-[var(--heading)] sm:text-5xl">
                  {data.balanceLabel}
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--text-muted)]">
                  USD
                </p>
              </div>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)] text-[var(--accent-ink)]">
                <Wallet className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>

            {isZeroBalance ? (
              <div className="mt-5 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)]/70 px-4 py-3 text-sm text-[var(--text-muted)]">
                {data.hasWallet
                  ? gatewayReady
                    ? "Your wallet is ready with a $0.00 balance. Add funds to buy an eSIM instantly."
                    : "Your wallet balance is $0.00. Online funding is not available yet — contact support if you need funds added."
                  : "A wallet will appear here once funding or a purchase path creates one for your account."}
              </div>
            ) : (
              <p className="mt-5 max-w-full text-sm leading-relaxed text-[var(--text-muted)] break-words [overflow-wrap:anywhere]">
                {gatewayReady
                  ? "Add funds securely. Your payment amount is confirmed at checkout, and only a verified payment can credit this wallet."
                  : "Online funding is not available yet. Use your existing balance to buy an eSIM, or contact support if you need funds added."}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {data.hasWallet && gatewayReady ? (
                <a
                  href="#add-funds"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add funds
                </a>
              ) : null}
              {data.hasWallet && !gatewayReady ? (
                <Link
                  href="/account/wallet/top-up"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--heading)]"
                >
                  Add funds
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        <div
          id="add-funds"
          className="min-w-0 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
        >
          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-tight text-[var(--heading)]">
              Add funds
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {gatewayReady
                ? "Choose a USD amount. JazzCash / Easypaisa checkout uses the existing secure payment flow."
                : "Self-serve top-up opens when the payment provider is ready."}
            </p>
          </div>

          {data.hasWallet && gatewayReady ? (
            <WalletTopupForm
              balanceLabel={data.balanceLabel}
              gatewayStatusLabel="Payment provider ready"
              embedded
            />
          ) : data.hasWallet ? (
            <div className="space-y-4" role="status">
              <p className="text-sm text-[var(--text-muted)]">
                Adding funds online is not available yet. You can still open the
                compatibility top-up page or buy with any existing balance.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/account/wallet/top-up"
                  className="inline-flex h-10 items-center justify-center rounded-[14px] border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)]"
                >
                  Open top-up page
                </Link>
                <Link
                  href="/account/esim/buy"
                  className="inline-flex h-10 items-center justify-center rounded-[14px] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)]"
                >
                  Buy eSIM
                </Link>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]" role="status">
              A wallet is required before you can add funds.
            </p>
          )}
        </div>
      </section>

      <section className="min-w-0 w-full max-w-full space-y-4">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Recent transactions
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Date, type, amount, status, and reference when available.
            </p>
          </div>
          {data.totalCount > 0 ? (
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)]">
              {data.totalCount} total
            </p>
          ) : null}
        </div>

        {data.rows.length === 0 ? (
          <div className="min-w-0 w-full max-w-full rounded-3xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 sm:p-8 text-sm text-[var(--text-muted)]">
            <p className="font-semibold text-[var(--heading)]">
              No wallet transactions yet.
            </p>
            <p className="mt-2">
              Top-ups, eSIM purchases, refunds, and adjustments will appear here
              once activity starts.
            </p>
            {data.hasWallet && gatewayReady ? (
              <a
                href="#add-funds"
                className="mt-4 inline-flex h-10 items-center justify-center rounded-[14px] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)]"
              >
                Add funds
              </a>
            ) : null}
          </div>
        ) : (
          <>
            <ul className="min-w-0 space-y-3">
              {data.rows.map((row) => {
                const badge = statusBadge(row.statusLabel);
                const BadgeIcon = badge.icon;
                const isCredit = row.directionLabel === "Credit";
                return (
                  <li
                    key={row.id}
                    className="min-w-0 w-full max-w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm"
                  >
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className={
                            isCredit
                              ? "mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-strong)]/15 text-[var(--accent-strong)]"
                              : "mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--heading)]"
                          }
                          aria-hidden="true"
                        >
                          {isCredit ? (
                            <ArrowDownLeft className="h-4 w-4" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="break-words font-semibold text-[var(--heading)]">
                            {row.typeLabel}
                          </p>
                          <p className="mt-1 break-words text-[var(--text-muted)]">
                            {row.createdAtLabel}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${badge.className}`}
                            >
                              <BadgeIcon
                                className="h-3 w-3"
                                aria-hidden="true"
                              />
                              {badge.label}
                            </span>
                            <span className="text-xs text-[var(--text-soft)]">
                              {row.directionLabel}
                            </span>
                          </div>
                          {row.referenceLabel ? (
                            <p className="mt-2 break-words text-xs text-[var(--text-soft)]">
                              Ref {row.referenceLabel}
                            </p>
                          ) : null}
                          {row.notificationLabel ? (
                            <p className="mt-1 break-words text-xs text-[var(--text-soft)]">
                              {row.notificationLabel}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <p className="shrink-0 text-base font-bold tabular-nums text-[var(--heading)]">
                        {row.amountLabel}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>

            {data.totalPages > 1 ? (
              <nav
                className="flex min-w-0 flex-wrap items-center justify-between gap-3 pt-2 text-sm"
                aria-label="Wallet transaction pages"
              >
                <p className="text-[var(--text-muted)]">
                  Page {data.page} of {data.totalPages}
                </p>
                <div className="flex gap-3">
                  {data.page > 1 ? (
                    <Link
                      href={buildWalletHref(data.page - 1)}
                      className="font-semibold text-[var(--heading)] underline-offset-2 hover:underline"
                    >
                      Previous
                    </Link>
                  ) : (
                    <span className="text-[var(--text-soft)]">Previous</span>
                  )}
                  {data.page < data.totalPages ? (
                    <Link
                      href={buildWalletHref(data.page + 1)}
                      className="font-semibold text-[var(--heading)] underline-offset-2 hover:underline"
                    >
                      Next
                    </Link>
                  ) : (
                    <span className="text-[var(--text-soft)]">Next</span>
                  )}
                </div>
              </nav>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
