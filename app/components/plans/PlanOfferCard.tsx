import type { ReactNode } from "react";
import type { VesimOffer } from "@/app/lib/vesim/offers";
import { formatValidityCardValue } from "@/app/lib/plans/plan-utils";
import {
  planCardLineLabel,
  planCardSecondaryLines,
} from "@/app/lib/plans/planOfferPresentation";

type PlanOfferCardProps = {
  offer: VesimOffer;
  isRegionalOrGlobal: boolean;
  price: ReactNode;
  buyControl: ReactNode;
  detailsControl: ReactNode;
  trustControl?: ReactNode;
};

/**
 * Presentational plan card — safe for Server Components.
 * Interactive bits (price, buy, details, trust) are passed as islands/slots.
 */
export default function PlanOfferCard({
  offer,
  isRegionalOrGlobal,
  price,
  buyControl,
  detailsControl,
  trustControl,
}: PlanOfferCardProps) {
  const secondaryLines = planCardSecondaryLines(offer, {
    isRegionalOrGlobal,
    formatValidity: formatValidityCardValue,
  });

  return (
    <article
      className="
        group flex h-full min-w-0 flex-col rounded-[22px]
        border border-[var(--border)] bg-[var(--surface)] p-4
        shadow-[0_10px_28px_rgba(0,0,0,0.2)]
        transition duration-200
        hover:-translate-y-1 hover:border-[var(--border-hover)]
        hover:shadow-[0_18px_40px_rgba(0,0,0,0.32)]
        sm:p-5 md:min-h-[220px]
      "
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <h3 className="min-w-0 break-words text-[1.65rem] font-bold leading-none tracking-tight text-[var(--heading)] sm:text-3xl">
          <span className="sr-only">Data </span>
          {offer.dataFormatted}
        </h3>
        <p className="shrink-0 text-right text-xl font-bold leading-none text-[var(--accent-strong)] sm:text-2xl">
          <span className="sr-only">Price </span>
          {price}
        </p>
      </div>

      {/*
        Card secondary copy MUST come only from
        planCardSecondaryLines — never packageInfo,
        description, notes, or raw network.
      */}
      <div className="mt-4 flex flex-col gap-1.5 text-sm md:flex-1">
        {secondaryLines.map((line) => (
          <p
            key={`${offer.id}-${line.kind}`}
            className={
              line.kind === "validity"
                ? "text-[var(--heading)]"
                : line.kind === "operator"
                  ? "truncate text-[var(--text-soft)]"
                  : line.kind === "voice"
                    ? "break-words text-[var(--text)]"
                    : "text-[var(--text)]"
            }
          >
            <span
              className={
                line.kind === "validity"
                  ? "font-semibold text-[var(--heading)]"
                  : "font-medium text-[var(--text-soft)]"
              }
            >
              {planCardLineLabel(line.kind)}
            </span>
            <span className="text-[var(--text-soft)]"> · </span>
            <span
              className={
                line.kind === "validity"
                  ? "font-medium"
                  : line.kind === "voice"
                    ? "break-words"
                    : undefined
              }
            >
              {line.text}
            </span>
          </p>
        ))}
      </div>

      <div className="mt-auto space-y-2.5 pt-3 md:pt-5">
        {/*
          Mobile (1-col): Buy Now first, Plan Details second.
          Wider (≥400px 2-col): Details left, Buy Now right.
        */}
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          {buyControl}
          {detailsControl}
        </div>
        {trustControl}
      </div>
    </article>
  );
}
