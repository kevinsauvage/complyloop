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
  // ESLint and jsx-a11y use dynamic require; they must load from node_modules.
  //
  // These five are the CLI's runtime deps (declared in packages/check/package.json)
  // — they mirror analysis-core's AST-engine deps because the bundle executes
  // eslint/jsx-a11y directly. Runtime engines (playwright, html-validate,
  // linkinator, axe-core) are NOT reached from src/cli/check.ts (analysis-core
  // loads them lazily via `await import`), so they stay out of the bundle and
  // out of @complyloop/check's dependency list. Keep this list in sync with
  // packages/check/package.json.
  external: [
    "typescript",
    "fast-glob",
    "eslint",
    "eslint-plugin-jsx-a11y",
    "@typescript-eslint/parser",
  ],
  // Resolve the analysis engine to its source in this monorepo.
  alias: {
    "@": path.join(root, "src"),
    "@complyloop/analysis-core": path.join(root, "packages/analysis-core/src"),
  },
  logLevel: "info",
});

console.log("Built packages/check/dist/cli.js");
