"use client";

import type { PublicManualPaymentConfig } from "@/app/lib/payments/manualPaymentConfigShared";
import { ManualPaymentCopyField } from "@/app/components/account/ManualPaymentCopyField";

type Props = {
  config: PublicManualPaymentConfig | null | undefined;
};

export function ManualPaymentDetailsBox({ config }: Props) {
  const accountTitle = config?.accountTitle?.trim() ?? "";
  const jazzcashNumber = config?.jazzcashNumber?.trim() ?? "";
  const easypaisaNumber = config?.easypaisaNumber?.trim() ?? "";
  const bankName = config?.bankName?.trim() ?? "";
  const bankAccountTitle = config?.bankAccountTitle?.trim() ?? "";
  const bankAccountNumber = config?.bankAccountNumber?.trim() ?? "";

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5">
      <div>
        <h3 className="text-sm font-bold text-[var(--heading)]">
          Transfer details
        </h3>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Send the exact checkout amount using JazzCash, EasyPaisa, or bank
          transfer, then upload your payment proof.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--accent-strong)]">
          Mobile wallets
        </p>
        <ManualPaymentCopyField
          label="Account title"
          value={accountTitle}
          fieldKey="accountTitle"
        />
        <ManualPaymentCopyField
          label="JazzCash number"
          value={jazzcashNumber}
          fieldKey="jazzcash"
          mono
        />
        <ManualPaymentCopyField
          label="EasyPaisa number"
          value={easypaisaNumber}
          fieldKey="easypaisa"
          mono
        />
      </div>

      <div className="space-y-2 border-t border-[var(--border)] pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--accent-strong)]">
          Bank transfer
        </p>
        <ManualPaymentCopyField
          label="Bank name"
          value={bankName}
          fieldKey="bankName"
        />
        <ManualPaymentCopyField
          label="Bank account title"
          value={bankAccountTitle}
          fieldKey="bankTitle"
        />
        <ManualPaymentCopyField
          label="Account number / IBAN"
          value={bankAccountNumber}
          fieldKey="bankAcc"
          mono
        />
      </div>
    </div>
  );
}
