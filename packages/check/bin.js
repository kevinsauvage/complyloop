#!/usr/bin/env node
/**
 * Customer-facing CLI entry. Requires the bundled dist (publishable).
 * Run `npm run build:check` in the ComplyLoop repo before local use.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundled = path.join(__dirname, "dist", "cli.js");

if (!existsSync(bundled)) {
  console.error(
    "@complyloop/check is missing dist/cli.js. Run `npm run build:check` in the ComplyLoop repo, or install a published package that includes the bundle.",
  );
  process.exit(2);
}

await import(pathToFileURL(bundled).href);
