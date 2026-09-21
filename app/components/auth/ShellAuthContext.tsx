"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ShellAuthSnapshot = {
  /** True when NavbarShell has applied an authenticated session user. */
  signedIn: boolean;
  /** True when the authenticated role is PARTNER. */
  isPartner: boolean;
};

type ShellAuthContextValue = ShellAuthSnapshot & {
  setShellAuth: (next: ShellAuthSnapshot) => void;
};

const DEFAULT_SNAPSHOT: ShellAuthSnapshot = {
  signedIn: false,
  isPartner: false,
};

const ShellAuthContext = createContext<ShellAuthContextValue>({
  ...DEFAULT_SNAPSHOT,
  setShellAuth: () => {},
});

/**
 * Shares NavbarShell session state with catalog islands so plan pages do not
 * duplicate /api/auth/session fetches. Does not change auth/security policy.
 */
export function ShellAuthProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<ShellAuthSnapshot>(DEFAULT_SNAPSHOT);
  const value = useMemo<ShellAuthContextValue>(
    () => ({
      ...snapshot,
      setShellAuth: setSnapshot,
    }),
    [snapshot]
  );
  return (
    <ShellAuthContext.Provider value={value}>{children}</ShellAuthContext.Provider>
  );
}

export function useShellAuth(): ShellAuthSnapshot {
  const { signedIn, isPartner } = useContext(ShellAuthContext);
  return { signedIn, isPartner };
}

export function useShellAuthPublisher(): (next: ShellAuthSnapshot) => void {
  return useContext(ShellAuthContext).setShellAuth;
}
