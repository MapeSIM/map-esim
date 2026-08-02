import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "CUSTOMER" | "ADMIN";
    } & DefaultSession["user"];
  }

  interface User {
    role?: "CUSTOMER" | "ADMIN";
    remember?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "CUSTOMER" | "ADMIN";
    credentialsChangedAt?: number;
  }
}
