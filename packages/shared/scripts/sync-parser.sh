#!/usr/bin/env sh
# Copy the BOM parser (source of truth: packages/shared/src/bom-parser.ts)
# into the Deno edge-function tree. Run after editing the parser:
#   sh packages/shared/scripts/sync-parser.sh
set -eu
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SRC="$ROOT/packages/shared/src/bom-parser.ts"
DST="$ROOT/supabase/functions/_shared/bom-parser.ts"
{
  echo "// GENERATED COPY - do not edit. Source: packages/shared/src/bom-parser.ts"
  echo "// Refresh with: sh packages/shared/scripts/sync-parser.sh"
  cat "$SRC"
} > "$DST"
echo "synced $DST"
