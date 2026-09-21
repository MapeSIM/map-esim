"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { coerceAppRole } from "@/app/lib/auth/appRole";
import { navAuthLink } from "@/app/lib/auth/redirects";
import Navbar, { type NavbarCustomerSummary } from "./Navbar";

type SessionPayload = {
  user?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
    role?: string | null;
  } | null;
} | null;

/** Routes where login/logout redirects commonly land or start. */
const AUTH_FLOW_PATH =
  /^\/(signin|signup|oauth-consent|verify-email|verify-reset-code|forgot-password|reset-password|admin-setup-password)(\/|$)/i;

const PROTECTED_PREFIXES = [
  "/account",
  "/partner",
  "/admin",
  "/dashboard",
  "/oauth-consent",
] as const;

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Anonymous users: skip marketing-only path hops.
 * Always sync when authenticated, or when crossing auth/protected boundaries
 * (post-login / post-logout redirects).
 */
function shouldSyncOnPathnameChange(options: {
  previousPathname: string | null;
  nextPathname: string;
  knownAuthenticated: boolean;
}): boolean {
  if (options.knownAuthenticated) return true;
  const prev = options.previousPathname;
  const next = options.nextPathname;
  if (!prev) return true;
  if (AUTH_FLOW_PATH.test(prev) || AUTH_FLOW_PATH.test(next)) return true;
  if (isProtectedPath(prev) || isProtectedPath(next)) return true;
  return false;
}

/**
 * Client session island for the public shell (Phase 1: root layout stays
 * free of auth()/cookies() so marketing/catalog HTML can cache).
 *
 * Single-flight /api/auth/session sync:
 * - mount
 * - pathname change when authenticated or crossing auth/protected boundaries
 * - focus / visibility / pageshow when authenticated (anonymous skipped)
 * - next-auth BroadcastChannel (always — cross-tab login/logout)
 * - Sign out form submit (same-path soft redirect)
 *
 * user.id → always apply Account. Logged-out applies only for the latest request.
 */
export default function NavbarShell() {
  const pathname = usePathname() || "/";
  const [authHref, setAuthHref] = useState("/signin");
  const [authLabel, setAuthLabel] = useState("Sign in");
  const [customer, setCustomer] = useState<NavbarCustomerSummary | null>(null);
  const [partner, setPartner] = useState<NavbarCustomerSummary | null>(null);

  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const knownAuthenticatedRef = useRef(false);
  const previousPathnameRef = useRef<string | null>(null);

  const applyLoggedOut = useCallback(() => {
    knownAuthenticatedRef.current = false;
    setAuthHref("/signin");
    setAuthLabel("Sign in");
    setCustomer(null);
    setPartner(null);
  }, []);

  const applyAuthenticated = useCallback(
    (
      session: NonNullable<NonNullable<SessionPayload>["user"]> & { id: string }
    ) => {
      knownAuthenticatedRef.current = true;
      const sessionRole = coerceAppRole(session.role);
      const { href, label } = navAuthLink({
        userId: session.id,
        role: sessionRole,
      });
      setAuthHref(href);
      setAuthLabel(label);

      if (sessionRole === "CUSTOMER") {
        setCustomer({
          name: (session.name ?? "").trim() || "Customer",
          email: (session.email ?? "").trim(),
          walletBalanceLabel: null,
          walletCurrency: "USD",
        });
        setPartner(null);
        return;
      }

      if (sessionRole === "PARTNER") {
        setPartner({
          name: (session.name ?? "").trim() || "Partner",
          email: (session.email ?? "").trim(),
          walletBalanceLabel: null,
          walletCurrency: "USD",
        });
        setCustomer(null);
        return;
      }

      setCustomer(null);
      setPartner(null);
    },
    []
  );

  const syncSession = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    try {
      const res = await fetch(`/api/auth/session?_=${Date.now()}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      if (!res.ok) return;

      const session = (await res.json()) as SessionPayload;
      if (!mountedRef.current) return;

      const userId = String(session?.user?.id || "").trim();
      if (userId && session?.user) {
        // Authenticated: always apply — never drop for a newer in-flight request.
        applyAuthenticated({ ...session.user, id: userId });
        return;
      }

      // Logged-out: ignore stale responses superseded by a newer sync.
      if (requestId !== requestIdRef.current) return;
      applyLoggedOut();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      // Keep last known UI on transient errors.
    }
  }, [applyAuthenticated, applyLoggedOut]);

  // Lifetime: mount once for listeners; sync on mount via pathname effect.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    function onFocusOrVisible() {
      if (document.visibilityState && document.visibilityState !== "visible") {
        return;
      }
      // Anonymous: skip focus/visibility churn (BroadcastChannel covers cross-tab auth).
      if (!knownAuthenticatedRef.current) return;
      void syncSession();
    }

    function onPageShow() {
      if (!knownAuthenticatedRef.current) return;
      void syncSession();
    }

    /** Same-path Server Action logout — pathname may not change. */
    function onCaptureSubmit(event: Event) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const label = (form.textContent || "").replace(/\s+/g, " ").trim();
      if (!/sign out/i.test(label)) return;
      applyLoggedOut();
      void syncSession();
    }

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("next-auth");
      channel.addEventListener("message", () => {
        void syncSession();
      });
    } catch {
      // BroadcastChannel unavailable.
    }

    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("submit", onCaptureSubmit, true);

    return () => {
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("submit", onCaptureSubmit, true);
      channel?.close();
    };
  }, [applyLoggedOut, syncSession]);

  // Mount + selective path navigations (post-login / post-logout / authenticated).
  useEffect(() => {
    const previous = previousPathnameRef.current;
    previousPathnameRef.current = pathname;
    if (
      !shouldSyncOnPathnameChange({
        previousPathname: previous,
        nextPathname: pathname,
        knownAuthenticated: knownAuthenticatedRef.current,
      })
    ) {
      return;
    }
    void syncSession();
  }, [pathname, syncSession]);

  return (
    <Navbar
      authHref={authHref}
      authLabel={authLabel}
      customer={customer}
      partner={partner}
    />
  );
}
