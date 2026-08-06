/**
 * Stubs for running server-only reconciliation services outside Next.js.
 * Loaded via: npx tsx -r ./scripts/smoke-stubs/register.cjs ...
 */
const Module = require("module");

const originalLoad = Module._load;
Module._load = function smokeStubLoad(request, parent, isMain) {
  if (request === "server-only") {
    return {};
  }
  if (request === "next/headers") {
    return {
      headers: async () => ({
        get(name) {
          const n = String(name).toLowerCase();
          if (n === "sec-fetch-site") return "same-origin";
          if (n === "origin") return "http://localhost:3000";
          if (n === "host") return "localhost:3000";
          if (n === "x-forwarded-host") return "localhost:3000";
          return null;
        },
      }),
    };
  }
  return originalLoad.apply(this, arguments);
};
