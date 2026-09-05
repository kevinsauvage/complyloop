/**
 * CI gate entry: scan a project tree and exit non-zero when violation
 * findings exist.
 *
 * Usage:
 *   npx complyloop-check [path]
 *   npm run check -- [path]
 *
 * Run with --help for options and exit codes (see run-check.ts).
 */
import { runCheck } from "./run-check.ts";

process.exit(
  runCheck(process.argv.slice(2), {
    log: console.log,
    error: console.error,
  }),
);
