import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import { listAdminOrderSupportTickets } from "@/app/lib/support/orderSupportTicketAdmin";
import {
  ORDER_SUPPORT_TICKET_SUBJECTS,
  orderSupportSubjectLabel,
} from "@/app/lib/support/orderSupportTicketConstants";
import { AdminButton, AdminStatusPill } from "@/app/components/admin/ui";

export const dynamic = "force-dynamic";

function hrefFor(filters: {
  actor?: string;
  subject?: string;
  status?: string;
}): string {
  const params = new URLSearchParams();
  if (filters.actor && filters.actor !== "all") params.set("actor", filters.actor);
  if (filters.subject) params.set("subject", filters.subject);
  if (filters.status) params.set("status", filters.status);
  const qs = params.toString();
  return qs ? `/admin/support-tickets?${qs}` : "/admin/support-tickets";
}

export default async function AdminSupportTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{
    actor?: string;
    subject?: string;
    status?: string;
  }>;
}) {
  await requireRole("ADMIN");
  const query = await searchParams;
  const actorRaw = (query.actor ?? "all").trim().toLowerCase();
  const actor =
    actorRaw === "customer" || actorRaw === "partner" ? actorRaw : "all";
  const subject = (query.subject ?? "").trim() || null;
  const status = (query.status ?? "").trim() || null;

  let rows: Awaited<ReturnType<typeof listAdminOrderSupportTickets>> = [];
  let loadError = false;
  try {
    rows = await listAdminOrderSupportTickets({
      actor,
      subject,
      status,
      limit: 50,
    });
  } catch {
    loadError = true;
  }

  return (
    <div className="min-w-0 space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Support tickets</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Partner and Customer &quot;Raise issue&quot; tickets. Refund subjects
          require explicit Approve (one-time wallet credit) or Reject — never
          auto-credit on submit.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "all", label: "All" },
            { id: "partner", label: "Partner" },
            { id: "customer", label: "Customer" },
          ] as const
        ).map((f) => (
          <AdminButton
            key={f.id}
            href={hrefFor({ actor: f.id, subject: subject ?? undefined, status: status ?? undefined })}
            variant={actor === f.id ? "primary" : "secondary"}
            size="sm"
          >
            {f.label}
          </AdminButton>
        ))}
      </div>

      <form className="flex flex-wrap gap-2" method="get">
        {actor !== "all" ? (
          <input type="hidden" name="actor" value={actor} />
        ) : null}
        <select
          name="subject"
          defaultValue={subject ?? ""}
          className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
        >
          <option value="">All subjects</option>
          {ORDER_SUPPORT_TICKET_SUBJECTS.map((id) => (
            <option key={id} value={id}>
              {orderSupportSubjectLabel(id)}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status ?? ""}
          className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
        >
          <option value="">All statuses</option>
          <option value="OPEN">Open / Pending</option>
          <option value="PENDING_REVIEW">Pending review</option>
          <option value="IN_REVIEW">In Review</option>
          <option value="INFO_REQUIRED">Info Required</option>
          <option value="RESOLVED">Resolved</option>
          <option value="REJECTED">Rejected</option>
          <option value="REFUNDED">Refunded</option>
        </select>
        <button
          type="submit"
          className="inline-flex h-10 items-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold"
        >
          Filter
        </button>
      </form>

      {loadError ? (
        <p className="text-sm text-[var(--heading)]">
          Support tickets are temporarily unavailable.
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--border-strong)] p-6 text-sm text-[var(--text-muted)]">
          No tickets match these filters.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminStatusPill
                      value={row.statusLabel}
                      tone={
                        row.status === "REFUNDED" || row.status === "RESOLVED"
                          ? "success"
                          : row.status === "REJECTED"
                            ? "critical"
                            : "high"
                      }
                    >
                      {row.statusLabel}
                    </AdminStatusPill>
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                      {row.actorLabel}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-[var(--heading)]">
                    {row.subjectLabel}
                  </p>
                  <p className="text-sm text-[var(--text-muted)]">
                    {row.planName || "Plan"} · Order{" "}
                    <span className="font-mono text-xs">{row.orderId}</span>
                  </p>
                  <p className="line-clamp-2 text-sm text-[var(--text-muted)]">
                    {row.details}
                  </p>
                  <p className="text-xs text-[var(--text-soft)]">
                    {row.submitterEmail} · {row.createdAtLabel}
                    {row.refundAmountLabel
                      ? ` · ${row.refundAmountLabel}`
                      : ""}
                  </p>
                </div>
                <Link
                  href={row.href}
                  className="inline-flex h-9 items-center rounded-xl bg-[var(--accent)] px-3 text-sm font-semibold text-[var(--accent-ink)]"
                >
                  Review
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
