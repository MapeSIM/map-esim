"use client";

import { useEffect, useState } from "react";
import PartnerPortalLogin from "@/app/components/partner/PartnerPortalLogin";

const SESSION_KEY = "mapesim_sandbox_session";

export default function SandboxSessionGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      setAuthed(Boolean(raw));
    } catch {
      setAuthed(false);
    }
    setReady(true);
  }, []);

  // SSR + pre-hydration: show the same login as partneresim.com (no portal flash).
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
