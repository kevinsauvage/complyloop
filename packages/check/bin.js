#!/usr/bin/env node
/**
 * Customer-facing CLI entry. Prefers the bundled dist (publishable). Falls
 * back to this package's TypeScript source via tsx when dist is missing
 * (local development before `npm run build:check`).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundled = path.join(__dirname, "dist", "cli.js");

if (existsSync(bundled)) {
  await import(pathToFileURL(bundled).href);
} else {
  const cli = path.join(__dirname, "src", "check.ts");
  const require = createRequire(import.meta.url);
  let tsxCli;
  try {
    tsxCli = require.resolve("tsx/cli", { paths: [__dirname] });
  } catch {
    console.error(
      "@complyloop/check is missing dist/cli.js. Run `npm run build:check` in the ComplyLoop repo, or install a published package that includes the bundle.",
    );
    process.exit(2);
  }
  const result = spawnSync(
    process.execPath,
    [tsxCli, cli, ...process.argv.slice(2)],
    {
      stdio: "inherit",
      cwd: process.cwd(),
      env: process.env,
    },
  );
  process.exit(result.status ?? 1);
}
