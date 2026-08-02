import { prisma } from "@/app/lib/db";
import { requireSession } from "@/app/lib/auth/session";

export default async function AccountOrdersPage() {
  const user = await requireSession();

  // Only orders explicitly linked to this user ID — never by email alone.
  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      providerOrderId: true,
      planName: true,
      destination: true,
      status: true,
      createdAt: true,
      claimStatus: true,
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">My Orders</h1>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Guest purchases are not attached automatically. Claiming by verified
        email arrives in a later phase.
      </p>

      {orders.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]">
          No linked orders yet. After checkout, use your secure order email or
          success link for installation details.
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {orders.map((order) => (
            <li
              key={order.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm"
            >
              <p className="font-semibold">
                {order.planName || "eSIM plan"}
              </p>
              <p className="mt-1 text-[var(--text-muted)]">
                {order.destination || "Destination"} · {order.status}
              </p>
              <p className="mt-1 text-xs text-[var(--text-soft)]">
                Provider ref ending …{order.providerOrderId.slice(-8)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
