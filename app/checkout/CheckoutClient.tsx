"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCurrency } from "@/app/components/currency/CurrencyProvider";
import { CheckoutTrustPanel } from "@/app/components/account/CheckoutTrustPanel";
import { CheckoutCompatibilityCheck } from "@/app/components/account/CheckoutCompatibilityModal";

type VerifiedOffer = {
  offerId: string;
  name: string;
  countryCode: string | null;
  countryName: string | null;
  dataFormatted: string;
  durationDays: number | null;
  priceUSD: number;
  currency: string;
};

type CheckoutResponse = {
  success?: boolean;
  orderId?: string;
  accessToken?: string;
  paymentUrl?: string;
  error?: string;
  message?: string;
  replayed?: boolean;
  emailDelivery?: string;
  customerEmail?: string;
};

type ManualSettings = {
  enabled: boolean;
  accountTitle: string;
  jazzcash: string;
  easypaisa: string;
  bankName: string;
  bankAccountTitle: string;
  bankAccountNumber: string;
};

function CheckoutUnavailable() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--page-bg)] px-4 text-[var(--heading)] sm:px-6">
      <h1 className="text-center text-2xl font-bold sm:text-4xl">
        Checkout unavailable
      </h1>
      <p className="mt-3 max-w-md text-center text-sm text-[var(--text-muted)] sm:text-base">
        Online checkout is temporarily unavailable. Please contact support for
        assistance.
      </p>
      <Link
        href="/contact"
        className="mt-8 inline-flex min-h-12 w-full max-w-sm items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-6 text-sm font-bold text-[var(--accent-ink)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 sm:w-auto"
      >
        Contact support
      </Link>
    </main>
  );
}

function CheckoutContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { formatPrice } = useCurrency();

  const offerId =
    searchParams.get("offerId")?.trim() ||
    searchParams.get("offer")?.trim() ||
    "";
  const countryHint = searchParams.get("country")?.trim() || "";

  const [offer, setOffer] = useState<VerifiedOffer | null>(null);
  const [customerEmail, setCustomerEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [payLoading, setPayLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [message, setMessage] = useState("");

  // Manual Payment States
  const [paymentMethod, setPaymentMethod] = useState<"safepay" | "manual">("safepay");
  const [manualSettings, setManualSettings] = useState<ManualSettings | null>(null);
  const [senderName, setSenderName] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);

  const idempotencyKeyRef = useRef<string>("");
  const submitLockRef = useRef(false);

  useEffect(() => {
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setMessage("");
      setUnavailable(false);
      setOffer(null);

      if (!offerId) {
        if (!cancelled) {
          setUnavailable(true);
          setMessage("Offer ID is missing");
          setLoading(false);
        }
        return;
      }

      try {
        const params = new URLSearchParams({ offerId });
        if (countryHint) {
          params.set("country", countryHint);
        }

        const [offerRes, manualRes] = await Promise.all([
          fetch(`/api/vesim/offer?${params.toString()}`, { cache: "no-store" }),
          fetch(`/api/admin/manual-payment-settings`, { cache: "no-store" }).catch(() => null),
        ]);

        const offerData = await offerRes.json();
        const manualData = manualRes ? await manualRes.json().catch(() => null) : null;

        if (!offerRes.ok || !offerData?.success || !offerData?.offer) {
          if (!cancelled) {
            setUnavailable(true);
            setMessage(offerData?.error || "Plan unavailable");
          }
          return;
        }

        if (!cancelled) {
          setOffer(offerData.offer as VerifiedOffer);
          if (manualData?.success && manualData?.settings) {
            const s = manualData.settings;
            const isManualOn = s.MANUAL_PAYMENTS_ENABLED === "true";
            setManualSettings({
              enabled: isManualOn,
              accountTitle: s.MANUAL_ACCOUNT_TITLE || "",
              jazzcash: s.JAZZCASH_NUMBER || "",
              easypaisa: s.EASYPAISA_NUMBER || "",
              bankName: s.BANK_NAME || "",
              bankAccountTitle: s.BANK_ACCOUNT_TITLE || "",
              bankAccountNumber: s.BANK_ACCOUNT_NUMBER || "",
            });
            // Agar manual payment on hai aur safepay ka option bypass karna ho ya default set karna ho
            if (isManualOn) {
              setPaymentMethod("manual");
            }
          }
        }
      } catch {
        if (!cancelled) {
          setUnavailable(true);
          setMessage("Unable to verify this plan");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [offerId, countryHint]);

  async function pay() {
    if (!offer || payLoading || submitLockRef.current) {
      return;
    }

    const cleanEmail = customerEmail.trim();

    if (!cleanEmail) {
      setMessage("Please enter your email address");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setMessage("Please enter a valid email address");
      return;
    }

    if (paymentMethod === "manual") {
      if (!senderName.trim()) {
        setMessage("Please enter the account/sender name used for payment");
        return;
      }
      if (!proofFile) {
        setMessage("Please upload your payment screenshot or slip");
        return;
      }
    }

    setMessage("");
    setPayLoading(true);
    submitLockRef.current = true;

    try {
      if (paymentMethod === "manual") {
        // 1. Pehle screenshot upload karein
        const formData = new FormData();
        formData.append("file", proofFile);

        const uploadRes = await fetch("/api/upload-payment-proof", {
          method: "POST",
          body: formData,
        });
        const uploadData = await uploadRes.json();

        if (!uploadRes.ok || !uploadData.success) {
          throw new Error(uploadData.error || "Failed to upload payment screenshot");
        }

        const proofUrl = uploadData.fileUrl;

        // 2. Manual payment order submit API call (Aap isko apne order API se link karenge)
        // Filhal hum success message ya thank you page par redirect kar rahe hain
        alert("Manual payment submitted successfully! We will verify your payment and email your eSIM shortly.");
        router.push("/account");
        return;
      }

      // Safepay Flow
      const response = await fetch("/api/payments/safepay/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          offerId: offer.offerId,
          customerEmail: cleanEmail,
          country: offer.countryCode || countryHint || undefined,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });

      const data: CheckoutResponse = await response.json();

      if (response.ok && data.success && data.paymentUrl) {
        window.location.href = data.paymentUrl;
        return;
      }

      if (response.status === 503) {
        setMessage(
          data.error ||
            "Online checkout is temporarily unavailable. Please contact support for assistance."
        );
        return;
      }

      setMessage(data.error || data.message || "Payment initialization failed");
      idempotencyKeyRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    } catch (err: any) {
      setMessage(err.message || "Unable to process the order");
      idempotencyKeyRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    } finally {
      setPayLoading(false);
      submitLockRef.current = false;
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] text-[var(--heading)]">
        <p className="text-xl">Loading checkout...</p>
      </main>
    );
  }

  if (unavailable || !offer) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--page-bg)] px-4 text-[var(--heading)] sm:px-6">
        <h1 className="text-center text-2xl font-bold sm:text-4xl">
          Plan unavailable
        </h1>
        <p className="mt-3 max-w-md text-center text-sm text-[var(--text-muted)] sm:text-base">
          {message && message !== "Plan unavailable"
            ? message
            : "This eSIM plan could not be verified. Please choose another plan."}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--page-bg)] px-4 py-10 text-[var(--heading)] sm:px-6 sm:py-16">
      <div className="mx-auto w-full max-w-5xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
          MAP eSIM checkout
        </p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-4xl">
          Checkout
        </h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--text-muted)] sm:text-base">
          Review your eSIM plan and complete payment
        </p>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
          <div className="space-y-5">
            <section
              className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
              aria-labelledby="guest-plan-heading"
            >
              <h2
                id="guest-plan-heading"
                className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
              >
                Plan details
              </h2>
              <h3 className="mt-3 break-words text-xl font-bold sm:text-2xl">
                {offer.countryName || offer.name || "eSIM"}
              </h3>
              <dl className="mt-4 space-y-3 text-sm sm:text-base">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                    Plan
                  </dt>
                  <dd className="mt-1 font-semibold">{offer.name}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                    Data
                  </dt>
                  <dd className="mt-1 font-semibold">{offer.dataFormatted}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                    Validity
                  </dt>
                  <dd className="mt-1 font-semibold">
                    {offer.durationDays != null
                      ? `${offer.durationDays} Days`
                      : "—"}
                  </dd>
                </div>
              </dl>
            </section>

            {/* Payment Method Selection */}
            {manualSettings?.enabled && (
              <section className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
                <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)] mb-3">
                  Select Payment Method
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("safepay")}
                    className={`p-3 rounded-xl border text-sm font-semibold transition ${
                      paymentMethod === "safepay"
                        ? "border-[var(--accent-strong)] bg-[var(--accent-strong)]/10 text-[var(--heading)]"
                        : "border-[var(--border)] text-[var(--text-muted)]"
                    }`}
                  >
                    Online Payment (Safepay)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("manual")}
                    className={`p-3 rounded-xl border text-sm font-semibold transition ${
                      paymentMethod === "manual"
                        ? "border-[var(--accent-strong)] bg-[var(--accent-strong)]/10 text-[var(--heading)]"
                        : "border-[var(--border)] text-[var(--text-muted)]"
                    }`}
                  >
                    Manual (JazzCash / Bank)
                  </button>
                </div>
              </section>
            )}

            {/* Manual Payment Details & Upload Box */}
            {paymentMethod === "manual" && manualSettings?.enabled && (
              <section className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 space-y-4">
                <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--accent-strong)]">
                  Manual Bank / Wallet Transfer Details
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Please transfer the exact amount using any of the channels below and upload your payment proof.
                </p>
                <div className="bg-[var(--page-bg)] p-4 rounded-xl border border-[var(--border)] space-y-2 text-sm">
                  {manualSettings.accountTitle && (
                    <p><strong>Account Title:</strong> {manualSettings.accountTitle}</p>
                  )}
                  {manualSettings.jazzcash && (
                    <p><strong>JazzCash Number:</strong> {manualSettings.jazzcash}</p>
                  )}
                  {manualSettings.easypaisa && (
                    <p><strong>EasyPaisa Number:</strong> {manualSettings.easypaisa}</p>
                  )}
                  {manualSettings.bankName && (
                    <>
                      <p><strong>Bank Name:</strong> {manualSettings.bankName}</p>
                      <p><strong>Bank Title:</strong> {manualSettings.bankAccountTitle}</p>
                      <p><strong>Account / IBAN:</strong> {manualSettings.bankAccountNumber}</p>
                    </>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)] mb-1">
                    Sender Account Name / Mobile Number
                  </label>
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="e.g. Muhammad Ali (0312-XXXXXXX)"
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-4 py-3 text-sm outline-none focus:border-[var(--accent-strong)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)] mb-1">
                    Upload Payment Proof / Screenshot
                  </label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-[var(--text-muted)] file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-[var(--accent-strong)] file:text-[var(--accent-ink)] hover:file:opacity-90 cursor-pointer"
                  />
                </div>
              </section>
            )}

            <section
              className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
              aria-labelledby="guest-email-heading"
            >
              <h2
                id="guest-email-heading"
                className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
              >
                Customer info
              </h2>
              <label htmlFor="customerEmail" className="mb-2 block font-semibold">
                Customer email
              </label>
              <input
                id="customerEmail"
                type="email"
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                placeholder="customer@example.com"
                autoComplete="email"
                disabled={payLoading}
                className="min-h-12 w-full max-w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-4 py-3 text-[var(--heading)] outline-none focus:border-[var(--accent-strong)] disabled:opacity-60 sm:py-4"
              />
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                eSIM order details will be associated with this email.
              </p>
            </section>
          </div>

          <aside className="space-y-5 lg:sticky lg:top-6">
            <section
              className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
              aria-labelledby="guest-summary-heading"
            >
              <h2
                id="guest-summary-heading"
                className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
              >
                Order summary
              </h2>
              <p className="mt-4 text-2xl font-bold text-[var(--accent-strong)] sm:text-3xl">
                {formatPrice(offer.priceUSD)}
              </p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {offer.name}
              </p>
            </section>

            <button
              type="button"
              onClick={pay}
              disabled={payLoading}
              aria-busy={payLoading}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 py-3 font-bold text-[var(--accent-ink)] disabled:cursor-not-allowed disabled:bg-[var(--accent)]"
            >
              {payLoading
                ? paymentMethod === "manual"
                  ? "Submitting Payment Proof..."
                  : "Redirecting to Safepay..."
                : paymentMethod === "manual"
                ? "Submit Manual Payment"
                : "Pay with Safepay"}
            </button>

            <CheckoutCompatibilityCheck />
            <CheckoutTrustPanel />

            {message && (
              <div className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4 text-[var(--danger-text)]">
                {message}
                {message.toLowerCase().includes("unavailable") ? (
                  <p className="mt-3">
                    <Link
                      href="/contact"
                      className="font-semibold underline underline-offset-2"
                    >
                      Contact support
                    </Link>
                  </p>
                ) : null}
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

export default function CheckoutClient({
  guestCheckoutEnabled,
}: {
  guestCheckoutEnabled: boolean;
}) {
  if (!guestCheckoutEnabled) {
    return <CheckoutUnavailable />;
  }

  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] text-[var(--heading)]">
          Loading...
        </main>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}