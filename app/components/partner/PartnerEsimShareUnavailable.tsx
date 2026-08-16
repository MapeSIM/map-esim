import { BRAND_NAME } from "@/app/lib/brand";
import { SHARE_PAGE_UNAVAILABLE_MESSAGE } from "@/app/lib/share/shareSurface";

export default function PartnerEsimShareUnavailable() {
  return (
    <div
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
      role="status"
    >
      <h1 className="text-xl font-bold text-[var(--heading)]">
        {BRAND_NAME}
      </h1>
      <p className="mt-3 text-sm text-[var(--text-muted)]">
        {SHARE_PAGE_UNAVAILABLE_MESSAGE}
      </p>
    </div>
  );
}
