"use client";

import { useState } from "react";
import CopyInstallField from "@/app/components/install/CopyInstallField";
import EsimActionSheet from "@/app/components/install/EsimActionSheet";

type Props = {
  smdpAddress?: string | null;
  activationCode?: string | null;
  lpa?: string | null;
  buttonClassName?: string;
  label?: string;
};

export default function ManualInstallSheet({
  smdpAddress,
  activationCode,
  lpa,
  buttonClassName,
  label = "Manual Install",
}: Props) {
  const [open, setOpen] = useState(false);
  const fields = [
    smdpAddress ? { label: "SM-DP+ Address", value: smdpAddress } : null,
    activationCode ? { label: "Activation Code", value: activationCode } : null,
    lpa ? { label: "LPA / Full Activation Value", value: lpa } : null,
  ].filter((row): row is { label: string; value: string } => Boolean(row));

  if (fields.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          buttonClassName ||
          "inline-flex h-11 w-full items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] outline-none hover:bg-[var(--page-bg-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        }
      >
        {label}
      </button>
      <EsimActionSheet
        open={open}
        title="Manual installation details"
        onClose={() => setOpen(false)}
      >
        <div className="space-y-3">
          {fields.map((field) => (
            <CopyInstallField
              key={field.label}
              label={field.label}
              value={field.value}
            />
          ))}
        </div>
      </EsimActionSheet>
    </>
  );
}
