import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Temporary Preview-only database probe for signin debugging.
 * Returns sanitized connectivity metadata only — never the connection string.
 */
export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ ok: false, error: "not_preview" }, { status: 404 });
  }

  const url = (process.env.DATABASE_URL || "").trim();
  const meta: {
    hasDatabaseUrl: boolean;
    databaseUrlLength: number;
    prefixOk: boolean;
    host: string | null;
    port: string | null;
    sslmode: string | null;
  } = {
    hasDatabaseUrl: Boolean(url),
    databaseUrlLength: url.length,
    prefixOk: /^postgres(ql)?:\/\//.test(url),
    host: null,
    port: null,
    sslmode: null,
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

  const prisma = new PrismaClient({
    datasources: { db: { url } },
  });

  try {
    const started = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    await prisma.user.findFirst({ select: { id: true } });
    return NextResponse.json({
      ok: true,
      stage: "query",
      meta,
      latencyMs: Date.now() - started,
    });
  } catch (error) {
    const err = error as { name?: string; code?: string; message?: string };
    return NextResponse.json(
      {
        ok: false,
        stage: "query",
        meta,
        error: {
          name: err?.name || "Error",
          code: err?.code || null,
          message: String(err?.message || error).slice(0, 300),
        },
      },
      { status: 503 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
