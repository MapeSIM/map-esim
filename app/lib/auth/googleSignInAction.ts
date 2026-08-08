"use server";

import { AuthError } from "next-auth";
import { auth, signIn, signOut } from "@/auth";
import { safeCallbackPath } from "@/app/lib/auth/redirects";
import { readRequestOrigin } from "@/app/lib/auth/requestOrigin";

/**
 * Starts Google OAuth. Credentials stay in env; never logged.
 * redirectTo is validated to an internal path only.
 *
 * Always clears any existing MAP session first so Auth.js cannot link the
 * chosen Google identity onto a previously signed-in user (account isolation).
 */
export async function googleSignInAction(formData: FormData): Promise<void> {
  const rawCallback = String(formData.get("callbackUrl") || "");
  const requestOrigin = await readRequestOrigin();
  const redirectTo = safeCallbackPath(rawCallback, "/", { requestOrigin });

  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    // Fall through to Auth.js Configuration error on the sign-in page.
  }

  try {
    const existing = await auth();
    if (existing?.user?.id) {
      // Clear JWT cookie before starting OAuth (no redirect).
      await signOut({ redirect: false });
    }

    await signIn("google", { redirectTo });
  } catch (error) {
    if (error instanceof AuthError) {
      // NEXT_REDIRECT is thrown as success for OAuth redirects — rethrow others.
    }
    throw error;
  }
}
