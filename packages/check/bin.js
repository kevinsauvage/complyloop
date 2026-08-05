#!/usr/bin/env node
/**
 * Customer-facing CLI entry. Resolves the monorepo check script via tsx so
 * assessed apps can run `npx @complyloop/check .` (or `npx complyloop-check .`)
 * without hard-coding a source path.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const cli = path.join(repoRoot, "src/cli/check.ts");
const require = createRequire(import.meta.url);

let tsxCli;
try {
  tsxCli = require.resolve("tsx/cli", { paths: [repoRoot, __dirname] });
} catch {
  console.error(
    "tsx is required to run @complyloop/check. Install it in the ComplyLoop repo (devDependency) or globally.",
  );
  process.exit(2);
}

const result = spawnSync(process.execPath, [tsxCli, cli, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: process.cwd(),
  env: process.env,
});

process.exit(result.status ?? 1);
