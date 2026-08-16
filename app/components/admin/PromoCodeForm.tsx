"use client";

import { useActionState, useId } from "react";
import { PromoDiscountType } from "@prisma/client";
import {
  createPromoCodeAction,
  initialPromoAdminState,
  updatePromoCodeAction,
  type PromoAdminActionState,
} from "@/app/lib/promo/promoAdminActions";
import type { PromoAdminDetail } from "@/app/lib/promo/promoAdmin";

type Props = {
  mode: "create" | "edit";
  initial?: PromoAdminDetail | null;
};

function FieldError({
  state,
  field,
}: {
  state: PromoAdminActionState;
  field: string;
}) {
  if (state.ok !== false || !state.fieldErrors?.[field]) return null;
  return (
    <span className="mt-1 block text-xs text-red-700 dark:text-red-300">
      {state.fieldErrors[field]}
    </span>
  );
}

export default function PromoCodeForm({ mode, initial }: Props) {
  const formId = useId();
  const action = mode === "create" ? createPromoCodeAction : updatePromoCodeAction;
  const [state, formAction, pending] = useActionState(
    action,
    initialPromoAdminState
  );

  return (
    <form action={formAction} className="grid gap-4">
      {mode === "edit" && initial ? (
        <input type="hidden" name="promoId" value={initial.id} />
      ) : null}

      <label className="block text-sm">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
          Code
        </span>
        <input
          name="code"
          required
          minLength={3}
          maxLength={30}
          defaultValue={initial?.code ?? ""}
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm uppercase text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
        />
        <FieldError state={state} field="code" />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
          Description
        </span>
        <input
          name="description"
          maxLength={240}
          defaultValue={initial?.description ?? ""}
          className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
        />
        <FieldError state={state} field="description" />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Discount type
          </span>
          <select
            name="discountType"
            defaultValue={initial?.discountType ?? PromoDiscountType.PERCENT}
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          >
            <option value={PromoDiscountType.PERCENT}>Percent</option>
            <option value={PromoDiscountType.FIXED_USD}>Fixed USD</option>
          </select>
          <FieldError state={state} field="discountType" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Discount value
          </span>
          <input
            name="discountValue"
            required
            defaultValue={initial?.discountValueInput ?? ""}
            placeholder="20 or 3.00"
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          />
          <FieldError state={state} field="discountValue" />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-[var(--heading)]">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={initial?.isActive ?? true}
        />
        Active
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Start date
          </span>
          <input
            type="datetime-local"
            name="startsAt"
            defaultValue={initial?.startsAtInput ?? ""}
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          />
          <FieldError state={state} field="startsAt" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            End date
          </span>
          <input
            type="datetime-local"
            name="endsAt"
            defaultValue={initial?.endsAtInput ?? ""}
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          />
          <FieldError state={state} field="endsAt" />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Total limit
          </span>
          <input
            name="totalUsageLimit"
            inputMode="numeric"
            defaultValue={initial?.totalUsageLimit ?? ""}
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          />
          <FieldError state={state} field="totalUsageLimit" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Per-customer limit
          </span>
          <input
            name="perCustomerUsageLimit"
            inputMode="numeric"
            defaultValue={initial?.perCustomerUsageLimit ?? ""}
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          />
          <FieldError state={state} field="perCustomerUsageLimit" />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
          Minimum order (USD)
        </span>
        <input
          name="minimumOrder"
          defaultValue={initial?.minimumOrderInput ?? ""}
          placeholder="0.00"
          className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
        />
        <FieldError state={state} field="minimumOrderCents" />
      </label>

      <label className="flex items-center gap-2 text-sm text-[var(--heading)]">
        <input
          type="checkbox"
          name="firstOrderOnly"
          defaultChecked={initial?.firstOrderOnly ?? false}
        />
        First order only
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
          Destination applicability
        </span>
        <textarea
          name="destinations"
          rows={3}
          defaultValue={initial?.destinationsInput ?? ""}
          placeholder="Leave empty for all destinations. Example: PK US"
          className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
        />
        <FieldError state={state} field="destinations" />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
          Plan / offer applicability
        </span>
        <textarea
          name="offers"
          rows={3}
          defaultValue={initial?.offersInput ?? ""}
          placeholder="Leave empty for all plans. One offer id per line."
          className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
        />
        <FieldError state={state} field="offers" />
      </label>

      {state.ok === false ? (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {state.error}
        </p>
      ) : state.ok === true && state.message ? (
        <p className="text-sm font-medium text-[var(--accent-strong)]" role="status">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] disabled:opacity-60"
      >
        {pending
          ? "Saving…"
          : mode === "create"
            ? "Create promo"
            : "Save promo"}
      </button>
      <span id={formId} className="sr-only">
        Promo form
      </span>
    </form>
  );
}
