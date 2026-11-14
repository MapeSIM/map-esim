"use client";

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Upload, CheckCircle2 } from "lucide-react";
import { ManualPaymentDetailsBox } from "@/app/components/account/ManualPaymentDetailsBox";
import type { PublicManualPaymentConfig } from "@/app/lib/payments/manualPaymentConfigShared";
import {
  confirmWalletEsimPurchaseAction,
  cancelPendingEsimGatewayCheckoutAction,
  setWalletPurchaseFundingChoiceAction,
} from "@/app/lib/esim/walletPurchaseActions";
import {
  calculatePurchaseFunding,
  type PurchaseFundingBreakdown,
} from "@/app/lib/esim/purchaseFunding";
import {
  CARD_PAYMENT_UNAVAILABLE_MESSAGE,
  INSUFFICIENT_WALLET_CHECKOUT_MESSAGE,
  initialWalletPurchaseState,
  type WalletPurchaseActionState,
} from "@/app/lib/esim/walletPurchaseFormState";
import { CUSTOMER_PAYMENT_TEMPORARILY_UNAVAILABLE_MESSAGE } from "@/app/lib/payments/customerPaymentCheckoutPolicy";
import { PAYMENT_GATEWAY_CHECKOUT_PAUSED_MESSAGE } from "@/app/lib/admin/operationalControlsShared";
import {
  CUSTOMER_AWAITING_GATEWAY_ACTIVE_MESSAGE,
  CUSTOMER_AWAITING_GATEWAY_CANCEL_LABEL,
  CUSTOMER_AWAITING_GATEWAY_INACTIVE_MESSAGE,
  CUSTOMER_ABANDONED_REVIEW_START_NEW_LABEL,
} from "@/app/lib/esim/customerPurchaseStatusMessaging";
import type { CustomerEsimPaymentMode } from "@/app/lib/esim/walletPurchaseValidation";
import { useWalletFromPaymentMode } from "@/app/lib/esim/walletPurchaseValidation";
import type { WalletPurchaseReview } from "@/app/lib/esim/walletPurchaseRead";
import { WalletEsimPurchaseStatus } from "@prisma/client";
import CheckoutPromoCodeSection from "@/app/components/account/CheckoutPromoCodeSection";
import CheckoutDeliveryEmailSection from "@/app/components/account/CheckoutDeliveryEmailSection";
import {
  CheckoutDisplayCurrencyNote,
  CheckoutMoney,
} from "@/app/components/account/CheckoutMoney";
import { CheckoutTrustPanel } from "@/app/components/account/CheckoutTrustPanel";
import { CheckoutCompatibilityCheck } from "@/app/components/account/CheckoutCompatibilityModal";
import SimpaisaWalletFields from "@/app/components/account/SimpaisaWalletFields";
import WhatsAppCheckoutPhoneField from "@/app/components/account/WhatsAppCheckoutPhoneField";
import { createWhatsAppPendingOrderAction } from "@/app/lib/esim/whatsappCheckoutOrderActions";
import {
  WHATSAPP_CHECKOUT_DEFAULT_DIAL_CODE,
  composeWhatsAppCheckoutPhoneDigits,
} from "@/app/lib/support/whatsappCheckoutOrderShared";

type Props = {
  review: WalletPurchaseReview;
  enabledSimpaisaOperatorIds?: readonly string[];
  whatsappCheckoutPhone?: string | null;
  safepayEnabled?: boolean;
  manualConfig?: PublicManualPaymentConfig | null;
};

function BuyViaWhatsAppCheckoutButton({
  purchaseId,
  customerWhatsAppDigits,
  onRequirePhone,
  onBusyChange,
  locked = false,
  className,
}: {
  purchaseId: string;
  customerWhatsAppDigits: string | null;
  onRequirePhone: () => void;
  onBusyChange?: (busy: boolean) => void;
  locked?: boolean;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackHref, setFallbackHref] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  async function onClick() {
    if (busy || locked) return;
    if (!customerWhatsAppDigits) {
      onRequirePhone();
      setError("Enter a valid WhatsApp number to continue.");
      return;
    }
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const result = await createWhatsAppPendingOrderAction({
        purchaseId,
        whatsappPhone: customerWhatsAppDigits,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setReference(result.orderReference);
      setFallbackHref(result.redirectUrl);
      const opened = window.open(
        result.redirectUrl,
        "_blank",
        "noopener,noreferrer"
      );
      if (!opened) {
        setError(
          "Popup blocked — use the link below to continue on WhatsApp."
        );
      }
    } catch {
      setError("Could not create the WhatsApp order. Please try again.");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy || locked || !customerWhatsAppDigits}
        onClick={onClick}
        className={
          className ??
          "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-5 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
        }
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Creating WhatsApp Order...
          </>
        ) : (
          "Buy via WhatsApp"
        )}
      </button>
      {error ? (
        <p className="text-xs text-[var(--heading)]" role="alert">
          {error}
        </p>
      ) : null}
      {fallbackHref ? (
        <a
          href={fallbackHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex text-xs font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          Continue to WhatsApp
          {reference ? ` (${reference})` : ""}
        </a>
      ) : null}
    </div>
  );
}

function defaultPaymentMode(
  review: WalletPurchaseReview
): CustomerEsimPaymentMode {
  const afterPromo = Math.max(
    0,
    Math.trunc(Number(review.payableCents ?? review.priceCents))
  );
  const rewards =
    review.useRewards && review.rewardEligible
      ? Math.min(
          Math.max(0, Math.trunc(Number(review.rewardPointsBalance))),
          afterPromo
        )
      : 0;
  const cashPayable = Math.max(0, afterPromo - rewards);
  const balance = Math.max(0, Math.trunc(Number(review.balanceCents)));
  if (cashPayable <= 0) return "full_wallet";
  if (review.paymentGatewayConfigured !== true) return "full_wallet";
  if (balance <= 0) return "mobile_only";
  if (balance >= cashPayable) return "full_wallet";
  if (review.useWallet) return "wallet_and_mobile";
  return "mobile_only";
}

function InsufficientWalletCheckoutNotice() {
  return (
    <div className="space-y-3" role="status">
      <p className="text-sm font-medium text-[var(--heading)]">
        {INSUFFICIENT_WALLET_CHECKOUT_MESSAGE}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/account/wallet"
          className="inline-flex h-10 items-center justify-center rounded-[14px] bg-[var(--accent-strong)] px-4 text-sm font-semibold text-[var(--accent-ink)] transition hover:opacity-95"
        >
          Go to wallet
        </Link>
        <Link
          href="/support"
          className="inline-flex h-10 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--surface-2)]"
        >
          Contact support
        </Link>
      </div>
    </div>
  );
}

function previewPurchaseFunding(
  review: WalletPurchaseReview,
  useWallet: boolean,
  useRewards: boolean
): PurchaseFundingBreakdown & { rewardPointsRedeemed: number } {
  const afterPromoCents = Math.trunc(
    Number(review.payableCents ?? review.priceCents)
  );
  const pointsBalance = Math.max(
    0,
    Math.trunc(Number(review.rewardPointsBalance))
  );
  const eligible = review.rewardEligible === true;
  const rewardPointsRedeemed =
    useRewards && eligible
      ? Math.min(pointsBalance, Math.max(0, afterPromoCents))
      : 0;
  const payableCents = Math.max(0, afterPromoCents - rewardPointsRedeemed);
  try {
    if (payableCents === 0) {
      return {
        useWallet,
        walletAppliedCents: 0,
        gatewayAmountCents: 0,
        rewardPointsRedeemed,
      };
    }
    return {
      ...calculatePurchaseFunding({
        priceCents: payableCents,
        walletBalanceCents: review.balanceCents,
        useWallet,
      }),
      rewardPointsRedeemed,
    };
  } catch {
    if (useWallet === review.useWallet && useRewards === review.useRewards) {
      return {
        useWallet: review.useWallet,
        walletAppliedCents: review.walletAppliedCents,
        gatewayAmountCents: review.gatewayAmountCents,
        rewardPointsRedeemed,
      };
    }
    const priceCents = payableCents;
    const balanceCents = Math.max(0, Math.trunc(Number(review.balanceCents)));
    if (
      !Number.isFinite(priceCents) ||
      priceCents <= 0 ||
      !Number.isFinite(balanceCents)
    ) {
      return {
        useWallet: review.useWallet,
        walletAppliedCents: review.walletAppliedCents,
        gatewayAmountCents: review.gatewayAmountCents,
        rewardPointsRedeemed: review.rewardPointsRedeemed,
      };
    }
    const walletAppliedCents = useWallet
      ? Math.min(balanceCents, priceCents)
      : 0;
    return {
      useWallet,
      walletAppliedCents,
      gatewayAmountCents: priceCents - walletAppliedCents,
      rewardPointsRedeemed,
    };
  }
}

export default function WalletPurchaseConfirmForm({
  review,
  enabledSimpaisaOperatorIds,
  whatsappCheckoutPhone = null,
  safepayEnabled = false,
  manualConfig,
}: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    confirmWalletEsimPurchaseAction,
    initialWalletPurchaseState
  );

  const [manualSelected, setManualSelected] = useState(false);
  const [manualSenderName, setManualSenderName] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofUrl, setProofUrl] = useState("");
  const [uploadingProof, setUploadingProof] = useState(false);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [selectingPayment, setSelectingPayment] = useState(false);
  const [liveManualConfig, setLiveManualConfig] =
    useState<PublicManualPaymentConfig | null>(manualConfig ?? null);

  const [whatsappSelected, setWhatsappSelected] = useState(false);
  const [whatsappOrderBusy, setWhatsappOrderBusy] = useState(false);
  const [whatsappDialCode, setWhatsappDialCode] = useState(
    WHATSAPP_CHECKOUT_DEFAULT_DIAL_CODE
  );
  const [whatsappLocalNumber, setWhatsappLocalNumber] = useState("");
  const [whatsappPhoneTouched, setWhatsappPhoneTouched] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [paymentMode, setPaymentMode] = useState<CustomerEsimPaymentMode>(() =>
    defaultPaymentMode(review)
  );
  const [useRewards, setUseRewards] = useState(review.useRewards);
  const [deliveryBlocksPurchase, setDeliveryBlocksPurchase] = useState(false);
  const [simpaisaFieldsReady, setSimpaisaFieldsReady] = useState(false);
  const [fundingPending, startFundingTransition] = useTransition();
  const fundingChoiceGen = useRef(0);
  const confirmId = useId();
  const confirmStickyId = useId();
  const useRewardsId = useId();
  const planHeadingId = useId();
  const customerHeadingId = useId();
  const paymentModeHeadingId = useId();
  const rewardsHeadingId = useId();
  const orderHeadingId = useId();
  const mobileDueHeadingId = useId();
  const paymentHeadingId = useId();
  const confirmSectionId = "checkout-confirm";
  const onlinePaymentSectionId = "checkout-online-payment";
  const mobileDueSummaryId = "checkout-mobile-due-summary";
  const errorState = state as WalletPurchaseActionState;

  const isSafepayMode = safepayEnabled && paymentMode === "safepay";

  useEffect(() => {
    let cancelled = false;
    async function refreshManualConfig() {
      try {
        const res = await fetch("/api/checkout/manual-payment-config", {
          cache: "no-store",
        });
        const data = await res.json();
        if (!cancelled && data?.success && data?.config) {
          setLiveManualConfig(data.config);
        }
      } catch {
        // Keep server-provided config if the public fetch fails.
      }
    }
    void refreshManualConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  const manualPaymentsEnabled = Boolean(liveManualConfig?.enabled);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProofFile(file);
    setUploadingProof(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload-payment-proof", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setProofUrl(data.fileUrl || data.url);
      } else {
        alert(data.error || "Failed to upload payment proof");
      }
    } catch {
      alert("Error uploading file");
    } finally {
      setUploadingProof(false);
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualSenderName || !proofUrl) {
      alert("Please enter sender name and upload payment proof screenshot.");
      return;
    }
    setManualSubmitting(true);
    try {
      const res = await fetch("/api/checkout/manual-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseId: review.purchaseId,
          customerEmail: review.customerEmail,
          senderName: manualSenderName,
          proofUrl: proofUrl,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const ref = typeof data.reference === "string" ? data.reference : "";
        const params = new URLSearchParams({
          purchase: review.purchaseId,
        });
        if (ref) params.set("ref", ref);
        router.push(`/account/esim/buy/manual-pending?${params.toString()}`);
      } else {
        alert(data.error || "Failed to submit manual order");
      }
    } catch {
      alert("Network error submitting manual order");
    } finally {
      setManualSubmitting(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (isSafepayMode) {
      event.preventDefault();
      setWhatsappOrderBusy(true);
      try {
        const res = await fetch("/api/payments/safepay/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purchaseId: review.purchaseId }),
        });
        const data = await res.json();
        if (data.url || data.redirectUrl) {
          window.location.href = data.url || data.redirectUrl;
        } else {
          alert(data.error || "Could not initialize Safepay checkout.");
          setWhatsappOrderBusy(false);
        }
      } catch {
        alert("Network error connecting to Safepay.");
        setWhatsappOrderBusy(false);
      }
    }
  }

  const useWallet = useWalletFromPaymentMode(paymentMode);
  const preview = previewPurchaseFunding(review, useWallet, useRewards);
  const gatewayRequired = preview.gatewayAmountCents > 0;
  const walletFundsApplied = preview.walletAppliedCents > 0;
  const fullWallet = !gatewayRequired && walletFundsApplied;
  const zeroCashConfirm = !gatewayRequired;
  const isFullWalletMode = paymentMode === "full_wallet";
  const confirmNoteText = isFullWalletMode
    ? "Confirm below to complete this purchase with your wallet."
    : "Confirm below to continue to online payment.";
  const confirmCheckboxText = isFullWalletMode
    ? "I confirm this wallet purchase."
    : "I confirm this purchase and will continue to payment.";
  const primaryCtaLabel = isFullWalletMode
    ? "Buy eSIM with Wallet"
    : "Continue to Payment";
  
  const primaryCtaPendingLabel = fundingPending || selectingPayment ? (
    <>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      Updating payment method...
    </>
  ) : isFullWalletMode ? (
    "Buying with wallet…"
  ) : (
    "Connecting to Payment Gateway..."
  );

  const rewardsDisabled = !review.rewardEligible;
  const walletDisabled = review.balanceCents <= 0;
  const hasWalletBalance = !walletDisabled;
  const paymentGatewayConfigured = review.paymentGatewayConfigured === true;
  const onlinePaymentsAllowed = paymentGatewayConfigured;
  const simpaisaCheckout = review.activePaymentProvider === "SIMPAISA" && !isSafepayMode;
  const gatewayReady = (gatewayRequired && paymentGatewayConfigured) || isSafepayMode;
  const showGatewayUnavailable =
    onlinePaymentsAllowed && gatewayRequired && !paymentGatewayConfigured && !safepayEnabled;
  const afterPromoCents = Math.max(
    0,
    Math.trunc(Number(review.payableCents ?? review.priceCents))
  );
  const cashPayablePreview = Math.max(
    0,
    afterPromoCents - preview.rewardPointsRedeemed
  );
  const canFullWallet =
    hasWalletBalance &&
    review.balanceCents >= cashPayablePreview &&
    cashPayablePreview > 0;
  const canWalletAndMobile =
    hasWalletBalance &&
    review.balanceCents > 0 &&
    review.balanceCents < cashPayablePreview;
  const showFullWalletOption = hasWalletBalance && canFullWallet;
  const showWalletAndOnlineOption = canWalletAndMobile && !isSafepayMode;
  const showOnlinePaymentOption = cashPayablePreview > 0 && onlinePaymentsAllowed;
  const walletOnlyInsufficient =
    !onlinePaymentsAllowed && cashPayablePreview > 0 && !canFullWallet && !safepayEnabled;
  const whatsappPhone = (whatsappCheckoutPhone ?? "").trim();
  const whatsappCheckoutAvailable =
    Boolean(whatsappPhone) && cashPayablePreview > 0;
  const showWhatsAppCheckoutCta =
    !manualSelected &&
    whatsappCheckoutAvailable &&
    !zeroCashConfirm &&
    (whatsappSelected ||
      !onlinePaymentsAllowed ||
      showGatewayUnavailable ||
      walletOnlyInsufficient);
  const customerWhatsAppParsed = composeWhatsAppCheckoutPhoneDigits({
    dialCode: whatsappDialCode,
    localNumber: whatsappLocalNumber,
  });
  const customerWhatsAppDigits = customerWhatsAppParsed.ok
    ? customerWhatsAppParsed.digits
    : null;
  const showRewardsSection =
    Math.max(0, Math.trunc(Number(review.rewardPointsBalance))) >= 100;
  const onlinePaymentLabel = simpaisaCheckout
    ? "Online payment (JazzCash / Easypaisa)"
    : "Online payment";
  const walletAndOnlineLabel = simpaisaCheckout
    ? "Wallet + online payment (JazzCash / Easypaisa)"
    : "Wallet + online payment";
  const balanceAfterPreview = Math.max(
    0,
    review.balanceCents - preview.walletAppliedCents
  );
  const busy = pending || fundingPending || whatsappOrderBusy || manualSubmitting || selectingPayment;
  const purchaseBlocked = busy || deliveryBlocksPurchase;
  const dueOnline = preview.gatewayAmountCents > 0;
  const dueLabel = dueOnline
    ? onlinePaymentsAllowed
      ? "Pay now"
      : "Remaining"
    : fullWallet || walletFundsApplied
      ? "Wallet"
      : "Covered";
  const gatewayNeedsSimpaisaFields = gatewayReady && simpaisaCheckout;
  const stickyCtaDisabled = manualSelected
    ? manualSubmitting || !manualSenderName || !proofUrl
    : zeroCashConfirm
      ? purchaseBlocked || !confirmed
      : gatewayReady
        ? purchaseBlocked ||
          (gatewayNeedsSimpaisaFields && !simpaisaFieldsReady)
        : true;
  const stickyShowConfirm = zeroCashConfirm && !pending && !manualSelected;
  const stickyDisabledReason = (() => {
    if (pending || selectingPayment) return "Updating payment method...";
    if (deliveryBlocksPurchase) {
      return "Save or cancel the delivery email to continue.";
    }
    if (zeroCashConfirm && !confirmed) {
      return null;
    }
    if (manualSelected) {
      return null;
    }
    if (walletOnlyInsufficient && !manualPaymentsEnabled) {
      return INSUFFICIENT_WALLET_CHECKOUT_MESSAGE;
    }
    if (!zeroCashConfirm && !gatewayReady && !manualPaymentsEnabled) {
      return "Online payment is unavailable right now.";
    }
    if (!zeroCashConfirm && !gatewayReady && manualPaymentsEnabled) {
      return "Select Manual Payment (or WhatsApp) to continue.";
    }
    if (gatewayNeedsSimpaisaFields && !simpaisaFieldsReady) {
      return "Select JazzCash or Easypaisa and enter a valid mobile number.";
    }
    return null;
  })();

  function persistFundingChoice(
    nextMode: CustomerEsimPaymentMode,
    nextRewards: boolean
  ) {
    const gen = ++fundingChoiceGen.current;
    startFundingTransition(async () => {
      const fd = new FormData();
      fd.set("purchaseId", review.purchaseId);
      fd.set("paymentMode", nextMode);
      if (nextRewards) fd.set("useRewards", "on");
      const result = await setWalletPurchaseFundingChoiceAction(
        initialWalletPurchaseState,
        fd
      );
      if (result.ok === true && gen === fundingChoiceGen.current) {
        router.refresh();
      }
    });
  }

  function onPaymentModeChange(next: CustomerEsimPaymentMode) {
    setSelectingPayment(true);
    setWhatsappSelected(false);
    setManualSelected(false);
    setPaymentMode(next);
    persistFundingChoice(next, useRewards && !rewardsDisabled);
    setTimeout(() => setSelectingPayment(false), 1200);
  }

  function onWhatsAppPaymentSelect() {
    setSelectingPayment(true);
    setWhatsappSelected(true);
    setManualSelected(false);
    setTimeout(() => setSelectingPayment(false), 800);
  }

  function onManualPaymentSelect() {
    setSelectingPayment(true);
    setManualSelected(true);
    setWhatsappSelected(false);
    setTimeout(() => setSelectingPayment(false), 800);
  }

  function onUseRewardsChange(checked: boolean) {
    setUseRewards(checked);
    persistFundingChoice(paymentMode, checked);
  }

  useEffect(() => {
    let next: CustomerEsimPaymentMode = paymentMode;
    if (!onlinePaymentsAllowed && !safepayEnabled || cashPayablePreview <= 0) {
      next = "full_wallet";
    } else if (paymentMode === "full_wallet" && !showFullWalletOption) {
      next = showWalletAndOnlineOption ? "wallet_and_mobile" : "mobile_only";
    } else if (
      paymentMode === "wallet_and_mobile" &&
      !showWalletAndOnlineOption
    ) {
      next = showFullWalletOption ? "full_wallet" : "mobile_only";
    }
    if (next !== paymentMode) {
      setPaymentMode(next);
      persistFundingChoice(next, useRewards && !rewardsDisabled);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cashPayablePreview,
    onlinePaymentsAllowed,
    showFullWalletOption,
    showWalletAndOnlineOption,
    safepayEnabled,
  ]);

  const cardClass =
    "rounded-[24px] border border-[var(--border)] bg-[var(--surface)] px-5 py-5 sm:px-6";

  const paymentOptionClass = (selected: boolean) =>
    [
      "flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition",
      selected
        ? "border-[var(--accent-strong)] bg-[color-mix(in_srgb,var(--accent-strong)_8%,var(--surface))]"
        : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]",
    ].join(" ");

  const awaitingGatewayPayment =
    review.status === WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT;

  const stickyBarVisible = !awaitingGatewayPayment;
  const stickySpacerClass =
    stickyShowConfirm || Boolean(stickyDisabledReason) || manualSelected
      ? "pointer-events-none h-[calc(14rem+env(safe-area-inset-bottom,0px))] lg:hidden"
      : "pointer-events-none h-[calc(10rem+env(safe-area-inset-bottom,0px))] lg:hidden";

  return (
    <div className="min-w-0 space-y-6 max-lg:[scroll-padding-bottom:calc(10rem+env(safe-area-inset-bottom,0px))]">
      {awaitingGatewayPayment ? (
        <div
          className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-4 sm:px-5"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            {review.pendingGatewayAttemptId
              ? CUSTOMER_AWAITING_GATEWAY_ACTIVE_MESSAGE
              : CUSTOMER_AWAITING_GATEWAY_INACTIVE_MESSAGE}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <form
              action={cancelPendingEsimGatewayCheckoutAction}
              className="inline-flex"
            >
              <input type="hidden" name="purchaseId" value={review.purchaseId} />
              {review.pendingGatewayAttemptId ? (
                <input
                  type="hidden"
                  name="attemptId"
                  value={review.pendingGatewayAttemptId}
                />
              ) : null}
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--surface)]/80"
              >
                {CUSTOMER_AWAITING_GATEWAY_CANCEL_LABEL}
              </button>
            </form>
            {!review.pendingGatewayAttemptId ? (
              <Link
                href="/account/esim/buy"
                className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)]"
              >
                {CUSTOMER_ABANDONED_REVIEW_START_NEW_LABEL}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

    <form
      action={manualSelected ? undefined : formAction}
      onSubmit={manualSelected ? handleManualSubmit : handleSubmit}
      className="space-y-6"
      noValidate
    >
      <input type="hidden" name="purchaseId" value={review.purchaseId} />
      <input type="hidden" name="idempotencyKey" value={review.idempotencyKey} />
      <input type="hidden" name="paymentMode" value={paymentMode} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <div className="space-y-5">
          <section className={cardClass} aria-labelledby={planHeadingId}>
            <h2
              id={planHeadingId}
              className="border-b border-[var(--border)] py-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
            >
              Plan summary
            </h2>
            <dl className="text-sm">
              <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                  Destination
                </dt>
                <dd className="font-semibold text-[var(--heading)]">
                  {review.destination}
                </dd>
              </div>
              <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                  Package / data
                </dt>
                <dd className="font-semibold text-[var(--heading)]">
                  {review.planName} · {review.dataAllowance}
                </dd>
              </div>
              <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                  Validity
                </dt>
                <dd className="font-semibold text-[var(--heading)]">
                  {review.validity}
                </dd>
              </div>
              <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                  Delivery
                </dt>
                <dd className="font-semibold text-[var(--heading)]">
                  {review.deliveryLabel}
                </dd>
              </div>
            </dl>
          </section>

          <section
            id={mobileDueSummaryId}
            className={`${cardClass} lg:hidden`}
            aria-labelledby={mobileDueHeadingId}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-3">
              <h2
                id={mobileDueHeadingId}
                className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
              >
                Amount due
              </h2>
              <a
                href={
                  zeroCashConfirm || walletOnlyInsufficient
                    ? `#${confirmSectionId}`
                    : `#${onlinePaymentSectionId}`
                }
                className="shrink-0 text-xs font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
                onClick={(event) => {
                  const targetId =
                    zeroCashConfirm || walletOnlyInsufficient
                      ? confirmSectionId
                      : onlinePaymentSectionId;
                  const el = document.getElementById(targetId);
                  if (!el) return;
                  event.preventDefault();
                  el.scrollIntoView({ behavior: "smooth", block: "start" });
                  if (typeof history !== "undefined") {
                    history.replaceState(null, "", `#${targetId}`);
                  }
                }}
              >
                {zeroCashConfirm || walletOnlyInsufficient
                  ? "Jump to confirm"
                  : "Jump to pay"}
              </a>
            </div>
            <dl className="text-sm">
              <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] py-2.5">
                <dt className="text-[var(--text-muted)]">Package total</dt>
                <dd className="font-semibold text-[var(--heading)]">
                  <CheckoutMoney exactSimpaisaPkrCharge={simpaisaCheckout} cents={review.priceCents} />
                </dd>
              </div>
              {review.promoDiscountCents > 0 ? (
                <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] py-2.5">
                  <dt className="text-[var(--text-muted)]">Promo</dt>
                  <dd className="font-semibold text-[var(--heading)]">
                    <CheckoutMoney exactSimpaisaPkrCharge={simpaisaCheckout} cents={review.promoDiscountCents} signed />
                  </dd>
                </div>
              ) : null}
              {preview.rewardPointsRedeemed > 0 ? (
                <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] py-2.5">
                  <dt className="text-[var(--text-muted)]">Rewards</dt>
                  <dd className="font-semibold text-[var(--heading)]">
                    <CheckoutMoney exactSimpaisaPkrCharge={simpaisaCheckout} cents={preview.rewardPointsRedeemed} signed />
                  </dd>
                </div>
              ) : null}
              {preview.walletAppliedCents > 0 ? (
                <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] py-2.5">
                  <dt className="text-[var(--text-muted)]">Wallet</dt>
                  <dd className="font-semibold text-[var(--heading)]">
                    <CheckoutMoney exactSimpaisaPkrCharge={simpaisaCheckout}
                      cents={preview.walletAppliedCents}
                      signed
                      variant="wallet-deduction"
                    />
                  </dd>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between gap-3 pt-2.5">
                <dt className="font-semibold text-[var(--heading)]">{dueLabel}</dt>
                <dd className="text-base font-semibold text-[var(--heading)]">
                  {dueOnline ? (
                    <CheckoutMoney exactSimpaisaPkrCharge={simpaisaCheckout} cents={preview.gatewayAmountCents} />
                  ) : (
                    "Covered"
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section className={cardClass} aria-labelledby={customerHeadingId}>
            <h2
              id={customerHeadingId}
              className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
            >
              Customer
            </h2>
            <p className="mt-2 text-sm font-semibold text-[var(--heading)] break-words">
              {review.customerEmail}
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Signed-in account email
            </p>
            <CheckoutDeliveryEmailSection
              key={`${review.purchaseId}:${review.alternateDeliveryEmail ?? ""}:${review.deliveryEmailEditable ? "1" : "0"}`}
              purchaseId={review.purchaseId}
              accountEmail={review.customerEmail}
              savedAlternateEmail={review.alternateDeliveryEmail}
              editable={review.deliveryEmailEditable}
              disabled={busy}
              onBlockingChange={setDeliveryBlocksPurchase}
            />
            {showWhatsAppCheckoutCta ||
            (whatsappCheckoutAvailable && whatsappSelected) ? (
              <WhatsAppCheckoutPhoneField
                dialCode={whatsappDialCode}
                localNumber={whatsappLocalNumber}
                onDialCodeChange={setWhatsappDialCode}
                onLocalNumberChange={(value) => {
                  setWhatsappLocalNumber(value);
                  setWhatsappPhoneTouched(true);
                }}
                disabled={busy}
                showError={whatsappPhoneTouched}
              />
            ) : null}
          </section>

          <CheckoutPromoCodeSection
            purchaseId={review.purchaseId}
            applied={review.promoApplied}
            code={review.promoCode}
            originalCents={review.priceCents}
            discountCents={review.promoDiscountCents}
            totalCents={review.payableCents}
            disabled={busy}
            exactSimpaisaPkrCharge={simpaisaCheckout}
          />

          {showRewardsSection ? (
            <section className={cardClass} aria-labelledby={rewardsHeadingId}>
              <h2
                id={rewardsHeadingId}
                className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
              >
                Rewards
              </h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {review.rewardPointsBalanceLabel} points available (
                <CheckoutMoney exactSimpaisaPkrCharge={simpaisaCheckout} cents={review.rewardPointsBalance} />)
              </p>
              <label
                htmlFor={useRewardsId}
                className="mt-3 flex items-center gap-2.5 text-sm text-[var(--heading)]"
              >
                <input
                  id={useRewardsId}
                  name="useRewards"
                  type="checkbox"
                  value="on"
                  checked={useRewards}
                  onChange={(event) =>
                    onUseRewardsChange(event.target.checked)
                  }
                  disabled={busy}
                  className="shrink-0"
                />
                <span>Use rewards</span>
              </label>
            </section>
          ) : null}

          {/* PAYMENT OPTIONS SECTION */}
          <section
            className={cardClass}
            aria-labelledby={paymentModeHeadingId}
          >
            <div className="flex items-center justify-between">
              <h2
                id={paymentModeHeadingId}
                className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
              >
                Payment
              </h2>
              {selectingPayment && (
                <div className="flex items-center gap-1.5 text-xs text-indigo-400 font-medium animate-pulse">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Updating...</span>
                </div>
              )}
            </div>
            
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Wallet:{" "}
              <CheckoutMoney exactSimpaisaPkrCharge={simpaisaCheckout}
                cents={review.balanceCents}
                variant="wallet-balance"
              />
            </p>

            {cashPayablePreview <= 0 ? (
              <p className="mt-3 text-sm text-[var(--text-muted)]">
                No online payment needed.
              </p>
            ) : walletOnlyInsufficient ? (
              <div className="mt-3">
                <InsufficientWalletCheckoutNotice />
              </div>
            ) : (
              <div
                role="radiogroup"
                aria-labelledby={paymentModeHeadingId}
                className="mt-3 space-y-2"
              >
                {showFullWalletOption ? (
                  <label
                    className={paymentOptionClass(
                      !whatsappSelected && !manualSelected && paymentMode === "full_wallet"
                    )}
                  >
                    <input
                      type="radio"
                      name="paymentModeChoice"
                      value="full_wallet"
                      checked={
                        !whatsappSelected && !manualSelected && paymentMode === "full_wallet"
                      }
                      disabled={busy}
                      onChange={() => onPaymentModeChange("full_wallet")}
                      className="shrink-0"
                    />
                    <span className="font-semibold text-[var(--heading)]">
                      Full wallet
                    </span>
                  </label>
                ) : null}

                {onlinePaymentsAllowed && showWalletAndOnlineOption ? (
                  <label
                    className={paymentOptionClass(
                      !whatsappSelected && !manualSelected && paymentMode === "wallet_and_mobile"
                    )}
                  >
                    <input
                      type="radio"
                      name="paymentModeChoice"
                      value="wallet_and_mobile"
                      checked={
                        !whatsappSelected &&
                        !manualSelected &&
                        paymentMode === "wallet_and_mobile"
                      }
                      disabled={busy}
                      onChange={() => onPaymentModeChange("wallet_and_mobile")}
                      className="shrink-0"
                    />
                    <span className="font-semibold text-[var(--heading)]">
                      {walletAndOnlineLabel}
                    </span>
                  </label>
                ) : null}

                {showOnlinePaymentOption ? (
                  <label
                    className={paymentOptionClass(
                      !whatsappSelected && !manualSelected && paymentMode === "mobile_only"
                    )}
                  >
                    <input
                      type="radio"
                      name="paymentModeChoice"
                      value="mobile_only"
                      checked={
                        !whatsappSelected && !manualSelected && paymentMode === "mobile_only"
                      }
                      disabled={busy}
                      onChange={() => onPaymentModeChange("mobile_only")}
                      className="shrink-0"
                    />
                    <span className="font-semibold text-[var(--heading)]">
                      {onlinePaymentLabel}
                    </span>
                  </label>
                ) : null}

                {safepayEnabled ? (
                  <label
                    className={paymentOptionClass(
                      !whatsappSelected && !manualSelected && paymentMode === "safepay"
                    )}
                  >
                    <input
                      type="radio"
                      name="paymentModeChoice"
                      value="safepay"
                      checked={
                        !whatsappSelected && !manualSelected && paymentMode === "safepay"
                      }
                      disabled={busy}
                      onChange={() => onPaymentModeChange("safepay")}
                      className="shrink-0"
                    />
                    <span className="font-semibold text-[var(--heading)]">
                      Credit / Debit Card (Safepay)
                    </span>
                  </label>
                ) : null}

                {manualPaymentsEnabled ? (
                  <label className={paymentOptionClass(manualSelected)}>
                    <input
                      type="radio"
                      name="paymentModeChoice"
                      value="manual_payment"
                      checked={manualSelected}
                      disabled={busy}
                      onChange={onManualPaymentSelect}
                      className="shrink-0"
                    />
                    <span className="font-semibold text-[var(--heading)]">
                      Manual Payment (JazzCash / EasyPaisa / Bank Transfer)
                    </span>
                  </label>
                ) : null}

                {whatsappCheckoutAvailable ? (
                  <label
                    className={paymentOptionClass(whatsappSelected)}
                  >
                    <input
                      type="radio"
                      name="paymentModeChoice"
                      value="whatsapp"
                      checked={whatsappSelected}
                      disabled={busy}
                      onChange={onWhatsAppPaymentSelect}
                      className="shrink-0"
                    />
                    <span className="font-semibold text-[var(--heading)]">
                      Buy via WhatsApp
                    </span>
                  </label>
                ) : null}
              </div>
            )}

            {manualPaymentsEnabled && manualSelected ? (
              <div className="mt-4 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
                <div>
                  <h3 className="text-base font-bold text-[var(--heading)]">
                    Complete manual payment
                  </h3>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    Transfer the exact amount using the details below, then
                    submit your proof.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <ManualPaymentDetailsBox config={liveManualConfig} />


                  <div className="flex flex-col justify-between space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <div className="space-y-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--accent-strong)]">
                        Submit payment details
                      </p>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--heading)]">
                          Sender account name / mobile number
                        </label>
                        <input
                          type="text"
                          value={manualSenderName}
                          onChange={(e) => setManualSenderName(e.target.value)}
                          placeholder="e.g. Ali Khan (03001234567)"
                          className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3.5 py-2.5 text-sm text-[var(--heading)] outline-none focus:border-[var(--accent-strong)]"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--heading)]">
                          Screenshot or proof of payment
                        </label>
                        <div className="flex items-center gap-3">
                          <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--page-bg)] px-4 py-3 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent-strong)]">
                            <Upload className="h-4 w-4 text-[var(--accent-strong)]" />
                            <span className="truncate">
                              {proofFile ? proofFile.name : "Choose file..."}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleFileUpload}
                              className="hidden"
                            />
                          </label>
                          {uploadingProof ? (
                            <Loader2 className="h-5 w-5 animate-spin text-[var(--accent-strong)]" />
                          ) : null}
                          {proofUrl ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                          ) : null}
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                          Supported: jpg, jpeg, png, webp
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleManualSubmit}
                      disabled={
                        manualSubmitting || !manualSenderName || !proofUrl
                      }
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-strong)] px-5 py-3 text-sm font-semibold text-[var(--accent-ink)] transition hover:opacity-95 disabled:opacity-50"
                    >
                      {manualSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Submit payment"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {errorState.ok === false && errorState.fieldErrors?.paymentMode ? (
              <p className="mt-3 text-sm text-[var(--heading)]" role="alert">
                {errorState.fieldErrors.paymentMode}
              </p>
            ) : null}
          </section>

          {!manualSelected && gatewayRequired && !whatsappSelected ? (
            onlinePaymentsAllowed || isSafepayMode ? (
            <section
              id={onlinePaymentSectionId}
              className={`${cardClass} scroll-mt-28 sm:scroll-mt-32`}
              aria-labelledby={paymentHeadingId}
            >
              <h2
                id={paymentHeadingId}
                className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
              >
                {isSafepayMode ? "Card payment" : "Online payment"}
              </h2>
              {gatewayReady ? (
                <>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    Due online:{" "}
                    <CheckoutMoney exactSimpaisaPkrCharge={simpaisaCheckout} cents={preview.gatewayAmountCents} />
                    {preview.walletAppliedCents > 0 ? (
                      <>
                        {" "}
                        (wallet{" "}
                        <CheckoutMoney exactSimpaisaPkrCharge={simpaisaCheckout}
                          cents={preview.walletAppliedCents}
                          variant="wallet-deduction"
                        />
                        )
                      </>
                    ) : null}
                  </p>
                  {simpaisaCheckout ? (
                    <SimpaisaWalletFields
                      usdCents={preview.gatewayAmountCents}
                      disabled={busy}
                      enabledOperatorIds={enabledSimpaisaOperatorIds}
                      onValidityChange={setSimpaisaFieldsReady}
                      operatorError={
                        errorState.ok === false
                          ? errorState.fieldErrors?.walletOperatorId
                          : undefined
                      }
                      msisdnError={
                        errorState.ok === false
                          ? errorState.fieldErrors?.customerMsisdn
                          : undefined
                      }
                    />
                  ) : (
                    <p className="mt-3 text-sm font-semibold text-[var(--heading)]">
                      {isSafepayMode ? "Click continue below to pay securely with Safepay." : "Continue to online payment."}
                    </p>
                  )}
                </>
              ) : showGatewayUnavailable ? (
                <>
                  <p
                    className="mt-1 text-sm font-medium text-[var(--heading)]"
                    role="status"
                  >
                    {review.customerPaymentGatewayCheckoutPaused
                      ? PAYMENT_GATEWAY_CHECKOUT_PAUSED_MESSAGE
                      : review.customerPaymentsTemporarilyUnavailable
                        ? CUSTOMER_PAYMENT_TEMPORARILY_UNAVAILABLE_MESSAGE
                        : CARD_PAYMENT_UNAVAILABLE_MESSAGE}
                  </p>
                  <p className="mt-3 text-sm text-[var(--text-muted)]">
                    Remaining due:{" "}
                    <CheckoutMoney exactSimpaisaPkrCharge={simpaisaCheckout} cents={preview.gatewayAmountCents} />.
                  </p>
                </>
              ) : null}
            </section>
            ) : null
          ) : null}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-6">
          {/* Desktop/tablet: full order summary. Mobile uses early Amount due + sticky due. */}
          <section
            className={`${cardClass} hidden lg:block`}
            aria-labelledby={orderHeadingId}
          >
            <h2
              id={orderHeadingId}
              className="border-b border-[var(--border)] py-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
            >
              Order summary
            </h2>
            <dl className="text-sm">
              <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                  Package total
                </dt>
                <dd className="font-semibold text-[var(--heading)]">
                  <CheckoutMoney exactSimpaisaPkrCharge={simpaisaCheckout} cents={review.priceCents} />
                </dd>
              </div>
              {review.promoDiscountCents > 0 ? (
                <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                    Promo discount
                  </dt>
                  <dd className="font-semibold text-[var(--heading)]">
                    <CheckoutMoney exactSimpaisaPkrCharge={simpaisaCheckout} cents={review.promoDiscountCents} signed />
                  </dd>
                </div>
              ) : null}
              {preview.rewardPointsRedeemed > 0 ? (
                <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                    Rewards applied
                  </dt>
                  <dd className="font-semibold text-[var(--heading)]">
                    <CheckoutMoney exactSimpaisaPkrCharge={simpaisaCheckout} cents={preview.rewardPointsRedeemed} signed />
                  </dd>
                </div>
              ) : null}
              {preview.walletAppliedCents > 0 ? (
                <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr]">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                    Wallet applied
                  </dt>
                  <dd className="font-semibold text-[var(--heading)]">
                    <CheckoutMoney exactSimpaisaPkrCharge={simpaisaCheckout}
                      cents={preview.walletAppliedCents}
                      signed
                      variant="wallet-deduction"
                    />
                  </dd>
                </div>
              ) : null}
              <div
                className={`grid gap-1 py-3 sm:grid-cols-[180px_1fr]${
                  fullWallet || zeroCashConfirm || walletFundsApplied
                    ? " border-b border-[var(--border)]"
                    : ""
                }`}
              >
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                  {dueLabel}
                </dt>
                <dd className="font-semibold text-[var(--heading)]">
                  {dueOnline ? (
                    <CheckoutMoney exactSimpaisaPkrCharge={simpaisaCheckout} cents={preview.gatewayAmountCents} />
                  ) : (
                    "Covered"
                  )}
                </dd>
              </div>
              {fullWallet || walletFundsApplied ? (
                <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                    Balance after purchase
                  </dt>
                  <dd className="font-semibold text-[var(--heading)]">
                    <CheckoutMoney exactSimpaisaPkrCharge={simpaisaCheckout}
                      cents={balanceAfterPreview}
                      variant="wallet-balance"
                    />
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          <CheckoutDisplayCurrencyNote />

          {manualSelected ? (
            <button
              type="button"
              onClick={handleManualSubmit}
              disabled={manualSubmitting || !manualSenderName || !proofUrl}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {manualSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit payment"}
            </button>
          ) : zeroCashConfirm ? (
            <>
              <div id={confirmSectionId} className="scroll-mt-28 sm:scroll-mt-32 space-y-2">
                <label
                  htmlFor={confirmId}
                  className="flex items-start gap-3 text-sm text-[var(--heading)]"
                >
                  <input
                    id={confirmId}
                    name="confirm"
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                    disabled={purchaseBlocked}
                    className="mt-1"
                  />
                  <span>
                    {confirmCheckboxText}
                  </span>
                </label>
                {errorState.ok === false && errorState.fieldErrors?.confirm ? (
                  <p className="text-sm text-[var(--heading)]" role="alert">
                    {errorState.fieldErrors.confirm}
                  </p>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={purchaseBlocked || !confirmed}
                className="hidden min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent-strong)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:opacity-95 disabled:opacity-60 lg:inline-flex"
              >
                {pending || selectingPayment ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Updating payment method...
                  </>
                ) : (
                  primaryCtaLabel
                )}
              </button>
            </>
          ) : showWhatsAppCheckoutCta ? (
            <div
              id={confirmSectionId}
              className="scroll-mt-28 sm:scroll-mt-32 hidden lg:block"
            >
              <BuyViaWhatsAppCheckoutButton
                purchaseId={review.purchaseId}
                customerWhatsAppDigits={customerWhatsAppDigits}
                onRequirePhone={() => setWhatsappPhoneTouched(true)}
                onBusyChange={setWhatsappOrderBusy}
                locked={pending || fundingPending}
              />
            </div>
          ) : gatewayReady ? (
            <div id={confirmSectionId} className="scroll-mt-28 sm:scroll-mt-32">
              <button
                type="submit"
                disabled={
                  purchaseBlocked ||
                  (gatewayNeedsSimpaisaFields && !simpaisaFieldsReady)
                }
                className="hidden min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent-strong)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:opacity-95 disabled:opacity-60 lg:inline-flex"
              >
                {pending || whatsappOrderBusy || selectingPayment ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Updating payment method...
                  </>
                ) : (
                  primaryCtaLabel
                )}
              </button>
            </div>
          ) : walletOnlyInsufficient ? (
            <div
              id={confirmSectionId}
              className="scroll-mt-28 sm:scroll-mt-32 lg:hidden"
            />
          ) : (
            <div id={confirmSectionId} className="scroll-mt-28 sm:scroll-mt-32">
              <button
                type="button"
                disabled
                className="hidden min-h-12 w-full items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--heading)] opacity-60 lg:inline-flex"
              >
                Continue to Payment
              </button>
            </div>
          )}

          <CheckoutCompatibilityCheck />
          <CheckoutTrustPanel />
        </aside>
      </div>

      {stickyBarVisible ? (
        <div
          className={stickySpacerClass}
          aria-hidden="true"
          data-checkout-sticky-spacer="true"
        />
      ) : null}

      {stickyBarVisible ? (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--surface)]/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] backdrop-blur supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 lg:hidden"
          role="region"
          aria-label="Checkout payment action"
        >
          <div className="mx-auto flex max-w-5xl min-w-0 flex-col gap-2">
            {/* Mobile sticky pay action — sole mobile CTA (desktop uses aside). */}
            {stickyShowConfirm ? (
              <label
                htmlFor={confirmStickyId}
                className="flex items-start gap-2.5 text-xs leading-snug text-[var(--heading)]"
              >
                <input
                  id={confirmStickyId}
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  disabled={purchaseBlocked}
                  className="mt-0.5"
                  aria-controls={confirmSectionId}
                />
                <span className="min-w-0 break-words">
                  {confirmCheckboxText}{" "}
                  <a
                    href={`#${confirmSectionId}`}
                    className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    Details
                  </a>
                </span>
              </label>
            ) : null}
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                {dueLabel}
              </p>
              <p className="truncate text-sm font-semibold text-[var(--heading)]">
                {dueOnline ? (
                  <CheckoutMoney
                    exactSimpaisaPkrCharge={simpaisaCheckout}
                    cents={preview.gatewayAmountCents}
                  />
                ) : (
                  "Covered"
                )}
              </p>
            </div>
            {manualSelected ? (
              <button
                type="button"
                onClick={handleManualSubmit}
                disabled={stickyCtaDisabled}
                className="inline-flex h-11 w-full min-w-0 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
              >
                {manualSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Submitting…
                  </>
                ) : (
                  "Submit payment"
                )}
              </button>
            ) : zeroCashConfirm ? (
              <button
                type="submit"
                disabled={stickyCtaDisabled}
                className="inline-flex h-11 w-full min-w-0 items-center justify-center gap-2 rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-[var(--accent-ink)] transition hover:opacity-95 disabled:opacity-60"
              >
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    {primaryCtaPendingLabel}
                  </>
                ) : (
                  primaryCtaLabel
                )}
              </button>
            ) : showWhatsAppCheckoutCta ? (
              <BuyViaWhatsAppCheckoutButton
                purchaseId={review.purchaseId}
                customerWhatsAppDigits={customerWhatsAppDigits}
                onRequirePhone={() => setWhatsappPhoneTouched(true)}
                onBusyChange={setWhatsappOrderBusy}
                locked={pending || fundingPending}
                className="inline-flex h-11 w-full min-w-0 items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
              />
            ) : gatewayReady ? (
              <button
                type="submit"
                disabled={stickyCtaDisabled}
                className="inline-flex h-11 w-full min-w-0 items-center justify-center gap-2 rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-[var(--accent-ink)] transition hover:opacity-95 disabled:opacity-60"
              >
                {pending || whatsappOrderBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    {primaryCtaPendingLabel}
                  </>
                ) : (
                  primaryCtaLabel
                )}
              </button>
            ) : walletOnlyInsufficient && !manualPaymentsEnabled ? null : (
              <button
                type="button"
                disabled
                className="inline-flex h-11 w-full min-w-0 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 text-sm font-semibold text-[var(--heading)] opacity-60"
              >
                Continue to Payment
              </button>
            )}
            {stickyDisabledReason && !showWhatsAppCheckoutCta && !manualSelected ? (
              <p
                className="text-xs leading-snug text-[var(--text-muted)]"
                role="status"
              >
                {stickyDisabledReason}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </form>
    </div>
  );
}