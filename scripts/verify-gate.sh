#!/bin/sh
# Unified verification gate (human + agent entrypoint).
# Usage: npm run verify:gate
# Mirrors the CI quality job step for step: format, lint, typecheck, knip,
# unit tests + coverage thresholds, worker bundle, production build.
# NOT included (need live infra): test:db (needs DATABASE_URL — CI
# db-integration job), test:e2e (needs browsers + migrated DB — CI e2e job).
set -eu
npm run format:check && npm run lint && npm run typecheck && npm run knip && npm run test:coverage && npm run worker:build && npm run build
