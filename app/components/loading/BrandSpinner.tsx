"use client";

import { useEffect, useState } from "react";

export type BrandSpinnerVariant = "inline" | "button" | "card" | "overlay" | "page";

type BrandSpinnerProps = {
  variant?: BrandSpinnerVariant;
  label?: string;
  /** Shown after ~4s when still loading. */
  slowNote?: string;
  className?: string;
  /** Force the slow note immediately (tests / demos). */
  forceSlowNote?: boolean;
};

const DEFAULT_SLOW_NOTE = "Fetching live data, almost there...";

/**
 * Brand-matched lime-green spinner for storefront, customer, partner, and admin.
 */
export default function BrandSpinner({
  variant = "inline",
  label,
  slowNote = DEFAULT_SLOW_NOTE,
  className = "",
  forceSlowNote = false,
}: BrandSpinnerProps) {
  const [showSlowNote, setShowSlowNote] = useState(forceSlowNote);

  useEffect(() => {
    if (forceSlowNote) {
      setShowSlowNote(true);
      return;
    }
    const timer = window.setTimeout(() => setShowSlowNote(true), 4000);
    return () => window.clearTimeout(timer);
  }, [forceSlowNote]);

  const ring = (
    <span
      className={`map-brand-spinner ${
        variant === "button" ? "map-brand-spinner--sm" : ""
      } ${variant === "page" || variant === "card" || variant === "overlay" ? "map-brand-spinner--lg" : ""}`}
      aria-hidden="true"
    />
  );

  if (variant === "button") {
    return (
      <span
        className={`inline-flex items-center justify-center gap-2 ${className}`}
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        {ring}
        {label ? <span>{label}</span> : <span className="sr-only">Loading…</span>}
      </span>
    );
  }

  if (variant === "inline") {
    return (
      <span
        className={`inline-flex items-center gap-2 text-sm text-[var(--text-muted)] ${className}`}
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        {ring}
        <span className="min-w-0">
          {label || "Loading…"}
          {showSlowNote ? (
            <span className="mt-0.5 block text-xs text-[var(--text-soft)]">
              {slowNote}
            </span>
          ) : null}
        </span>
      </span>
    );
  }

  const body = (
    <div
      className={`map-brand-loading-card ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {ring}
      <p className="mt-4 text-sm font-semibold text-[var(--heading)]">
        {label || "Loading…"}
      </p>
      {showSlowNote ? (
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">{slowNote}</p>
      ) : (
        <p className="mt-1.5 text-xs text-[var(--text-soft)]">Please wait</p>
      )}
    </div>
  );

  if (variant === "overlay") {
    return (
      <div className="map-brand-loading-overlay" aria-busy="true">
        {body}
      </div>
    );
  }

  if (variant === "page") {
    return (
      <div className="map-brand-loading-page" aria-busy="true">
        {body}
      </div>
    );
  }

  return body;
}
