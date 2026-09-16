/**
 * Idempotent install hook: guarantees `ssrf-guard` tolerates CJS
 * `require()` calls.
 *
 * Root sources compile to CJS under tsx (root package.json has no
 * `"type"`), so the worker drain (`tsx scripts/assessment-worker-drain.ts`)
 * reaches `ssrf-guard` through `require()`. Published 1.0.0 revisions have
 * flapped between exports maps with and without the `require` condition;
 * without it the drain crashes at import time with
 * ERR_PACKAGE_PATH_NOT_EXPORTED. Adding the condition points at the same
 * ESM build Node already loads via `import` (require(esm) on Node ≥22),
 * so this is a no-op for bundlers and ESM consumers. Safe to re-run:
 * revisions that already carry the condition are left untouched.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PKG_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "node_modules",
  "ssrf-guard",
  "package.json",
);

function main() {
  if (!fs.existsSync(PKG_PATH)) {
    console.log("[postinstall] ssrf-guard not installed, skipping exports fix");
    return;
  }
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
  const wants = {
    ".": "./dist/core/index.mjs",
    "./node": "./dist/node/index.mjs",
  };
  let changed = false;
  for (const [key, file] of Object.entries(wants)) {
    const entry = pkg.exports?.[key];
    if (entry && typeof entry === "object" && !entry.require) {
      entry.require = file;
      changed = true;
    }
  }
  if (!changed) {
    console.log("[postinstall] ssrf-guard exports already ok");
    return;
  }
  fs.writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log("[postinstall] ssrf-guard exports patched with require condition");
}

main();
