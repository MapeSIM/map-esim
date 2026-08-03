import type { Adapter, AdapterUser } from "@auth/core/adapters";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { Role, type PrismaClient, type User } from "@prisma/client";
import { normalizeEmail } from "@/app/lib/auth/email";

/**
 * Auth.js uses `emailVerified`; MAP eSIM stores `emailVerifiedAt`.
 * This wrapper maps those fields and enforces CUSTOMER-only OAuth creates.
 */
function toAdapterUser(user: User): AdapterUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    emailVerified: user.emailVerifiedAt,
  };
}

export function MapEsimPrismaAdapter(prisma: PrismaClient): Adapter {
  const base = PrismaAdapter(prisma);

  return {
    ...base,
    async createUser(data) {
      const email = normalizeEmail(String(data.email || ""));
      if (!email) {
        throw new Error("OAuth user email is required");
      }

      // Auth.js Google default profile sets emailVerified when email_verified.
      const emailVerifiedAt =
        data.emailVerified instanceof Date ? data.emailVerified : null;

      const created = await prisma.user.create({
        data: {
          name: (data.name || "").trim() || "MAP eSIM Customer",
          email,
          image: data.image ?? null,
          passwordHash: null,
          role: Role.CUSTOMER,
          emailVerifiedAt,
          // Legal consent captured on /oauth-consent after first Google login.
        },
      });

      // Standard AdapterUser shape (includes emailVerified for Auth.js).
      return toAdapterUser(created);
    },

    async updateUser(data) {
      const existing = await prisma.user.findUnique({
        where: { id: data.id },
        select: {
          id: true,
          deletedAt: true,
          passwordHash: true,
          role: true,
        },
      });

      if (!existing || existing.deletedAt) {
        throw new Error("User not found");
      }

      const updated = await prisma.user.update({
        where: { id: data.id },
        data: {
          ...(data.name != null
            ? { name: data.name.trim() || "MAP eSIM Customer" }
            : {}),
          ...(data.email != null ? { email: normalizeEmail(data.email) } : {}),
          ...(data.image !== undefined ? { image: data.image } : {}),
          ...(data.emailVerified !== undefined
            ? { emailVerifiedAt: data.emailVerified }
            : {}),
          // Never change role, passwordHash, deletedAt, or legal consent here.
        },
      });

      return toAdapterUser(updated);
    },

    async getUser(id) {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user || user.deletedAt) return null;
      return toAdapterUser(user);
    },

    async getUserByEmail(email) {
      const user = await prisma.user.findUnique({
        where: { email: normalizeEmail(email) },
      });
      if (!user || user.deletedAt) return null;
      return toAdapterUser(user);
    },

    async getUserByAccount(providerAccountId) {
      const account = await prisma.account.findUnique({
        where: { provider_providerAccountId: providerAccountId },
        include: { user: true },
      });
      if (!account?.user || account.user.deletedAt) return null;
      return toAdapterUser(account.user);
    },
  };
}
