#!/usr/bin/env bash
# Backup the SQLite database. Refuses to run without CERITALAB_SECRET,
# because a backup whose encrypted keys cannot be decrypted is not a usable backup.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:-$ROOT/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"

if [[ -z "${CERITALAB_SECRET:-}" ]]; then
  echo "ERROR: CERITALAB_SECRET is not set. Encrypted API keys would be unrestorable." >&2
  echo "Run: export CERITALAB_SECRET=\"\$(grep CERITALAB_SECRET \"$ROOT/.env\" | cut -d= -f2- | tr -d '\\\"')\"" >&2
  exit 1
fi

DB="$ROOT/dev.db"
if [[ ! -f "$DB" ]]; then
  echo "ERROR: dev.db not found at $DB" >&2
  exit 1
fi

OUT="$DEST/ceritalab-$STAMP"
mkdir -p "$OUT"

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB" ".backup '$OUT/dev.db'"
else
  cp "$DB" "$OUT/dev.db"
fi

if [[ -f "$ROOT/.env" ]]; then
  cp "$ROOT/.env" "$OUT/env.backup"
  chmod 600 "$OUT/env.backup"
fi

tar -czf "$DEST/ceritalab-$STAMP.tar.gz" -C "$DEST" "ceritalab-$STAMP"
rm -rf "$OUT"
echo "Backup created: $DEST/ceritalab-$STAMP.tar.gz"
