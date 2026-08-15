/**
 * Prevent open redirects after sign-in.
 * Only same-site/internal paths are allowed.
 */

export type SafeCallbackOptions = {
  /** Current request origin (e.g. from Host / x-forwarded-*). */
  requestOrigin?: string | null;
  /** Extra allowed origins (AUTH_URL / APP_BASE_URL), already normalized. */
  allowedOrigins?: readonly string[] | null;
};

function tryOrigin(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Origins trusted for absolute callbackUrl values (never foreign sites). */
export function collectAllowedCallbackOrigins(
  options?: SafeCallbackOptions
): string[] {
  const out: string[] = [];
  const push = (origin: string | null) => {
    if (origin && !out.includes(origin)) out.push(origin);
  };
  push(tryOrigin(options?.requestOrigin));
  for (const origin of options?.allowedOrigins ?? []) {
    push(tryOrigin(origin));
  }
  // Env allowlist — safe for edge/server; never trusts the callback host alone.
  push(tryOrigin(typeof process !== "undefined" ? process.env?.AUTH_URL : null));
  push(
    tryOrigin(typeof process !== "undefined" ? process.env?.APP_BASE_URL : null)
  );
  push(
    tryOrigin(
      typeof process !== "undefined" ? process.env?.NEXTAUTH_URL : null
    )
  );
  return out;
}

function isSafeInternalPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("://") || path.includes("\\")) return false;
  if (/[\u0000-\u001F\u007F]/.test(path)) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(path)) return false;
  return true;
}

/**
 * Normalize a post-login callback to an internal path (+ query).
 * Absolute URLs are accepted only for allowlisted same-site origins and
 * are reduced to pathname + search (never navigates to a foreign origin).
 */
export function safeCallbackPath(
  callbackUrl: string | null | undefined,
  fallback: string,
  options?: SafeCallbackOptions
): string {
  if (!callbackUrl) return fallback;
  const value = callbackUrl.trim();
  if (!value) return fallback;

  // Protocol-relative / scheme abuse
  if (value.startsWith("//")) return fallback;
  if (/^(javascript|data|vbscript):/i.test(value)) return fallback;

  let path = value;

  if (!value.startsWith("/")) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return fallback;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return fallback;
    }
    const allowed = collectAllowedCallbackOrigins(options);
    if (!allowed.includes(parsed.origin)) {
      return fallback;
    }
    path = `${parsed.pathname}${parsed.search}`;
  }

  if (!isSafeInternalPath(path)) return fallback;
  return path;
}

export function postSignInPath(role: "CUSTOMER" | "ADMIN" | "PARTNER"): string {
  // Normal customer sign-in lands on public home. Protected flows still
  // honor a safe internal callbackUrl via resolvePostSignInPath.
  if (role === "ADMIN") return "/admin";
  if (role === "PARTNER") return "/partner";
  return "/";
}

/**
 * Resolve where to send the user after credentials sign-in.
 * Honors a safe internal callbackUrl only if the role may access it.
 */
export function resolvePostSignInPath(
  role: "CUSTOMER" | "ADMIN" | "PARTNER",
  callbackUrl?: string | null,
  options?: SafeCallbackOptions
): string {
  const fallback = postSignInPath(role);
  const safe = safeCallbackPath(callbackUrl, "", options);
  if (!safe) return fallback;

  if (safe === "/admin" || safe.startsWith("/admin/")) {
    return role === "ADMIN" ? safe : fallback;
  }
  if (safe === "/partner" || safe.startsWith("/partner/")) {
    return role === "PARTNER" ? safe : fallback;
  }
  if (safe === "/account" || safe.startsWith("/account/")) {
    if (role === "CUSTOMER") return safe;
    if (role === "ADMIN") return safe;
    return fallback;
  }

  return safe;
}

export function navAuthLink(options: {
  userId?: string | null;
  role?: "CUSTOMER" | "ADMIN" | "PARTNER" | null;
}): { href: string; label: string } {
  if (!options.userId) {
    return { href: "/signin", label: "Sign in" };
  }
  if (options.role === "ADMIN") {
    return { href: "/admin", label: "Admin" };
  }
  if (options.role === "PARTNER") {
    return { href: "/partner", label: "Partner" };
  }
  return { href: "/account", label: "Account" };
}

/** Build the wallet-buy return path that preserves offer/country hints. */
export function buildWalletBuyReturnPath(input: {
  offerId?: string | null;
  country?: string | null;
}): string {
  const params = new URLSearchParams();
  const offerId = (input.offerId ?? "").trim();
  const country = (input.country ?? "").trim();
  if (offerId && offerId.length <= 120 && /^[A-Za-z0-9._:-]+$/.test(offerId)) {
    params.set("offerId", offerId);
  }
  if (country && country.length <= 64 && /^[A-Za-z0-9._-]+$/.test(country)) {
    params.set("country", country);
  }
  const qs = params.toString();
  return qs ? `/account/esim/buy?${qs}` : "/account/esim/buy";
}
