import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { normalizeEmail } from "@/app/lib/auth/email";
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

async function loadAuthUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      emailVerifiedAt: true,
      credentialsChangedAt: true,
      deletedAt: true,
    },
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
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
        if (!user?.passwordHash) return null;
        if (user.deletedAt) return null;
        if (!user.emailVerifiedAt) return null;

        const valid = await verifyPassword(
          parsed.data.password,
          user.passwordHash
        );
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role === "ADMIN" ? "ADMIN" : "CUSTOMER",
          remember: parsed.data.remember === "1",
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      const invalidate = () => ({
        ...token,
        sub: undefined,
        role: undefined,
        credentialsChangedAt: undefined,
        exp: Math.floor(Date.now() / 1000) - 30,
      });

      if (user?.id) {
        const dbUser = await loadAuthUser(user.id);
        if (!dbUser?.emailVerifiedAt || dbUser.deletedAt) {
          return invalidate();
        }
        token.sub = user.id;
        token.role = dbUser.role === "ADMIN" ? "ADMIN" : "CUSTOMER";
        token.credentialsChangedAt =
          dbUser.credentialsChangedAt?.getTime() ?? 0;
        const maxAge = user.remember
          ? SESSION_MAX_AGE_REMEMBER
          : SESSION_MAX_AGE_DEFAULT;
        token.exp = Math.floor(Date.now() / 1000) + maxAge;
        return token;
      }

      if (token.sub) {
        const dbUser = await loadAuthUser(token.sub);
        if (!dbUser?.emailVerifiedAt || dbUser.deletedAt) {
          return invalidate();
        }

        const changedAt = dbUser.credentialsChangedAt?.getTime() ?? 0;
        const tokenChangedAt =
          typeof token.credentialsChangedAt === "number"
            ? token.credentialsChangedAt
            : 0;
        const issuedAtMs =
          typeof token.iat === "number" ? token.iat * 1000 : 0;

        if (changedAt > 0) {
          if (tokenChangedAt > 0 && changedAt > tokenChangedAt) {
            return invalidate();
          }
          if (tokenChangedAt === 0 && issuedAtMs > 0 && changedAt > issuedAtMs) {
            return invalidate();
          }
        }

        token.role = dbUser.role === "ADMIN" ? "ADMIN" : "CUSTOMER";
        token.credentialsChangedAt = changedAt;
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
          },
        };
      }
      if (session.user) {
        session.user.id = token.sub;
        session.user.role = token.role === "ADMIN" ? "ADMIN" : "CUSTOMER";
      }
      return session;
    },
  },
});
