/** Pure helpers — safe for client components. */

import { isShareSurfacePath } from "@/app/lib/share/shareSurface";

/**
 * Hide public marketing navbar/footer on dedicated workspace surfaces
 * (partner portal, admin, share pages) to avoid double chrome.
 */
export function shouldHidePublicSiteChrome(pathname: string): boolean {
  const path = (pathname || "/").split("?")[0].split("#")[0] || "/";
  if (isShareSurfacePath(path)) return true;
  if (path === "/partner" || path.startsWith("/partner/")) return true;
  if (path === "/admin" || path.startsWith("/admin/")) return true;
  if (path === "/admin-setup-password" || path.startsWith("/admin-setup-password/")) {
    return true;
  }
  return false;
}
