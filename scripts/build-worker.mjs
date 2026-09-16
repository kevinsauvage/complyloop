/**
 * Bundles the assessment worker (`scripts/assessment-worker-drain.ts`) into
 * a single file run with plain Node (`npm run worker:drain`).
 *
 * Why a bundle instead of tsx: runtime probes execute serialized function
 * sources in the page (`fn.toString()` fragments and `page.evaluate`
 * closures). tsx compiles with esbuild keepNames, which wraps nested
 * declarations in `__name()` calls whose file-scoped definition never
 * travels with the fragment — every probe then dies in-page with
 * `ReferenceError: __name is not defined`. SWC/webpack stacks (local dev,
 * Vercel) never emit it, so the bug only shows on the tsx-driven executor.
 * Bundling here with `keepNames: false` makes `__name` impossible by
 * construction, on every stack (verified in CI: the bundle must not
 * contain `__name(`).
 *
 * Output is CJS (not ESM) on purpose: externals below resolve through the
 * real `require()`, exactly like the unbundled tsx/Vercel runtimes. An ESM
 * bundle routes those same calls through esbuild's dynamic-require shim,
 * which throws for self-hosted `require()` calls (typescript, sentry,
 * isomorphic-git) that work natively.
 *
 * Alias `@` → `./src` mirrors tsconfig paths; `conditions: react-server`
 * keeps the `server-only` import resolvable, same flag as every tsx script.
 * `axe-core/axe.min.js` still resolves from `node_modules` at runtime via
 * `resolveAxeMinJsPath`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildSync } from "esbuild";

const root = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

buildSync({
  entryPoints: [path.join(root, "scripts", "assessment-worker-drain.ts")],
  outfile: path.join(root, "dist", "worker", "assessment-worker-drain.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  keepNames: false,
  conditions: ["react-server"],
  alias: { "@": path.join(root, "src") },
  // `chromium-bidi` is an optional playwright-core peer (BiDi protocol;
  // scans use CDP) that is not installed — its own try/catch handles the
  // absence at runtime, same as unbundled. The rest stay native because
  // bundling breaks them: `playwright-core` resolves its browser registry,
  // binaries, and version from `__dirname` at runtime (bundled, that is
  // `dist/worker/`); `typescript`, `@sentry/*`, and `isomorphic-git` use
  // self-hosted dynamic `require()` calls esbuild cannot statically link.
  // All resolve from `node_modules` on the runner (`npm ci` installs
  // devDependencies too).
  external: [
    "chromium-bidi",
    "chromium-bidi/*",
    "playwright-core",
    "typescript",
    "@sentry/*",
    "isomorphic-git",
  ],
  logLevel: "warning",
});

console.log("[worker:build] bundled dist/worker/assessment-worker-drain.cjs");

// Self-enforcing tripwire: keepNames must never leak `__name()` into page
// sources (see header). Fail the build loudly instead of shipping a worker
// whose probes die in-page.
const bundled = fs.readFileSync(
  path.join(root, "dist", "worker", "assessment-worker-drain.cjs"),
  "utf8",
);
if (bundled.includes("__name(")) {
  throw new Error(
    "[worker:build] bundle contains __name( — probe sources would fail in-page",
  );
}
