"use client";

import { useId } from "react";
import { Check, X } from "lucide-react";
import type { OrderSupportTicketSummary } from "@/app/lib/support/orderSupportTicket";
import {
  buildOrderSupportProgressModel,
  isOrderSupportTicketTerminalStatus,
  orderSupportStatusTone,
  orderSupportTicketPillLabel,
} from "@/app/lib/support/orderSupportTicketConstants";

type Props = {
  ticket: OrderSupportTicketSummary;
  orderId: string;
  planName: string | null;
  iccid: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the Raise an issue form when the current ticket is terminal. */
  onRaiseNewTicket?: () => void;
};

function shortOrderNumber(orderId: string): string {
  const trimmed = orderId.trim();
  if (trimmed.length <= 10) return trimmed;
  return trimmed.slice(-8).toUpperCase();
}

function pillClass(status: string): string {
  const tone = orderSupportStatusTone(status);
  switch (tone) {
    case "pending":
      return "border-amber-500/35 bg-amber-500/10 text-amber-200";
    case "review":
      return "border-sky-500/35 bg-sky-500/10 text-sky-200";
    case "info":
      return "border-violet-500/35 bg-violet-500/10 text-violet-200";
    case "resolved":
    case "refunded":
      return "border-emerald-500/35 bg-emerald-500/10 text-emerald-300";
    case "rejected":
      return "border-rose-500/35 bg-rose-500/10 text-rose-300";
    default:
      return "border-white/10 bg-white/5 text-slate-300";
  }
}

function defaultResolutionMessage(status: string): string | null {
  switch (status) {
    case "REFUNDED":
      return "Refund has been issued.";
    case "RESOLVED":
      return "This ticket has been resolved.";
    case "REJECTED":
      return "This ticket was rejected.";
    default:
      return null;
  }
}

export default function SupportTicketViewModal({
  ticket,
  orderId,
  planName,
  iccid,
  open,
  onOpenChange,
  onRaiseNewTicket,
}: Props) {
  const titleId = useId();
  if (!open) return null;

  const progress = buildOrderSupportProgressModel(ticket.status);
  const canRaiseNew = isOrderSupportTicketTerminalStatus(ticket.status);
  const resolutionText =
    (ticket.adminResolutionNote ?? "").trim() ||
    defaultResolutionMessage(ticket.status);
  const showResolution = Boolean(resolutionText);
  const displayPlan = planName || ticket.planName || "—";
  const displayIccid = iccid || ticket.iccid || "Not available";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(92vh,720px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0D1526] shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold text-slate-50">
            Support ticket
          </h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.1] text-slate-300 hover:bg-white/[0.04]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1 text-sm text-slate-300">
            <p>
              <span className="text-slate-500">Order: </span>
              <span className="font-medium text-slate-100">
                #{shortOrderNumber(orderId || ticket.orderId)}
              </span>
            </p>
            <p>
              <span className="text-slate-500">Plan: </span>
              <span className="font-medium text-slate-100">{displayPlan}</span>
            </p>
            <p>
              <span className="text-slate-500">ICCID: </span>
              <span className="break-all font-mono text-xs text-slate-200">
                {displayIccid}
              </span>
            </p>
          </div>

          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 text-base font-bold text-slate-50">
              {ticket.subjectLabel}
            </p>
            <span
              className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${pillClass(ticket.status)}`}
            >
              {orderSupportTicketPillLabel(ticket.status)}
            </span>
          </div>

          <div className="rounded-2xl border border-white/[0.1] bg-[#070D19] px-3 py-4 sm:px-4">
            <ol className="flex items-start justify-between gap-1">
              {progress.steps.map((step) => (
                <li
                  key={step.id}
                  className="flex min-w-0 flex-1 flex-col items-center text-center"
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                      step.state === "complete"
                        ? "bg-emerald-500 text-slate-950"
                        : step.state === "active"
                          ? "border-2 border-emerald-400 bg-emerald-500/15 text-emerald-300"
                          : "border border-white/15 bg-white/[0.04] text-slate-500"
                    }`}
                    aria-current={step.state === "active" ? "step" : undefined}
                  >
                    {step.state === "complete" ? (
                      <Check className="h-4 w-4" aria-hidden />
                    ) : (
                      step.index
                    )}
                  </span>
                  <span
                    className={`mt-2 text-[10px] font-semibold leading-tight sm:text-[11px] ${
                      step.state === "upcoming"
                        ? "text-slate-500"
                        : "text-slate-200"
                    }`}
                  >
                    {step.label}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-center text-sm text-slate-400">
              {progress.subtitle}
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.1] bg-[#070D19] px-3 py-3 sm:px-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              Submitted message
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
              {ticket.details || "—"}
            </p>
          </div>

          {showResolution ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 sm:px-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-emerald-300/90">
                Resolution
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-emerald-50">
                {resolutionText}
              </p>
            </div>
          ) : null}

          <p className="text-center text-xs text-slate-500">
            We typically review and resolve tickets within 48 hours.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 border-t border-white/[0.08] bg-[#0D1526] px-4 py-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-white/20 bg-white px-4 text-sm font-bold text-slate-950 transition hover:bg-slate-100"
          >
            Close
          </button>
          <button
            type="button"
            disabled={!canRaiseNew || !onRaiseNewTicket}
            onClick={() => {
              if (!canRaiseNew || !onRaiseNewTicket) return;
              onOpenChange(false);
              onRaiseNewTicket();
            }}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-emerald-500 px-4 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Raise new ticket
          </button>
        </div>
      </div>
    </div>
  );
}
