import { redirect } from "next/navigation";
import { auth } from "@/auth";

export async function getSessionUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name || "",
    email: session.user.email || "",
    role: (session.user.role === "ADMIN" ? "ADMIN" : "CUSTOMER") as
      | "CUSTOMER"
      | "ADMIN",
  };
}

export async function requireSession(callbackPath = "/account") {
  const user = await getSessionUser();
  if (!user) {
    const safe = callbackPath.startsWith("/") ? callbackPath : "/account";
    redirect(`/signin?callbackUrl=${encodeURIComponent(safe)}`);
  }
  return user;
}

export async function requireRole(role: "CUSTOMER" | "ADMIN") {
  const callbackPath = role === "ADMIN" ? "/admin" : "/account";
  const user = await requireSession(callbackPath);
  if (user.role !== role) {
    if (role === "ADMIN") {
      redirect("/account");
    }
    redirect("/signin");
  }
  return user;
}

export function privateNoStoreHeaders(): HeadersInit {
  return {
    "Cache-Control": "private, no-store",
    Pragma: "no-cache",
  };
}
