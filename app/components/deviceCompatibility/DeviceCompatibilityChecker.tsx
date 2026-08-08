"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Smartphone } from "lucide-react";
import {
  BRAND_OPTIONS,
  COMPATIBILITY_DISCLAIMER,
  DEVICE_FAMILIES,
  RESULT_LABELS,
  installGuideForBrand,
  type BrandId,
  type CompatibilityStatus,
  type DeviceFamily,
} from "@/app/lib/deviceCompatibility/catalog";

function statusStyles(status: CompatibilityStatus): string {
  if (status === "likely") {
    return "border-[var(--accent-strong)]/40 bg-[var(--accent-strong)]/10 text-[var(--heading)]";
  }
  if (status === "may_depend") {
    return "border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--heading)]";
  }
  return "border-[var(--border)] bg-[var(--surface-2)] text-[var(--heading)]";
}

export default function DeviceCompatibilityChecker() {
  const brandGroupId = useId();
  const modelSelectId = useId();
  const resultHeadingId = useId();

  const [brand, setBrand] = useState<BrandId | null>(null);
  const [familyId, setFamilyId] = useState("");

  const families: DeviceFamily[] = useMemo(() => {
    if (!brand || brand === "other") return [];
    return DEVICE_FAMILIES[brand];
  }, [brand]);

  const selectedFamily = families.find((item) => item.id === familyId) ?? null;

  const resultStatus: CompatibilityStatus | null = useMemo(() => {
    if (!brand) return null;
    if (brand === "other") return "not_confirmed";
    return selectedFamily?.status ?? null;
  }, [brand, selectedFamily]);

  function selectBrand(next: BrandId) {
    setBrand(next);
    setFamilyId("");
  }

  const guides = brand ? installGuideForBrand(brand) : [];

  return (
    <div className="space-y-8">
      <fieldset className="space-y-3">
        <legend
          id={`${brandGroupId}-legend`}
          className="text-sm font-semibold text-[var(--heading)]"
        >
          Device brand
        </legend>
        <p id={`${brandGroupId}-hint`} className="text-sm text-[var(--text-muted)]">
          Choose your phone brand. We do not ask for IMEI, EID, or serial numbers.
        </p>
        <div
          role="radiogroup"
          aria-labelledby={`${brandGroupId}-legend`}
          aria-describedby={`${brandGroupId}-hint`}
          className="grid gap-3 sm:grid-cols-2"
        >
          {BRAND_OPTIONS.map((option) => {
            const selected = brand === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => selectBrand(option.id)}
                className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 ${
                  selected
                    ? "border-[var(--accent-strong)] bg-[var(--accent-strong)]/10 text-[var(--heading)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--heading)] hover:border-[var(--border-hover)]"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {brand && brand !== "other" ? (
        <div className="space-y-2">
          <label
            htmlFor={modelSelectId}
            className="block text-sm font-semibold text-[var(--heading)]"
          >
            Device family
          </label>
          <p className="text-sm text-[var(--text-muted)]">
            Pick the closest well-known family. If your exact variant is unclear,
            choose “not listed” or check manually below.
          </p>
          <select
            id={modelSelectId}
            value={familyId}
            onChange={(event) => setFamilyId(event.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--heading)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          >
            <option value="">Select a device family</option>
            {families.map((family) => (
              <option key={family.id} value={family.id}>
                {family.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {resultStatus ? (
        <section
          aria-labelledby={resultHeadingId}
          className={`rounded-2xl border p-5 sm:p-6 ${statusStyles(resultStatus)}`}
        >
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--accent-strong)]/35 bg-[var(--accent-strong)]/10 text-[var(--accent-strong)]">
              <Smartphone className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 space-y-3">
              <div>
                <h2
                  id={resultHeadingId}
                  className="text-lg font-bold tracking-tight"
                >
                  {RESULT_LABELS[resultStatus]}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
                  This is a guidance check only — not a guarantee that your device
                  can install or use a MAP eSIM.
                </p>
              </div>

              <p className="text-sm leading-relaxed text-[var(--text)]">
                {COMPATIBILITY_DISCLAIMER}
              </p>

              <div className="space-y-2 text-sm leading-relaxed text-[var(--text)]">
                <p className="font-semibold text-[var(--heading)]">
                  Quick manual check
                </p>
                {(brand === "apple" || brand === "other") && (
                  <p>
                    <span className="font-medium">iPhone:</span> Settings →
                    Cellular/Mobile Service → look for “Add eSIM”
                  </p>
                )}
                {(brand === "samsung" ||
                  brand === "pixel" ||
                  brand === "other") && (
                  <p>
                    <span className="font-medium">Android:</span> Settings →
                    Network &amp; Internet / Connections → SIM manager → look for
                    “Add eSIM”
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
                {guides.map((guide) => (
                  <Link
                    key={guide.href}
                    href={guide.href}
                    className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-[var(--accent-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
                  >
                    {guide.label}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                ))}
                <Link
                  href="/countries"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
                >
                  Browse destinations
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
