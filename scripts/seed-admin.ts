/**
 * One-time MAP eSIM admin bootstrap (server terminal only).
 *
 * Never hardcodes credentials. Never prints password or password hash.
 * Not invoked by build, install, migrate, or deployment.
 *
 * Required env (set in .env.local — never commit real values):
 *   DATABASE_URL
 *   INITIAL_ADMIN_NAME
 *   INITIAL_ADMIN_EMAIL
 *   INITIAL_ADMIN_PASSWORD
 *
 * Usage:
 *   npm run admin:seed
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient, Role } from "@prisma/client";
import {
  hashPassword,
  isAdminPasswordValid,
} from "../app/lib/auth/password";

// Official Next.js loader — must run before reading process.env.
loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function requireEnv(name: string): string {
  const value = (process.env[name] || "").trim();
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const name = requireEnv("INITIAL_ADMIN_NAME");
  const emailRaw = requireEnv("INITIAL_ADMIN_EMAIL");
  const password = requireEnv("INITIAL_ADMIN_PASSWORD");

  const email = normalizeEmail(emailRaw);
  if (!email.includes("@")) {
    console.error("INITIAL_ADMIN_EMAIL must be a valid email address.");
    process.exit(1);
  }

  if (!isAdminPasswordValid(password, email)) {
    console.error(
      "INITIAL_ADMIN_PASSWORD must meet the ADMIN password policy (10–128 characters, upper, lower, number, special character, no leading/trailing spaces, must not equal the email)."
    );
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });

  if (existing) {
    if (existing.role === Role.ADMIN) {
      console.log(
        "Admin already exists for the configured email. No changes made."
      );
      return;
    }

    console.error(
      "Configured email already belongs to a CUSTOMER account. Manual review required. No changes made."
    );
    process.exit(1);
  }

  const now = new Date();
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: Role.ADMIN,
      emailVerifiedAt: now,
      credentialsChangedAt: now,
    },
    select: { id: true },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "admin.bootstrap_seeded",
      targetType: "User",
      targetId: user.id,
      metadata: { method: "initial_admin_env" },
    },
  });

  console.log(
    "Admin bootstrap complete. ADMIN account created for the configured email."
  );
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : "seed_failed";
    // Never echo env values or hashes — keep the message short.
    console.error(`Admin bootstrap failed: ${message.slice(0, 200)}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
