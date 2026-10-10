import { WhatsAppPendingOrdersPanel } from "@/app/components/admin/WhatsAppPendingOrdersPanel";
import { assertAdminPermission } from "@/app/lib/admin/adminPermissionAccess";
import { listWhatsAppPendingOrders } from "@/app/lib/admin/whatsappCheckoutFulfillment";
import { requireRole } from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminWhatsAppOrdersPage() {
  const admin = await requireRole("ADMIN");
  await assertAdminPermission(admin.id, [
    "ESIM_FULFILLMENT",
    "ORDERS_VIEW",
    "ORDERS_MANAGE",
  ]);

  let orders: Awaited<ReturnType<typeof listWhatsAppPendingOrders>> = [];
  let loadError: string | null = null;
  try {
    orders = await listWhatsAppPendingOrders();
  } catch {
    loadError = "Could not load WhatsApp pending orders right now.";
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          WhatsApp Pending Orders
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">
          Manual fulfillment hub for Buy via WhatsApp checkouts. Verify the
          customer paid on WhatsApp, then issue the eSIM (company-funded
          provider path + confirmation email). Existing wallet/gateway flows are
          unchanged.
        </p>
      </header>

      {loadError ? (
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-6"
          role="alert"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            {loadError}
          </p>
        </div>
      ) : (
        <WhatsAppPendingOrdersPanel orders={orders} />
      )}
    </div>
  );
}
