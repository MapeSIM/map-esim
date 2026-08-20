/**
 * Preload for official tsx CLIs that import Next.js server modules.
 * Stubs only packages that cannot load outside the Next runtime.
 * Does not stub auth/session, weaken seed gates, or change snapshot logic.
 *
 * Loaded via: tsx -r ./scripts/cli-next-runtime.cjs ...
 */
/* eslint-disable @typescript-eslint/no-require-imports -- CJS Module._load hook */
const Module = require("module");

if (!global.__MAP_ESIM_CLI_NEXT_RUNTIME__) {
  global.__MAP_ESIM_CLI_NEXT_RUNTIME__ = true;
  const originalLoad = Module._load;
  Module._load = function cliNextRuntimeLoad(request) {
    if (request === "server-only") {
      return {};
    }
    if (request === "next/cache") {
      return {
        revalidatePath: () => {},
        revalidateTag: () => {},
        unstable_cache: (fn) => fn,
      };
    }
    return originalLoad.apply(this, arguments);
  };
}
