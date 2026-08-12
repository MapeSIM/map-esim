/**
 * CLI- and server-safe recipient format check.
 * Kept out of `@/app/lib/vesim/server` so email tooling (e.g. `email:test`)
 * does not import `server-only` VeSIM environment modules.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
