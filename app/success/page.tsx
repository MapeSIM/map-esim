"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Mail } from "lucide-react";
import { useCurrency } from "@/app/components/currency/CurrencyProvider";
import OrderInstallActions from "@/app/components/install/OrderInstallActions";

type EmailDeliveryStatus =
  | "sent"
  | "not_configured"
  | "skipped_no_install_details"
  | "invalid_email"
  | "already_sent"
  | "failed"
  | string;

type InstallActions = {
  hasInstallDetails?: boolean;
  hasVerifiedLpa?: boolean;
  hasOfficialIphoneActivationUrl?: boolean;
  hasOfficialAndroidActivationUrl?: boolean;
  iphoneInstallHref?: string;
  iphoneGuideHref?: string;
  qrDownloadHref?: string;
  qrViewHref?: string;
  androidGuideHref?: string;
  androidActivationUrl?: string;
};

type OrderDetails = {
  orderId?: string;
  offerId?: string;
  offerName?: string;
  name?: string;
  countryName?: string;
  dataFormatted?: string;
  data?: string | number;
  durationDays?: number;
  priceUSD?: number;
  status?: string;
  iccid?: string;
  smdpAddress?: string;
  activationCode?: string;
  qrValue?: string;
  hasInstallDetails?: boolean;
  hasVerifiedLpa?: boolean;
  installActions?: InstallActions;
  manualInstallText?: string;
  emailDelivery?: EmailDeliveryStatus;
  customerEmail?: string;
};

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function emailStatusMessage(
  status: EmailDeliveryStatus | undefined,
  customerEmail: string | undefined
): { title: string; body: string; tone: "ok" | "warn" | "muted" } {
  switch (status) {
    case "sent":
      return {
        title: "Email delivery: sent",
        body: customerEmail
          ? `Installation details sent to ${customerEmail}`
          : "Installation details were emailed to the customer.",
        tone: "ok",
      };
    case "already_sent":
      return {
        title: "Email delivery: already sent",
        body: customerEmail
          ? `Installation details were previously sent to ${customerEmail}`
          : "Installation details were previously emailed for this order.",
        tone: "ok",
      };
    case "not_configured":
      return {
        title: "Email delivery: not configured",
        body: "Your order succeeded. Email delivery is not configured on the server yet, so installation details were not emailed. Use the installation actions below if details are available, or contact support.",
        tone: "warn",
      };
    case "skipped_no_install_details":
      return {
        title: "Email delivery: pending details",
        body: "Your order succeeded, but installation details were not available yet to email. Please check again shortly or contact support.",
        tone: "warn",
      };
    case "invalid_email":
      return {
        title: "Email delivery: invalid address",
        body: "Your order succeeded, but the customer email could not be used for delivery. Contact support with your Order ID.",
        tone: "warn",
      };
    case "failed":
      return {
        title: "Email delivery: failed",
        body: "Your order succeeded, but the installation email could not be sent. Use the installation actions below if details are available, or contact support.",
        tone: "warn",
      };
    default:
      return {
        title: "Email delivery: status unavailable",
        body: "Your order succeeded. If you do not receive an email, use the installation details on this page or contact support.",
        tone: "muted",
      };
  }
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId")?.trim() || "";
  const accessToken = searchParams.get("access")?.trim() || "";
  const queryEmailDelivery =
    searchParams.get("emailDelivery")?.trim() || undefined;
  const queryCustomerEmail =
    searchParams.get("customerEmail")?.trim() || undefined;
  const { formatPrice } = useCurrency();

  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadOrder() {
      if (!accessToken) {
        setError(
          "Secure order access is missing. Open the link from your checkout confirmation or order email."
        );
        setOrder({
          orderId: orderId || undefined,
          emailDelivery: queryEmailDelivery,
          customerEmail: queryCustomerEmail,
        });
        setLoading(false);
        return;
      }

      try {
        const params = new URLSearchParams({ access: accessToken });
        if (orderId) params.set("orderId", orderId);
        const response = await fetch(
          `/api/vesim/order-details?${params.toString()}`,
          { cache: "no-store" }
        );
        const data = await response.json();

        if (!response.ok || data.success === false) {
          throw new Error(data.error || data.message || "Failed to load order");
        }

        const payload =
          (data.order as Record<string, unknown> | undefined) ||
          (data.data as Record<string, unknown> | undefined) ||
          (data as Record<string, unknown>);

        const actions =
          payload.installActions &&
          typeof payload.installActions === "object" &&
          !Array.isArray(payload.installActions)
            ? (payload.installActions as InstallActions)
            : undefined;

        setOrder({
          orderId:
            (typeof payload.orderId === "string" && payload.orderId) ||
            orderId,
          offerId:
            typeof payload.offerId === "string" ? payload.offerId : undefined,
          offerName:
            typeof payload.offerName === "string"
              ? payload.offerName
              : undefined,
          name:
            typeof payload.offerName === "string"
              ? payload.offerName
              : undefined,
          countryName:
            typeof payload.countryName === "string"
              ? payload.countryName
              : undefined,
          dataFormatted:
            typeof payload.dataFormatted === "string"
              ? payload.dataFormatted
              : undefined,
          durationDays: firstNumber(payload.durationDays) ?? undefined,
          priceUSD: firstNumber(payload.priceUSD) ?? undefined,
          status:
            typeof payload.status === "string" ? payload.status : undefined,
          iccid: typeof payload.iccid === "string" ? payload.iccid : undefined,
          smdpAddress:
            typeof payload.smdpAddress === "string"
              ? payload.smdpAddress
              : undefined,
          activationCode:
            typeof payload.activationCode === "string"
              ? payload.activationCode
              : undefined,
          qrValue:
            typeof payload.qrValue === "string" ? payload.qrValue : undefined,
          hasInstallDetails: Boolean(payload.hasInstallDetails),
          hasVerifiedLpa: Boolean(payload.hasVerifiedLpa),
          installActions: actions,
          manualInstallText:
            typeof payload.manualInstallText === "string"
              ? payload.manualInstallText
              : undefined,
          emailDelivery:
            (typeof payload.emailDelivery === "string" &&
              payload.emailDelivery) ||
            queryEmailDelivery,
          customerEmail:
            (typeof payload.customerEmail === "string" &&
              payload.customerEmail) ||
            queryCustomerEmail,
        });
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to load order details"
        );
        setOrder({
          orderId,
          emailDelivery: queryEmailDelivery,
          customerEmail: queryCustomerEmail,
        });
      } finally {
        setLoading(false);
      }
    }

    loadOrder();
  }, [accessToken, orderId, queryCustomerEmail, queryEmailDelivery]);

  const emailInfo = useMemo(
    () =>
      emailStatusMessage(
        order?.emailDelivery || queryEmailDelivery,
        order?.customerEmail || queryCustomerEmail
      ),
    [order?.customerEmail, order?.emailDelivery, queryCustomerEmail, queryEmailDelivery]
  );

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] text-[var(--heading)]">
        <p className="text-xl">Loading order...</p>
      </main>
    );
  }

  const toneClass =
    emailInfo.tone === "ok"
      ? "border-[var(--accent-strong)]/35 bg-[var(--accent-strong)]/10"
      : emailInfo.tone === "warn"
        ? "border-amber-400/30 bg-amber-400/10"
        : "border-[var(--border)] bg-[var(--surface-2)]";

  const actions = order?.installActions;

  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-4 py-16 text-[var(--heading)] sm:px-6">
      <div className="mx-auto max-w-xl rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[var(--accent-strong)]/40 bg-[var(--accent-strong)]/10">
          <CheckCircle2 className="h-8 w-8 text-[var(--accent-strong)]" />
        </div>

        <h1 className="mt-5 text-center text-3xl font-bold">
          Order successful
        </h1>
        <p className="mt-3 text-center text-sm text-[var(--text-muted)]">
          Your eSIM order has been created successfully.
        </p>

        <div className={`mt-6 flex items-start gap-3 rounded-2xl border p-4 text-sm ${toneClass}`}>
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-strong)]" />
          <div>
            <p className="font-semibold text-[var(--heading)]">{emailInfo.title}</p>
            <p className="mt-1 text-[var(--text)]">{emailInfo.body}</p>
          </div>
        </div>

        <div className="mt-6 space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5 text-sm">
          <p>
            Order ID:{" "}
            <b className="text-[var(--accent-strong)]">
              {order?.orderId || orderId || "—"}
            </b>
          </p>
          {(order?.offerName || order?.name) && (
            <p>
              Plan: <b>{order.offerName || order.name}</b>
            </p>
          )}
          {order?.countryName && (
            <p>
              Destination: <b>{order.countryName}</b>
            </p>
          )}
          {(order?.dataFormatted || order?.data) && (
            <p>
              Data: <b>{order.dataFormatted || order.data}</b>
            </p>
          )}
          {order?.durationDays != null && (
            <p>
              Validity: <b>{order.durationDays} Days</b>
            </p>
          )}
          {order?.priceUSD != null && (
            <p className="text-2xl font-bold text-[var(--accent-strong)]">
              {formatPrice(order.priceUSD)}
            </p>
          )}
          {order?.status && (
            <p>
              Status: <b>{order.status}</b>
            </p>
          )}
          {error && <p className="text-amber-200">{error}</p>}
        </div>

        <OrderInstallActions
          hasInstallDetails={order?.hasInstallDetails}
          hasVerifiedLpa={order?.hasVerifiedLpa || actions?.hasVerifiedLpa}
          hasOfficialIphoneActivationUrl={
            actions?.hasOfficialIphoneActivationUrl
          }
          iphoneInstallHref={actions?.iphoneInstallHref}
          iphoneGuideHref={actions?.iphoneGuideHref || "/install/iphone"}
          qrDownloadHref={actions?.qrDownloadHref}
          qrViewHref={actions?.qrViewHref}
          androidGuideHref={actions?.androidGuideHref || "/install/android"}
          androidActivationUrl={actions?.androidActivationUrl}
          manualInstallText={order?.manualInstallText}
          smdpAddress={order?.smdpAddress}
          activationCode={order?.activationCode}
          qrValue={order?.qrValue}
          iccid={order?.iccid}
        />

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link
            href="/dashboard"
            className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--accent-strong)]/40"
          >
            View dashboard
          </Link>
          <Link
            href="/countries"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent-strong)] text-sm font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)]"
          >
            Browse more plans
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] text-[var(--heading)]">
          Loading...
        </main>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
