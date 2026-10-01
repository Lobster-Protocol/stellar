#!/bin/bash

# Script to generate simple TypeScript file from Phoenix pools query
# Usage: ./generate_pools_phoenix.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/phoenix_pools.ts"
PHOENIX_FACTORY_ID="${PHOENIX_FACTORY_ID:-CB4SVAWJA6TSRNOJZ7W2AWFW46D5VR4ZMFZKDIKXEINZCZEGZCJZCKMI}"
#CB4SVAWJA6TSRNOJZ7W2AWFW46D5VR4ZMFZKDIKXEINZCZEGZCJZCKMI   mainnet
#CBIFTP5CLUIVIVJ7WAMGOQPYPCV3CH3AVMHNWIL5XDPYCRWLBPUWL7FI   testnet
SOURCE_ACCOUNT="${SOURCE_ACCOUNT:-alice2}"
NETWORK="${NETWORK:-mainnet}"

echo "Querying Phoenix factory for pool details..."

OUTPUT=$(
  stellar contract invoke \
    --id "$PHOENIX_FACTORY_ID" \
    --source "$SOURCE_ACCOUNT" \
    --network "$NETWORK" \
    --send=no \
    -- \
    query_all_pools_details 2>&1
)

# Extract JSON from output (skip warnings and info messages)
JSON_DATA=""
IN_JSON=false

while IFS= read -r line; do
  # Skip warning and info lines
  if [[ "$line" =~ ⚠️|ℹ️|Simulation|warning|ignoring ]]; then
    continue
  fi
  
  # Check if line starts with JSON array
  if [[ "$line" =~ ^\[ ]]; then
    IN_JSON=true
    JSON_DATA="$line"
  elif [ "$IN_JSON" = true ]; then
    JSON_DATA="$JSON_DATA$line"
  fi
done <<< "$OUTPUT"

if [ -z "$JSON_DATA" ]; then
  echo "Error: Could not extract JSON data from output"
  echo "Output was:"
  echo "$OUTPUT"
  exit 1
fi

# Create a temporary file for the JSON data
TEMP_JSON=$(mktemp)
echo "$JSON_DATA" > "$TEMP_JSON"

# Create a temporary Node.js script
TEMP_SCRIPT=$(mktemp)
cat > "$TEMP_SCRIPT" << 'NODE_EOF'
const fs = require('fs');
const jsonFile = process.argv[2] ?? process.argv[1];

const jsonData = fs.readFileSync(jsonFile, 'utf-8');

try {
  const pools = JSON.parse(jsonData);
  
  const simplified = pools.map(pool => ({
    pool_address: pool.pool_address,
    token_a: pool.pool_response.asset_a.address,
    token_b: pool.pool_response.asset_b.address
  }));
  
  const tsContent = `// Auto-generated file - Do not edit manually
// Generated from Phoenix factory query_all_pools_details

export interface SimplePool {
  pool_address: string;
  token_a: string;
  token_b: string;
}

export const phoenixPools: SimplePool[] = ${JSON.stringify(simplified, null, 2)};
`;
  
  console.log(tsContent);
} catch (error) {
  console.error('Error processing JSON:', error.message);
  process.exit(1);
}
NODE_EOF

TS_CONTENT=$(node "$TEMP_SCRIPT" "$TEMP_JSON")

echo "$TS_CONTENT" > "$OUTPUT_FILE"

POOL_COUNT=$(node -e "const fs = require('fs'); const pools = JSON.parse(fs.readFileSync('$TEMP_JSON', 'utf-8')); console.log(pools.length);")

# Clean up temp files
rm "$TEMP_JSON" "$TEMP_SCRIPT"

echo "Generated TypeScript file: $OUTPUT_FILE"
echo "   Found $POOL_COUNT pools"

