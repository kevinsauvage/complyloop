/**
 * Bundles this package's CLI into dist/cli.js so @complyloop/check can be
 * packed/installed outside this monorepo without pulling analysis-core's
 * runtime engines (playwright, html-validate, linkinator).
 *
 * Published runtime deps are external (bundling those CJS packages into ESM
 * breaks require). analysis-core is a workspace devDependency and is inlined
 * from its source exports. Externals are derived from package.json so the
 * two cannot drift.
 */
import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8"));
const external = Object.keys(pkg.dependencies ?? {});

await esbuild.build({
  entryPoints: [path.join(packageDir, "src/check.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: path.join(packageDir, "dist/cli.js"),
  banner: {
    js: "#!/usr/bin/env node",
  },
  external,
  logLevel: "info",
});

console.log("Built packages/check/dist/cli.js");
