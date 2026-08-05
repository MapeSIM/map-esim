/** Shared validation limits for the public contact form. */

export const CONTACT_NAME_MIN = 2;
export const CONTACT_NAME_MAX = 80;
export const CONTACT_EMAIL_MAX = 254;
export const CONTACT_SUBJECT_MIN = 3;
export const CONTACT_SUBJECT_MAX = 160;
export const CONTACT_MESSAGE_MIN = 10;
export const CONTACT_MESSAGE_MAX = 4000;

/** Max successful/attempted submissions per IP window. */
export const CONTACT_RATE_LIMIT_MAX = 5;
export const CONTACT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/** Suppress identical content resubmits. */
export const CONTACT_DEDUP_WINDOW_MS = 15 * 60 * 1000;
