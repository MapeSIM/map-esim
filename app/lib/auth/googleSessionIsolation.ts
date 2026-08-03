/**
 * Google OAuth session identity helpers.
 * Prevents a previous JWT subject from surviving a new OAuth callback.
 */

export type GoogleDbCategory =
  | "NEW_USER"
  | "LINKED_CUSTOMER"
  | "UNLINKED_CUSTOMER"
  | "ADMIN"
  | "DELETED";

export type JwtSubjectResolution = {
  /** User id that must become token.sub */
  subject: string | null;
  /** True when a prior token.sub differed from the current OAuth user (blocked). */
  previousTokenUserReused: boolean;
};

/**
 * On a fresh provider callback (account + user), identity MUST come from the
 * current OAuth/credentials user — never from a stale token.sub.
 * On session refresh (no account), keep the existing token subject.
 */
export function resolveJwtSubject(options: {
  accountProvider?: string | null;
  currentUserId?: string | null;
  previousTokenSub?: string | null;
}): JwtSubjectResolution {
  const current = options.currentUserId?.trim() || null;
  const previous = options.previousTokenSub?.trim() || null;
  const provider = options.accountProvider || null;

  if (provider && current) {
    return {
      subject: current,
      previousTokenUserReused: Boolean(previous && previous !== current),
    };
  }

  if (current) {
    return {
      subject: current,
      previousTokenUserReused: Boolean(previous && previous !== current),
    };
  }

  // Refresh path only — no new provider user in this callback.
  if (!provider && previous) {
    return { subject: previous, previousTokenUserReused: false };
  }

  return { subject: null, previousTokenUserReused: false };
}

/**
 * Classify a DB user for Google sign-in branching (safe labels only).
 */
export function classifyGoogleSignInUser(options: {
  userExists: boolean;
  deleted?: boolean;
  role?: string | null;
  hasGoogleLinked?: boolean;
}): GoogleDbCategory {
  if (!options.userExists) return "NEW_USER";
  if (options.deleted) return "DELETED";
  if (options.role === "ADMIN") return "ADMIN";
  if (options.hasGoogleLinked) return "LINKED_CUSTOMER";
  return "UNLINKED_CUSTOMER";
}

/**
 * Signed-in Google "Continue" must not link a brand-new Google identity onto
 * the current session user (Auth.js default linkAccount path).
 */
export function shouldBlockSignedInGoogleLink(options: {
  sessionUserId?: string | null;
  googleAccountAlreadyLinkedToUserId?: string | null;
}): boolean {
  const sessionUserId = options.sessionUserId?.trim() || null;
  if (!sessionUserId) return false;

  const linkedTo = options.googleAccountAlreadyLinkedToUserId?.trim() || null;
  // Not linked yet → Auth.js would attach it to the session user → block.
  if (!linkedTo) return true;
  // Linked to a different user → block.
  if (linkedTo !== sessionUserId) return true;
  return false;
}
