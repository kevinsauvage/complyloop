#!/usr/bin/env sh
# Creates a timestamped logical backup. Store COMPLYLOOP_BACKUP_DIR on encrypted,
# access-controlled storage and run this from the platform scheduler.
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${COMPLYLOOP_BACKUP_DIR:?COMPLYLOOP_BACKUP_DIR is required}"

mkdir -p "$COMPLYLOOP_BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$COMPLYLOOP_BACKUP_DIR/complyloop-$timestamp.dump"
pg_dump "$DATABASE_URL" --format=custom --file="$target"
printf '%s\n' "$target"
