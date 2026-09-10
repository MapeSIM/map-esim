/**
 * Preview-only Partner password set/update.
 *
 * Safety:
 * - Refuses Production fingerprint (user prefix 8e9b5fcaa648d171…)
 * - Targets a single email (argv)
 * - Never prints password or hash
 * - Default: only sets password when passwordHash is missing
 * - --force requires PREVIEW_PASSWORD_FORCE=YES
 *
 * Usage (Preview DATABASE_URL already in env):
 *   PREVIEW_PARTNER_PASSWORD='...' node scripts/preview-set-partner-password.js partner-sandbox@mapesim.com
 *   PREVIEW_PARTNER_PASSWORD='...' PREVIEW_PASSWORD_FORCE=YES node scripts/preview-set-partner-password.js partner-sandbox@mapesim.com --force
 */
const path = require("path");
const { createRequire } = require("module");
const requireFromProject = createRequire(path.resolve(__dirname, "../package.json"));
const { PrismaClient, Role } = requireFromProject("@prisma/client");
const bcrypt = requireFromProject("bcryptjs");

const BCRYPT_COST = 12;
const PROD_PREFIX = "8e9b5fcaa648d171";

async function main() {
  const email = String(process.argv[2] || "")
    .trim()
    .toLowerCase();
  const force = process.argv.includes("--force");
  if (!email || !email.includes("@")) {
    console.error(
      "USAGE: PREVIEW_PARTNER_PASSWORD=... node scripts/preview-set-partner-password.js <email> [--force]"
    );
    process.exit(1);
  }

  const raw = process.env.DATABASE_URL || "";
  if (!raw) {
    console.error("DATABASE_URL_MISSING");
    process.exit(2);
  }
  const u = new URL(raw);
  const userPrefix = (u.username || "").slice(0, 16);
  if (userPrefix.startsWith(PROD_PREFIX)) {
    console.error("REFUSING_PRODUCTION_FINGERPRINT");
    process.exit(3);
  }
  if (force && process.env.PREVIEW_PASSWORD_FORCE !== "YES") {
    console.error("REFUSING_FORCE_WITHOUT_PREVIEW_PASSWORD_FORCE=YES");
    process.exit(4);
  }

  const password = process.env.PREVIEW_PARTNER_PASSWORD || "";
  if (password.length < 6 || password.length > 128) {
    console.error("INVALID_PASSWORD_LENGTH");
    process.exit(5);
  }

  console.log(
    "db_target host=" +
      u.hostname +
      " user_prefix=" +
      userPrefix +
      " db=" +
      (u.pathname || "").replace(/^\//, "").split("?")[0]
  );

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        role: true,
        passwordHash: true,
        emailVerifiedAt: true,
        deletedAt: true,
        partnerProfile: { select: { id: true, disabledAt: true } },
      },
    });

    if (!user) {
      console.error("USER_NOT_FOUND");
      process.exit(6);
    }
    if (user.role !== Role.PARTNER) {
      console.error("REFUSING_NON_PARTNER_ROLE=" + user.role);
      process.exit(7);
    }
    if (!user.partnerProfile) {
      console.error("REFUSING_MISSING_PARTNER_PROFILE");
      process.exit(8);
    }
    if (user.partnerProfile.disabledAt != null) {
      console.error("REFUSING_DISABLED_PARTNER");
      process.exit(9);
    }
    if (user.deletedAt != null) {
      console.error("REFUSING_DELETED_USER");
      process.exit(10);
    }
    if (user.passwordHash && !force) {
      console.log("passwordHash_exists=YES");
      console.log("NO_CHANGE (use --force + PREVIEW_PASSWORD_FORCE=YES to overwrite)");
      process.exit(0);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const now = new Date();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        credentialsChangedAt: now,
        emailVerifiedAt: user.emailVerifiedAt ?? now,
      },
    });

    console.log("password_updated=YES");
    console.log("force=" + (force ? "YES" : "NO"));
    console.log("emailVerifiedAt_ensured=YES");
    console.log("user_id_prefix=" + user.id.slice(0, 8));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("FAILED", e instanceof Error ? e.name : typeof e);
  process.exit(1);
});
