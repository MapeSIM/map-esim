/**
 * Preview-only read of a Partner user. Never prints secrets or hashes.
 * Usage: DATABASE_URL must already be Preview. node scripts/preview-check-partner-user.js <email>
 */
const { PrismaClient, Role } = require("@prisma/client");

async function main() {
  const email = String(process.argv[2] || "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) {
    console.error("USAGE: node scripts/preview-check-partner-user.js <email>");
    process.exit(1);
  }

  const raw = process.env.DATABASE_URL || "";
  if (!raw) {
    console.error("DATABASE_URL_MISSING");
    process.exit(2);
  }
  const u = new URL(raw);
  const userPrefix = (u.username || "").slice(0, 16);
  if (userPrefix.startsWith("8e9b5fcaa648d171")) {
    console.error("REFUSING_PRODUCTION_FINGERPRINT");
    process.exit(3);
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
        email: true,
        role: true,
        passwordHash: true,
        emailVerifiedAt: true,
        deletedAt: true,
        partnerProfile: {
          select: { id: true, disabledAt: true },
        },
      },
    });

    if (!user) {
      console.log("user_exists=NO");
      process.exit(0);
    }

    console.log("user_exists=YES");
    console.log("role=" + user.role);
    console.log("role_is_PARTNER=" + (user.role === Role.PARTNER ? "YES" : "NO"));
    console.log(
      "PartnerProfile_exists=" + (user.partnerProfile ? "YES" : "NO")
    );
    console.log(
      "passwordHash_exists=" + (user.passwordHash ? "YES" : "NO")
    );
    console.log(
      "emailVerifiedAt_exists=" + (user.emailVerifiedAt ? "YES" : "NO")
    );
    console.log(
      "disabledAt_null=" +
        (user.partnerProfile
          ? user.partnerProfile.disabledAt == null
            ? "YES"
            : "NO"
          : "N/A")
    );
    console.log("deletedAt_null=" + (user.deletedAt == null ? "YES" : "NO"));
    console.log("user_id_prefix=" + user.id.slice(0, 8));
    if (user.partnerProfile) {
      console.log(
        "partner_id_prefix=" + user.partnerProfile.id.slice(0, 8)
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("FAILED", e instanceof Error ? e.name : typeof e);
  process.exit(1);
});
