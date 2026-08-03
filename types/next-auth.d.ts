import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "CUSTOMER" | "ADMIN";
      needsLegalConsent?: boolean;
      authMethod?: "google" | "credentials";
    } & DefaultSession["user"];
  }

  interface User {
    role?: "CUSTOMER" | "ADMIN";
    remember?: boolean;
    needsLegalConsent?: boolean;
    authMethod?: "google" | "credentials";
  }
}


declare module "next-auth/jwt" {
  interface JWT {
    role?: "CUSTOMER" | "ADMIN";
    credentialsChangedAt?: number;
    needsLegalConsent?: boolean;
    authMethod?: "google" | "credentials";
  }
}
