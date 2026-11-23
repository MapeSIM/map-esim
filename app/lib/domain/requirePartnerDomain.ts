import "server-only";

import { NextResponse } from "next/server";
import { readAppDomain } from "@/app/lib/domain/readAppDomain";

/**
 * Partner API docs downloads are partneresim.com-only.
 * Returns a Response to short-circuit the route, or null when allowed.
 */
export async function rejectUnlessPartnerDomain(): Promise<NextResponse | null> {
  const domain = await readAppDomain();
  if (domain === "partner") return null;
  return NextResponse.json(
    {
      success: false,
      error: "Partner API docs are available on partneresim.com only.",
    },
    { status: 404 }
  );
}
