/**
 * Bundles the customer-facing CLI into packages/check/dist/cli.js so
 * @complyloop/check can be packed/installed outside this monorepo.
 */
import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await esbuild.build({
  entryPoints: [path.join(root, "src/cli/check.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: path.join(root, "packages/check/dist/cli.js"),
  banner: {
    js: "#!/usr/bin/env node",
  },
  // Keep Node-native CJS deps external (bundling them into ESM breaks require).
  external: ["typescript", "fast-glob"],
  alias: {
    "@": path.join(root, "src"),
  },
  logLevel: "info",
});

console.log("Built packages/check/dist/cli.js");
