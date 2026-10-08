import {
  ADD_DATA_EXPIRED_BANNER_BODY,
  ADD_DATA_EXPIRED_BANNER_TITLE,
  ADD_DATA_TOPUP_BANNER_TITLE,
  addDataTopUpBannerBody,
  type AddDataCheckoutBannerVariant,
} from "@/app/lib/esim/addDataCheckoutBannerShared";

type Props = {
  variant: AddDataCheckoutBannerVariant;
  /** Last 4 ICCID digits for top-up copy — never full ICCID. */
  iccidLast4?: string | null;
};

/**
 * Prominent Add Data / checkout intent banner (top-up vs expired → new eSIM).
 */
export default function AddDataCheckoutBanner({
  variant,
  iccidLast4 = null,
}: Props) {
  if (variant === "expired") {
    return (
      <div
        className="rounded-2xl border border-amber-500/45 bg-amber-500/12 px-4 py-3.5 sm:px-5"
        role="status"
        data-add-data-banner="expired"
      >
        <p className="text-sm font-bold tracking-tight text-amber-950 dark:text-amber-100">
          {ADD_DATA_EXPIRED_BANNER_TITLE}
        </p>
        <p className="mt-1.5 text-sm text-amber-950/85 dark:text-amber-50/90">
          {ADD_DATA_EXPIRED_BANNER_BODY}
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border border-sky-500/40 bg-sky-500/12 px-4 py-3.5 sm:px-5"
      role="status"
      data-add-data-banner="topup"
    >
      <p className="text-sm font-bold tracking-tight text-sky-950 dark:text-sky-100">
        {ADD_DATA_TOPUP_BANNER_TITLE}
      </p>
      <p className="mt-1.5 text-sm text-sky-950/85 dark:text-sky-50/90">
        {addDataTopUpBannerBody(iccidLast4)}
      </p>
    </div>
  );
}
