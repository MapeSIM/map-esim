import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Temporary Preview-only database probe for signin debugging.
 * Uses the same Prisma singleton as auth signin.
 * Returns sanitized connectivity metadata only — never the connection string.
 */
export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ ok: false, error: "not_preview" }, { status: 404 });
  }

  const url = (process.env.DATABASE_URL || "").trim();
  const meta = {
    hasDatabaseUrl: Boolean(url),
    databaseUrlLength: url.length,
    prefixOk: /^postgres(ql)?:\/\//.test(url),
    host: null as string | null,
    port: null as string | null,
    sslmode: null as string | null,
    hasAuthSecret: Boolean((process.env.AUTH_SECRET || "").trim()),
    authSecretLength: (process.env.AUTH_SECRET || "").trim().length,
    hasAuthUrl: Boolean((process.env.AUTH_URL || "").trim()),
    authUrlHost: null as string | null,
  };

  if (meta.prefixOk) {
    try {
      const parsed = new URL(url.replace(/^postgres(ql)?:/, "http:"));
      meta.host = parsed.hostname;
      meta.port = parsed.port || "5432";
      meta.sslmode = parsed.searchParams.get("sslmode");
    } catch {
      meta.prefixOk = false;
    }
  }

  const authUrl = (process.env.AUTH_URL || "").trim();
  if (authUrl) {
    try {
      meta.authUrlHost = new URL(authUrl).host;
    } catch {
      meta.authUrlHost = "invalid";
    }
  }

  if (!meta.prefixOk) {
    return NextResponse.json(
      {
        ok: false,
        stage: "env",
        meta,
        error: {
          name: "MissingOrInvalidDatabaseUrl",
          message: "DATABASE_URL missing or not a postgres URL",
        },
      },
      { status: 503 }
    );
  }

  try {
    const started = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    // Same call shape as signinAction.
    await prisma.user.findUnique({
      where: { email: "probe-nonexistent@example.com" },
      select: {
        id: true,
        role: true,
        passwordHash: true,
        emailVerifiedAt: true,
        deletedAt: true,
      },
    });
    return NextResponse.json({
      ok: true,
      stage: "signin_shaped_query",
      meta,
      latencyMs: Date.now() - started,
      singleton: true,
    });
  } catch (error) {
    const err = error as { name?: string; code?: string; message?: string };
    return NextResponse.json(
      {
        ok: false,
        stage: "signin_shaped_query",
        meta,
        error: {
          name: err?.name || "Error",
          code: err?.code || null,
          message: String(err?.message || error).slice(0, 300),
        },
      },
      { status: 503 }
    );
  }
}
