#!/bin/sh
# Unified verification gate (human + agent entrypoint).
# Usage: npm run verify:gate
# Mirrors CI quality + build: lint, typecheck, unit tests, coverage
# thresholds, production build, bundle check.
# NOT included (need live infra): test:db (needs DATABASE_URL — CI
# db-integration job), test:e2e (needs browsers + migrated DB — CI e2e job).
set -eu
npm run lint && npm run typecheck && npm run test && npm run test:coverage && npm run build && npx tsx scripts/bundler-check.ts
