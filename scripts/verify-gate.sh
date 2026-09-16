#!/bin/sh
# Unified verification gate (human + agent entrypoint).
# Usage: npm run verify:gate
set -eu
npm run lint && npm run typecheck && npm run test && npm run build && npx tsx scripts/bundler-check.ts
