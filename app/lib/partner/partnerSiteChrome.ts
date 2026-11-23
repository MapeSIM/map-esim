/** Pure helpers — safe for client components. */

import type { AppDomain } from "@/app/lib/domain/appDomain";
import { isShareSurfacePath } from "@/app/lib/share/shareSurface";

/**
 * Hide public marketing navbar/footer on dedicated workspace surfaces
 * (partner portal, admin, share pages, sandbox) and on the B2B / sandbox hosts.
 */
export function shouldHidePublicSiteChrome(
  pathname: string,
  domain?: AppDomain | null
): boolean {
  // Entire partneresim.com + mapesim.store hosts are dedicated workspaces.
  if (domain === "partner" || domain === "sandbox") return true;

  const path = (pathname || "/").split("?")[0].split("#")[0] || "/";
  if (isShareSurfacePath(path)) return true;
  // mapesim.com /partner/* uses the customer-account shell WITH retail chrome
  // (6a9cf44). Do not hide Navbar/Footer/WhatsApp on retail partner routes.
  if (path === "/admin" || path.startsWith("/admin/")) return true;
  if (
    path === "/admin-setup-password" ||
    path.startsWith("/admin-setup-password/")
  ) {
    return true;
  }
  if (path === "/sandbox" || path.startsWith("/sandbox/")) return true;
  return false;
}
