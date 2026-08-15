import type { DefaultSession } from "next-auth";
import type { AppRole } from "@/app/lib/auth/appRole";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: AppRole;
      needsLegalConsent?: boolean;
      authMethod?: "google" | "credentials";
    } & DefaultSession["user"];
  }

  interface User {
    role?: AppRole;
    remember?: boolean;
    needsLegalConsent?: boolean;
    authMethod?: "google" | "credentials";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: AppRole;
    credentialsChangedAt?: number;
    /** ADMIN-only single-session generation; never exposed on Session. */
    adminSessionVersion?: number;
    needsLegalConsent?: boolean;
    authMethod?: "google" | "credentials";
  }
}
