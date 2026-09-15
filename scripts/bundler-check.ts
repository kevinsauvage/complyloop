import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Post-build bundler sanity check: verifies the files the runtime scan needs
 * on Vercel actually shipped in the worker route's trace. Without this, the
 * only signal that `axe.min.js` or `@sparticuz/chromium/bin/*.br` is missing
 * is a masked "Runtime scan failed." at runtime.
 *
 * Reads `.next/server/app/api/internal/jobs/run/route.js.nft.json` (the
 * same trace Vercel uses to build the function) and fails loudly when a
 * required asset is absent. Runs after `next build` in `verify:gate`.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRACE = path.join(
  ROOT,
  ".next/server/app/api/internal/jobs/run/route.js.nft.json",
);

/** Required path basenames — the trace relativizes differently across builds. */
const REQUIRED_BASENAMES = ["axe.min.js", "browsers.json"];

/** Required glob-ish prefixes (non-JS binaries traced only via includes). */
const REQUIRED_PREFIXES = [
  "./node_modules/@sparticuz/chromium/bin/chromium.br",
  "./node_modules/@sparticuz/chromium/bin/fonts.tar.br",
];

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
      errors.push(`missing from worker trace: ${basename}`);
    }
  }
  for (const required of REQUIRED_PREFIXES) {
    if (
      !files.some(
        (file) =>
          file.includes("@sparticuz/chromium/bin/") && file.endsWith(".br"),
      )
    ) {
      errors.push(`missing from worker trace: ${required} (no .br in trace)`);
    }
  }

  if (errors.length > 0) {
    console.error("[bundler-check] worker bundle is incomplete:");
    for (const error of errors) console.error(`  - ${error}`);
    console.error(
      "[bundler-check] fix outputFileTracingIncludes in next.config.ts and rebuild.",
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    "[bundler-check] worker bundle contains axe.min.js + chromium binaries.",
  );
}

main();