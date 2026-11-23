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

export default function SandboxSessionGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch("/api/sandbox/session", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = (await res.json()) as MeResponse;
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
          } catch {
            /* ignore */
          }
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
  }, []);

  if (!ready || !authed) {
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
