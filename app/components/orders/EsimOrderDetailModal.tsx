"use client";

import { useEffect, useId, type ReactNode } from "react";
import EsimOrderDetailCard, {
  type EsimOrderDetailCardProps,
} from "@/app/components/orders/EsimOrderDetailCard";

type Props = Omit<EsimOrderDetailCardProps, "variant" | "onClose"> & {
  open: boolean;
  onClose: () => void;
  /** Optional backdrop content (e.g. dimmed page). */
  children?: ReactNode;
};

/**
 * Modal shell around the shared VeSIM-style Order Details card.
 * Focus-trap is lightweight (Escape + backdrop click); body scroll locked while open.
 */
export default function EsimOrderDetailModal({
  open,
  onClose,
  children,
  ...cardProps
}: Props) {
  const titleId = useId();
  void titleId;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return children ?? null;

  return (
    <>
      {children}
      <div
        className="fixed inset-0 z-[80] flex items-end justify-center bg-black/65 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:items-center sm:p-6"
        role="presentation"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Order details"
          className="w-full min-w-0 max-w-lg"
          onClick={(event) => event.stopPropagation()}
        >
          <EsimOrderDetailCard
            {...cardProps}
            variant="modal"
            onClose={onClose}
          />
        </div>
      </div>
    </>
  );
}
