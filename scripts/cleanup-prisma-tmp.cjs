/**
 * Remove Prisma generate lock leftovers (*.tmp*) from .prisma/client.
 * These inflate Next.js NFT / Vercel function tracing when present.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const clientDir = path.join(
  __dirname,
  "..",
  "node_modules",
  ".prisma",
  "client"
);

function cleanupDir(dir) {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.includes(".tmp")) continue;
    const full = path.join(dir, name);
    try {
      const st = fs.lstatSync(full);
      if (st.isFile() || st.isSymbolicLink()) {
        fs.unlinkSync(full);
        removed += 1;
      }
    } catch {
      // Best-effort: locked files on Windows may fail; next generate cleans up.
    }
  }
  return removed;
}

const removed = cleanupDir(clientDir);
if (removed > 0) {
  console.log(`[cleanup-prisma-tmp] removed ${removed} file(s) from ${clientDir}`);
}
