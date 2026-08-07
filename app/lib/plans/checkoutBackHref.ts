import { countries as staticCountries } from "@/app/data/countries";
import { slugifyDestination } from "@/app/lib/vesim/destinations";

const GENERIC_BUY_HREF = "/account/esim/buy";

/**
 * Safe back target from checkout to the originating country plans page.
 * Never trusts client-supplied return URLs — only destination code/name
 * already verified and stored on the purchase (or a known static catalog id).
 */
export function resolveCheckoutBackHref(options: {
  destinationCode?: string | null;
  destinationName?: string | null;
}): { href: string; label: string } {
  const code = (options.destinationCode ?? "").trim().toUpperCase();
  const name = (options.destinationName ?? "").trim();

  if (code) {
    const byCode = staticCountries.find(
      (item) => item.code.toUpperCase() === code
    );
    if (byCode?.id && /^[a-z0-9-]+$/.test(byCode.id)) {
      return {
        href: `/countries/${byCode.id}`,
        label: `← Back to ${byCode.name} plans`,
      };
    }
  }

  if (name && name.toLowerCase() !== "not available") {
    const byName = staticCountries.find(
      (item) =>
        slugifyDestination(item.name) === slugifyDestination(name) ||
        item.id === slugifyDestination(name)
    );
    if (byName?.id && /^[a-z0-9-]+$/.test(byName.id)) {
      return {
        href: `/countries/${byName.id}`,
        label: `← Back to ${byName.name} plans`,
      };
    }

    const slug = slugifyDestination(name);
    if (slug && /^[a-z0-9-]+$/.test(slug) && slug.length <= 80) {
      return {
        href: `/countries/${slug}`,
        label: `← Back to ${name} plans`,
      };
    }
  }

  return {
    href: GENERIC_BUY_HREF,
    label: "← Back to package selection",
  };
}
