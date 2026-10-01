#!/bin/bash

# Script to generate simple TypeScript file from Aquarius pools
# Usage: ./generate_pools_aquarius.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/aquarius_pools.ts"
AQUARIUS_ROUTER_ID="CBQDHNBFBZYE4MKPWBSJOPIYLW4SFSXAXUTSXJN76GNKYVYPCKWC6QUK"
#CBQDHNBFBZYE4MKPWBSJOPIYLW4SFSXAXUTSXJN76GNKYVYPCKWC6QUK   mainnet
#CBCFTQSPDBAIZ6R6PJQKSQWKNKWH2QIV3I4J72SHWBIK3ADRRAM5A6GD   testnet
SOURCE_ACCOUNT="${SOURCE_ACCOUNT:-alice2}"
NETWORK="${NETWORK:-mainnet}"
CHUNK_SIZE="${CHUNK_SIZE:-10}"

extract_json() {
  local data="$1"
  local json=""
  local started=false
  while IFS= read -r line; do
    local trimmed="${line#"${line%%[![:space:]]*}"}"
    if [ "$started" = false ]; then
      if [[ "$trimmed" =~ ^\[ ]]; then
        started=true
        json="$trimmed"
        [[ "$trimmed" =~ \]\]$ ]] && break
      fi
    else
      json="${json}${trimmed}"
    fi
  done <<< "$data"

  if [ "$started" = false ]; then
    echo ""
  else
    echo "$json"
  fi
}

echo "Step 1: Getting Aquarius token set count..."

LENGTH_OUTPUT=$(
  stellar contract invoke \
    --id "$AQUARIUS_ROUTER_ID" \
    --source "$SOURCE_ACCOUNT" \
    --network "$NETWORK" \
    --send=no \
    -- \
    get_tokens_sets_count 2>&1
)

LENGTH=""
while IFS= read -r line; do
  if [[ "$line" =~ ⚠️|ℹ️|Simulation|warning|ignoring ]]; then
    continue
  fi
  if [[ "$line" =~ ^[0-9]+$ ]]; then
    LENGTH="$line"
    break
  fi
  if [[ "$line" =~ ^\"([0-9]+)\"$ ]]; then
    LENGTH="${BASH_REMATCH[1]}"
    break
  fi
done <<< "$LENGTH_OUTPUT"

if [ -z "$LENGTH" ]; then
  echo "Error: Could not extract token set count from output"
  echo "$LENGTH_OUTPUT"
  exit 1
fi

echo "   Found $LENGTH token sets"

TOTAL_POOLS=0

TEMP_RESULTS=$(mktemp)
echo "[" > "$TEMP_RESULTS"
FIRST=true

START_INDEX=0
LENGTH_INT=$((LENGTH))

echo "Step 2: Fetching pools from Aquarius router..."

while [ "$START_INDEX" -lt "$LENGTH_INT" ]; do
  END_INDEX=$((START_INDEX + CHUNK_SIZE))
  if [ "$END_INDEX" -gt "$LENGTH_INT" ]; then
    END_INDEX="$LENGTH_INT"
  fi

  echo "   Fetching pools for indexes [$START_INDEX, $END_INDEX)..."

  RANGE_OUTPUT=$(
    stellar contract invoke \
      --id "$AQUARIUS_ROUTER_ID" \
      --source "$SOURCE_ACCOUNT" \
      --network "$NETWORK" \
      --send=no \
      -- \
      get_pools_for_tokens_range \
      --start "$START_INDEX" \
      --end "$END_INDEX" 2>&1
  )

  JSON_PAYLOAD=$(extract_json "$RANGE_OUTPUT")

  if [ -z "$JSON_PAYLOAD" ]; then
    echo "   Warning: No JSON data returned for range [$START_INDEX, $END_INDEX)"
    START_INDEX=$END_INDEX
    continue
  fi

  TEMP_CHUNK=$(mktemp)
  printf '%s\n' "$JSON_PAYLOAD" > "$TEMP_CHUNK"

  CHUNK_SIMPLE=$(
    node - "$TEMP_CHUNK" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const raw = fs.readFileSync(file, 'utf-8');
let parsed;
try {
  parsed = JSON.parse(raw);
} catch (err) {
  console.error('Failed to parse chunk JSON:', err.message);
  process.exit(1);
}
for (const entry of parsed) {
  if (!Array.isArray(entry) || entry.length < 2) continue;
  const tokens = entry[0] || [];
  const poolsMap = entry[1] || {};
  if (tokens.length < 2) continue;
  const tokenA = tokens[0];
  const tokenB = tokens[1];
  for (const key of Object.keys(poolsMap)) {
    const poolAddress = poolsMap[key];
    if (!poolAddress) continue;
    console.log(JSON.stringify({
      pool_address: poolAddress,
      token_a: tokenA,
      token_b: tokenB
    }));
  }
}
NODE
  )

  rm "$TEMP_CHUNK"

  while IFS= read -r line; do
    if [ -z "$line" ]; then
      continue
    fi
    if [ "$FIRST" = false ]; then
      echo "," >> "$TEMP_RESULTS"
    fi
    FIRST=false
    echo "  $line" >> "$TEMP_RESULTS"
    TOTAL_POOLS=$((TOTAL_POOLS + 1))
  done <<< "$CHUNK_SIMPLE"

  START_INDEX=$END_INDEX
done

echo "" >> "$TEMP_RESULTS"
echo "]" >> "$TEMP_RESULTS"

echo "Step 3: Writing TypeScript file..."

TS_CONTENT=$(
  node - "$TEMP_RESULTS" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const pools = JSON.parse(fs.readFileSync(file, 'utf-8'));
const tsContent = `// Auto-generated file - Do not edit manually
// Generated from Aquarius router get_pools_for_tokens_range

export interface SimplePool {
  pool_address: string;
  token_a: string;
  token_b: string;
}

export const aquariusPools: SimplePool[] = ${JSON.stringify(pools, null, 2)};
`;
console.log(tsContent);
NODE
)

echo "$TS_CONTENT" > "$OUTPUT_FILE"

rm "$TEMP_RESULTS"

echo "Generated TypeScript file: $OUTPUT_FILE"
echo "   Found $TOTAL_POOLS pools"

