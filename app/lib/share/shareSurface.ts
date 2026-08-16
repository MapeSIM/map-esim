/** Pure helpers for the public /share/<token> surface. Safe for client + QA. */

export function isShareSurfacePath(pathname: string): boolean {
  const path = (pathname || "/").split("?")[0].split("#")[0] || "/";
  return path === "/share" || path.startsWith("/share/");
}

export const SHARE_PAGE_UNAVAILABLE_MESSAGE =
  "This share link is unavailable.";
