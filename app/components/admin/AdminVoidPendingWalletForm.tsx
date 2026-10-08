import { voidPendingWalletReservationAction } from "@/app/lib/admin/walletPendingVoidActions";
import { AdminButton } from "@/app/components/admin/ui";

export function AdminVoidPendingWalletForm(props: {
  customerUserId: string;
  walletTransactionId: string;
  returnTo: string;
  compact?: boolean;
}) {
  const customerUserId = props.customerUserId.trim();
  const walletTransactionId = props.walletTransactionId.trim();
  const returnTo = props.returnTo.trim();

  return (
    <form
      action={voidPendingWalletReservationAction}
      className={
        props.compact
          ? "mt-2 max-w-[14rem] space-y-2"
          : "shrink-0 space-y-2"
      }
    >
      <input type="hidden" name="customerUserId" value={customerUserId} />
      <input
        type="hidden"
        name="walletTransactionId"
        value={walletTransactionId}
      />
      <input type="hidden" name="returnTo" value={returnTo} />
      <label className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
        <input
          type="checkbox"
          name="confirm"
          className="mt-0.5"
          required
        />
        <span>Confirm void / restore wallet balance</span>
      </label>
      <AdminButton type="submit" variant="danger" size="sm">
        Void / Cancel pending
      </AdminButton>
    </form>
  );
}
