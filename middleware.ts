import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-map-pathname", req.nextUrl.pathname);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
});

export const config = {
  matcher: [
    "/account",
    "/account/:path*",
    "/admin",
    "/admin/:path*",
    "/partner",
    "/partner/:path*",
    "/oauth-consent",
    "/checkout",
    "/checkout/:path*",
    "/payment",
    "/payment/:path*",
  ],
};
