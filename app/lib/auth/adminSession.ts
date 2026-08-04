/**
 * Best-effort flash notice when an ADMIN JWT is invalidated by a newer login.
 * Never stores tokens, emails, or device details.
 */

export const ADMIN_SESSION_NOTICE_COOKIE = "mapesim_admin_session_notice";

export const ADMIN_SESSION_ENDED_MESSAGE =
  "Your admin session ended because this account was signed in elsewhere.";

export async function setAdminSessionEndedNotice(): Promise<void> {
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    jar.set(ADMIN_SESSION_NOTICE_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 120,
      secure: process.env.NODE_ENV === "production",
    });
  } catch {
    // Notice is optional — JWT invalidation remains authoritative.
  }
}

export async function consumeAdminSessionEndedNotice(): Promise<boolean> {
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    const value = jar.get(ADMIN_SESSION_NOTICE_COOKIE)?.value;
    if (value !== "1") return false;
    jar.delete(ADMIN_SESSION_NOTICE_COOKIE);
    return true;
  } catch {
    return false;
  }
}
