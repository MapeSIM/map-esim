import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import AdminPackageShareControls from "@/app/components/admin/AdminPackageShareControls";
import { requireRole } from "@/app/lib/auth/session";
import {
  listAdminAssignmentDestinations,
  listAdminAssignmentOffers,
} from "@/app/lib/esim/adminPackageAssignmentRead";
import { sanitizeCountryHint } from "@/app/lib/vesim/server";

export const dynamic = "force-dynamic";

/**
 * Admin package list for a destination — Copy Link uses existing
 * packageShareLink helpers (offerId + destination code). No purchase created.
 */
export default async function AdminCountryPackagesPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  await requireRole("ADMIN");
  const { code: rawCode } = await params;
  const code = sanitizeCountryHint(decodeURIComponent((rawCode ?? "").trim()));
  if (!code) notFound();

  let destination: Awaited<
    ReturnType<typeof listAdminAssignmentDestinations>
  >[number] | null = null;
  let offers: Awaited<ReturnType<typeof listAdminAssignmentOffers>> = [];
  let loadError = false;

  try {
    const destinations = await listAdminAssignmentDestinations();
    destination =
      destinations.find((d) => d.code.toUpperCase() === code.toUpperCase()) ??
      destinations.find((d) => d.code.toLowerCase() === code.toLowerCase()) ??
      null;
    offers = await listAdminAssignmentOffers(code);
  } catch {
    loadError = true;
    offers = [];
  }

  if (!loadError && !destination && offers.length === 0) {
    notFound();
  }

  const title = destination?.name ?? code;
  const flag = destination?.flag;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/countries"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          ← Back to Countries
        </Link>
        <div className="mt-4 flex min-w-0 items-center gap-3">
          {flag ? (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <Image
                src={flag}
                alt=""
                width={36}
                height={24}
                sizes="36px"
                className="h-6 w-auto object-cover"
              />
            </span>
          ) : null}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--heading)]">
              {title}
            </h1>
            <p className="mt-1 font-mono text-xs text-[var(--text-soft)]">
              {code}
            </p>
          </div>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-[var(--text-muted)]">
          Copy a customer checkout link for any package. The link uses the same
          buy deep link as catalog Buy Now (offerId + country code). No order is
          created when you copy.
        </p>
      </div>

      {loadError ? (
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            Packages are temporarily unavailable. Please try again shortly.
          </p>
        </div>
      ) : offers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-6 text-sm text-[var(--text-muted)]">
          No packages available for this destination.
        </div>
      ) : (
        <ul className="space-y-3">
          {offers.map((offer) => (
            <li key={offer.offerId}>
              <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-[var(--heading)] break-words">
                    {offer.name}
                  </h2>
                  <p className="mt-2 text-sm text-[var(--heading)]">
                    {offer.dataLabel}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {offer.validityLabel}
                  </p>
                  <p className="mt-2 text-xs text-[var(--text-soft)]">
                    Retail {offer.costLabel}
                  </p>
                </div>
                <AdminPackageShareControls
                  offerId={offer.offerId}
                  country={code}
                  destination={offer.destinationLabel || title}
                  planName={offer.name}
                  dataAllowance={offer.dataLabel}
                  validity={offer.validityLabel}
                />
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
