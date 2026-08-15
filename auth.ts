import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { GoogleProfile } from "@auth/core/providers/google";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { normalizeEmail } from "@/app/lib/auth/email";
import {
  CREDENTIALS_AUTH_METHOD,
  GOOGLE_AUTH_METHOD,
  isGoogleProfileVerified,
} from "@/app/lib/auth/googleOAuth";
import {
  classifyGoogleSignInUser,
  resolveJwtSubject,
  shouldBlockSignedInGoogleLink,
} from "@/app/lib/auth/googleSessionIsolation";
import {
  deriveNeedsLegalConsent,
  loadConsentGateUser,
  resolveAuthMethod,
} from "@/app/lib/auth/legalConsentGate";
import { setAdminSessionEndedNotice } from "@/app/lib/auth/adminSession";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { MapEsimPrismaAdapter } from "@/app/lib/auth/prismaAdapter";
import { verifyPassword } from "@/app/lib/auth/password";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { prisma } from "@/app/lib/db";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  remember: z.string().optional(),
});

const SESSION_MAX_AGE_REMEMBER = 30 * 24 * 60 * 60;
const SESSION_MAX_AGE_DEFAULT = 24 * 60 * 60;

const googleConfigured = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
);

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  adapter: MapEsimPrismaAdapter(prisma),
  session: {
    strategy: "jwt",
    // Cookie upper bound; JWT `exp` is shortened when remember-me is off.
    maxAge: SESSION_MAX_AGE_REMEMBER,
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        remember: { label: "Remember", type: "text" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const email = normalizeEmail(parsed.data.email);
        const rate = consumeRateLimit({
          key: `signin:${email}`,
          limit: 10,
          windowMs: 15 * 60 * 1000,
        });
        if (!rate.ok) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        // Null passwordHash (OAuth-only) → same failure as unknown user.
        if (!user?.passwordHash) return null;
        if (user.deletedAt) return null;
        if (!user.emailVerifiedAt) return null;
        // Disabled admins must not sign in.
        if (user.role === "ADMIN" && user.adminDisabledAt) return null;

        const passwordHash = user.passwordHash;
        const valid = await verifyPassword(parsed.data.password, passwordHash);
        if (!valid) return null;

        // Single active ADMIN session: rotate generation before JWT is issued.
        if (user.role === "ADMIN") {
          await prisma.user.update({
            where: { id: user.id },
            data: { adminSessionVersion: { increment: 1 } },
          });
          await writeAuditLog({
            actorUserId: user.id,
            action: "admin.session_rotated",
            targetType: "User",
            targetId: user.id,
            metadata: { method: "credentials_signin" },
          });
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role === "ADMIN" ? "ADMIN" : "CUSTOMER",
          remember: parsed.data.remember === "1",
        };
      },
    }),
    ...(googleConfigured
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID!,
            clientSecret: process.env.AUTH_GOOGLE_SECRET!,
            // Phase 2B: never auto-link by email.
            allowDangerousEmailAccountLinking: false,
            authorization: {
              params: {
                scope: "openid email profile",
                prompt: "select_account",
              },
            },
            // Use default Google profile mapping so `email_verified` stays
            // available to the signIn callback as GoogleProfile.email_verified.
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") {
        return true;
      }

      const email = user.email ? normalizeEmail(user.email) : "";
      if (!email) {
        return false; // GOOGLE_MISSING_EMAIL
      }

      // Prefer raw Google OIDC `email_verified` on signIn `profile` (default
      // Google provider). Fallback: Auth.js mapped user.emailVerified Date.
      const rawVerified = isGoogleProfileVerified(
        profile as GoogleProfile | undefined
      );
      const userVerified =
        (user as { emailVerified?: Date | null }).emailVerified instanceof Date;
      if (!rawVerified && !userVerified) {
        return false; // GOOGLE_UNVERIFIED
      }

      // Defense-in-depth: never let Auth.js link a new Google identity onto an
      // already-signed-in MAP session (would merge ACCOUNT_B into ACCOUNT_A).
      const existingSession = await auth();
      if (existingSession?.user?.id && account.providerAccountId) {
        const linked = await prisma.account.findUnique({
          where: {
            provider_providerAccountId: {
              provider: "google",
              providerAccountId: account.providerAccountId,
            },
          },
          select: { userId: true },
        });
        if (
          shouldBlockSignedInGoogleLink({
            sessionUserId: existingSession.user.id,
            googleAccountAlreadyLinkedToUserId: linked?.userId,
          })
        ) {
          // Surface the same public error family as unlinked credentials.
          return "/signin?error=OAuthAccountNotLinked";
        }
      }

      const dbUser = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          role: true,
          deletedAt: true,
          emailVerifiedAt: true,
          accounts: {
            where: { provider: "google" },
            select: { id: true },
            take: 1,
          },
        },
      });

      const category = classifyGoogleSignInUser({
        userExists: Boolean(dbUser),
        deleted: Boolean(dbUser?.deletedAt),
        role: dbUser?.role,
        hasGoogleLinked: Boolean(dbUser?.accounts.length),
      });

      if (category === "NEW_USER") {
        return true; // GOOGLE_NEW_USER_ALLOWED
      }

      if (category === "DELETED") {
        return false; // GOOGLE_DELETED_DENIED
      }

      if (category === "ADMIN") {
        return false; // GOOGLE_ADMIN_DENIED
      }

      if (category === "UNLINKED_CUSTOMER") {
        // Continue — Auth.js emits OAuthAccountNotLinked (no auto-link).
        return true;
      }

      // LINKED_CUSTOMER — Null legal consent must not deny the OAuth callback.
      if (dbUser && !dbUser.emailVerifiedAt) {
        await prisma.user.update({
          where: { id: dbUser.id },
          data: { emailVerifiedAt: new Date() },
        });
      }
      return true;
    },
    async jwt({ token, user, account }) {
      const invalidate = () => ({
        ...token,
        sub: undefined,
        role: undefined,
        credentialsChangedAt: undefined,
        adminSessionVersion: undefined,
        needsLegalConsent: false,
        authMethod: undefined,
        exp: Math.floor(Date.now() / 1000) - 30,
      });

      const previousTokenSub =
        typeof token.sub === "string" ? token.sub : undefined;
      const { subject: userId, previousTokenUserReused } = resolveJwtSubject({
        accountProvider: account?.provider,
        currentUserId: user?.id,
        previousTokenSub,
      });

      if (!userId) {
        return token;
      }

      // Fresh Google/credentials callback: drop prior identity claims so a
      // previous ACCOUNT_A session cannot survive into ACCOUNT_B's token.
      if (account && user?.id) {
        token.sub = user.id;
        token.role = undefined;
        token.authMethod = undefined;
        token.needsLegalConsent = false;
        token.credentialsChangedAt = undefined;
        token.adminSessionVersion = undefined;
        // previousTokenUserReused ⇒ prior subject discarded (isolation).
        void previousTokenUserReused;
      }

      let dbUser: Awaited<ReturnType<typeof loadConsentGateUser>>;
      try {
        dbUser = await loadConsentGateUser(userId);
      } catch {
        // Fail closed — do not retain authorization when the user store is down.
        return invalidate();
      }

      if (!dbUser?.emailVerifiedAt || dbUser.deletedAt) {
        return invalidate();
      }

      // Disabled ADMIN: deny immediately (do not rely on middleware JWT alone).
      if (dbUser.role === "ADMIN" && dbUser.adminDisabledAt) {
        return invalidate();
      }

      // Snapshot prior claims before overwrite.
      const priorCredentialsChangedAt =
        typeof token.credentialsChangedAt === "number"
          ? token.credentialsChangedAt
          : 0;
      const priorAdminSessionVersion =
        typeof token.adminSessionVersion === "number"
          ? token.adminSessionVersion
          : null;

      const authMethod = resolveAuthMethod({
        accountProvider: account?.provider,
        rememberPresent: typeof user?.remember === "boolean",
        tokenAuthMethod:
          // On fresh provider sign-in, do not inherit prior authMethod.
          account
            ? undefined
            : token.authMethod === GOOGLE_AUTH_METHOD ||
                token.authMethod === CREDENTIALS_AUTH_METHOD
              ? token.authMethod
              : undefined,
        passwordHash: dbUser.passwordHash,
        hasGoogleAccount: dbUser.hasGoogleAccount,
      });

      token.sub = userId;
      token.role = dbUser.role === "ADMIN" ? "ADMIN" : "CUSTOMER";
      token.authMethod = authMethod;
      token.credentialsChangedAt =
        dbUser.credentialsChangedAt?.getTime() ?? 0;

      // Authoritative consent flag from DB on every issue/refresh.
      // Credentials users with historical null consent are never gated.
      token.needsLegalConsent = deriveNeedsLegalConsent(authMethod, dbUser);

      if (user?.id) {
        // Fresh login: stamp ADMIN session generation from DB (after authorize rotation).
        if (dbUser.role === "ADMIN") {
          token.adminSessionVersion = dbUser.adminSessionVersion;
        } else {
          token.adminSessionVersion = undefined;
        }
        // Credentials: honor remember-me. Google: intentional 30-day default.
        const maxAge =
          typeof user.remember === "boolean"
            ? user.remember
              ? SESSION_MAX_AGE_REMEMBER
              : SESSION_MAX_AGE_DEFAULT
            : SESSION_MAX_AGE_REMEMBER;
        token.exp = Math.floor(Date.now() / 1000) + maxAge;
        return token;
      }

      // Session refresh: ADMIN single-session — missing/mismatched generation fails closed.
      if (dbUser.role === "ADMIN") {
        if (
          priorAdminSessionVersion === null ||
          priorAdminSessionVersion !== dbUser.adminSessionVersion
        ) {
          await setAdminSessionEndedNotice();
          return invalidate();
        }
        token.adminSessionVersion = dbUser.adminSessionVersion;
      } else {
        token.adminSessionVersion = undefined;
      }

      // Session refresh: invalidate JWT when credentials changed after issue.
      const changedAt = dbUser.credentialsChangedAt?.getTime() ?? 0;
      const issuedAtMs =
        typeof token.iat === "number" ? token.iat * 1000 : 0;

      if (changedAt > 0) {
        if (
          priorCredentialsChangedAt > 0 &&
          changedAt > priorCredentialsChangedAt
        ) {
          return invalidate();
        }
        if (
          priorCredentialsChangedAt === 0 &&
          issuedAtMs > 0 &&
          changedAt > issuedAtMs
        ) {
          return invalidate();
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (!token.sub) {
        return {
          ...session,
          user: {
            id: "",
            email: null,
            name: null,
            image: null,
            role: "CUSTOMER" as const,
            needsLegalConsent: false,
            authMethod: undefined,
          },
        };
      }
      if (session.user) {
        session.user.id = token.sub;
        session.user.role = token.role === "ADMIN" ? "ADMIN" : "CUSTOMER";
        session.user.needsLegalConsent = Boolean(token.needsLegalConsent);
        session.user.authMethod =
          token.authMethod === GOOGLE_AUTH_METHOD
            ? GOOGLE_AUTH_METHOD
            : token.authMethod === CREDENTIALS_AUTH_METHOD
              ? CREDENTIALS_AUTH_METHOD
              : undefined;
      }
      return session;
    },
  },
});
