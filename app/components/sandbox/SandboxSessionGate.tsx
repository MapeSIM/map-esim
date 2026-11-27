"use client";

import { useEffect, useState } from "react";
import PartnerPortalLogin from "@/app/components/partner/PartnerPortalLogin";
import {
  SANDBOX_API_KEY_KEY,
  SANDBOX_WALLET_KEY,
} from "@/app/lib/sandbox/sandboxClientStorage";

type MeResponse = {
  ok: boolean;
  partner?: {
    id: string;
    name: string;
    email: string;
    balanceCents: number;
  };
};

type AuthSession = {
  user?: { role?: string | null } | null;
};

export default function SandboxSessionGate({
  children,
  allowAdminWithoutPartner = false,
}: {
  children: React.ReactNode;
  /** When true, Auth.js ADMIN can view hub without Neon partner cookie. */
  allowAdminWithoutPartner?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const [sessionRes, partnerRes] = await Promise.all([
          allowAdminWithoutPartner
            ? fetch("/api/auth/session", {
                credentials: "same-origin",
                cache: "no-store",
              }).catch(() => null)
            : Promise.resolve(null),
          fetch("/api/sandbox/session", {
            credentials: "same-origin",
            cache: "no-store",
          }),
        ]);

        let admin = false;
        if (sessionRes?.ok) {
          const session = (await sessionRes.json()) as AuthSession;
          admin = session?.user?.role === "ADMIN";
        }

        const data = (await partnerRes.json()) as MeResponse & {
          apiKey?: string | null;
        };
        if (cancelled) return;

        if (data.ok && data.partner) {
          try {
            localStorage.setItem(
              SANDBOX_WALLET_KEY,
              String(data.partner.balanceCents)
            );
            localStorage.setItem(
              "mapesim_sandbox_session",
              JSON.stringify({
                email: data.partner.email,
                name: data.partner.name,
                id: data.partner.id,
                at: Date.now(),
              })
            );
            if (data.apiKey?.startsWith("sb_test_")) {
              localStorage.setItem(SANDBOX_API_KEY_KEY, data.apiKey);
            }
          } catch {
            /* ignore */
          }
          setAuthed(true);
        } else if (admin && allowAdminWithoutPartner) {
          setAuthed(true);
        } else {
          setAuthed(false);
        }
      } catch {
        if (!cancelled) setAuthed(false);
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [allowAdminWithoutPartner]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070D19] px-4 text-sm text-slate-400">
        Loading sandbox…
      </div>
    );
  }

  if (!authed) {
    return (
      <PartnerPortalLogin
        mode="sandbox"
        retailHref="/?__domain=mapesim.com"
        onSandboxAuthenticated={() => setAuthed(true)}
      />
    );
  }

  return <>{children}</>;
}

/** Cache issued API key in localStorage for playground / catalog buys. */
export function cacheSandboxApiKey(rawKey: string | undefined | null) {
  if (!rawKey || typeof window === "undefined") return;
  try {
    localStorage.setItem(SANDBOX_API_KEY_KEY, rawKey);
  } catch {
    /* ignore */
  }
}
