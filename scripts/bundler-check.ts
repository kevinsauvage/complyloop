import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Post-build bundler sanity check: verifies the files the runtime scans need
 * on Vercel actually shipped in a function trace. Without this, the only
 * signal that `axe.min.js` is missing is a masked "Runtime scan failed." at
 * runtime.
 *
 * Reads the findings-detail page trace (a consumer of the scan stack via the
 * remediation-verify re-checks in finding-page actions). The required assets
 * arrive via the global `outputFileTracingIncludes` in `next.config.ts`, so
 * any route trace proves the include — this page is picked because it
 * exercises the scan path. Runs after `next build` in `verify:gate`.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRACE = path.join(
  ROOT,
  ".next/server/app/(app)/findings/[id]/page.js.nft.json",
);

/** Required path basenames — the trace relativizes differently across builds. */
const REQUIRED_BASENAMES = ["axe.min.js", "browsers.json"];

function main(): void {
  const errors: string[] = [];
  if (!fs.existsSync(TRACE)) {
    errors.push(`worker trace not found: ${TRACE} (run next build first)`);
    process.exitCode = 1;
    return;
  }
  const trace = JSON.parse(fs.readFileSync(TRACE, "utf8")) as {
    files?: string[];
  };
  const files = trace.files ?? [];
  for (const basename of REQUIRED_BASENAMES) {
    if (!files.some((file) => path.basename(file) === basename)) {
      errors.push(`missing from findings-detail trace: ${basename}`);
    }
  }

  if (errors.length > 0) {
    console.error("[bundler-check] function bundle is incomplete:");
    for (const error of errors) console.error(`  - ${error}`);
    console.error(
      "[bundler-check] fix outputFileTracingIncludes in next.config.ts and rebuild.",
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    "[bundler-check] function bundle contains axe.min.js + browsers.json.",
  );
}

main();
