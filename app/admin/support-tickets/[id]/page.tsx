import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/app/lib/auth/session";
import { getAdminOrderSupportTicketDetail } from "@/app/lib/support/orderSupportTicketAdmin";
import AdminSupportTicketActions from "@/app/components/admin/AdminSupportTicketActions";
import { AdminStatusPill } from "@/app/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminSupportTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("ADMIN");
  const { id } = await params;
  const ticket = await getAdminOrderSupportTicketDetail(id).catch(() => null);
  if (!ticket) notFound();

  return (
    <div className="mx-auto min-w-0 max-w-3xl space-y-6">
      <Link
        href="/admin/support-tickets"
        className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
      >
        ← Back to support tickets
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <AdminStatusPill value={ticket.statusLabel}>
            {ticket.statusLabel}
          </AdminStatusPill>
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            {ticket.actorLabel}
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          {ticket.subjectLabel}
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Submitted {ticket.createdAtLabel}
        </p>
      </header>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
        <h2 className="text-sm font-semibold text-[var(--heading)]">
          Order metadata
        </h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase text-[var(--text-soft)]">
              Order ID
            </dt>
            <dd className="mt-1 font-mono text-xs">{ticket.orderId}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-[var(--text-soft)]">
              Plan
            </dt>
            <dd className="mt-1">{ticket.planName || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-[var(--text-soft)]">
              ICCID
            </dt>
            <dd className="mt-1 font-mono text-xs">
              {ticket.iccid || "Not available"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-[var(--text-soft)]">
              Submitter
            </dt>
            <dd className="mt-1">
              {ticket.submittedBy.name || ticket.submittedBy.email}
            </dd>
          </div>
          {ticket.refundAmountLabel ? (
            <div>
              <dt className="text-xs font-semibold uppercase text-[var(--text-soft)]">
                Refund amount (snapshot)
              </dt>
              <dd className="mt-1 font-semibold">{ticket.refundAmountLabel}</dd>
            </div>
          ) : null}
        </dl>
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-[var(--text-soft)]">
            Details
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--heading)]">
            {ticket.details}
          </p>
        </div>
        {ticket.adminResolutionNote ? (
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
            <p className="text-xs font-semibold uppercase text-[var(--text-soft)]">
              Admin notes
            </p>
            <p className="mt-1">{ticket.adminResolutionNote}</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
        <h2 className="text-sm font-semibold text-[var(--heading)]">
          Admin review
        </h2>
        <div className="mt-3">
          <AdminSupportTicketActions
            ticketId={ticket.id}
            isOpen={ticket.isOpen}
            isRefundSubject={ticket.isRefundSubject}
          />
        </div>
      </section>

      <p className="text-sm">
        <Link
          href={`/admin/orders/${encodeURIComponent(ticket.orderId)}`}
          className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          Open order in admin
        </Link>
      </p>
    </div>
  );
}
