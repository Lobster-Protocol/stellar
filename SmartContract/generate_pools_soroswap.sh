#!/bin/bash

# Script to generate simple TypeScript file from Soroswap pools
# Usage: ./generate_pools_soroswap.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${SCRIPT_DIR}/soroswap_pools.ts"
FACTORY_ID="CA4HEQTL2WPEUYKYKCDOHCDNIV4QHNJ7EL4J4NQ6VADP7SYHVRYZ7AW2"
# CA4HEQTL2WPEUYKYKCDOHCDNIV4QHNJ7EL4J4NQ6VADP7SYHVRYZ7AW2     mainnet
#CCVFGQXMZ5DUFP25SCBSNOWNNMJ4ZPWPJ2KWOXT6F7ISQPRRRXGRDUPO   testnet
SOURCE_ACCOUNT="${SOURCE_ACCOUNT:-alice2}"
NETWORK="${NETWORK:-mainnet}"

echo "🔄 Step 1: Getting pool count..."

# Get the pool count
LENGTH_OUTPUT=$(
  stellar contract invoke \
    --id "$FACTORY_ID" \
    --source "$SOURCE_ACCOUNT" \
    --network "$NETWORK" \
    --send=no \
    -- \
    all_pairs_length 2>&1
)
LENGTH=""

# Extract the number from output (skip warnings)
while IFS= read -r line; do
  if [[ "$line" =~ ⚠️|ℹ️|Simulation|warning|ignoring ]]; then
    continue
  fi
  # Look for a number (the length)
  if [[ "$line" =~ ^[0-9]+$ ]]; then
    LENGTH="$line"
    break
  fi
done <<< "$LENGTH_OUTPUT"

if [ -z "$LENGTH" ]; then
  echo "❌ Error: Could not extract pool count from output"
  echo "Output was:"
  echo "$LENGTH_OUTPUT"
  exit 1
fi

echo "   Found $LENGTH pools"

# Convert to integer for loop
LENGTH_INT=$((LENGTH))

echo "🔄 Step 2: Getting pool addresses..."

# Get all pool addresses
POOL_ADDRESSES=()
for i in $(seq 0 $((LENGTH_INT - 1))); do
  echo "   Fetching pool $i..."
  PAIR_OUTPUT=$(
    stellar contract invoke \
      --id "$FACTORY_ID" \
      --source "$SOURCE_ACCOUNT" \
      --network "$NETWORK" \
      --send=no \
      -- \
      all_pairs \
      --n "$i" 2>&1
  )
  
  POOL_ADDR=""
  while IFS= read -r line; do
    if [[ "$line" =~ ⚠️|ℹ️|Simulation|warning|ignoring ]]; then
      continue
    fi
    # Look for a Stellar address (56 characters, starts with C)
    if [[ "$line" =~ ^C[A-Z0-9]{55}$ ]]; then
      POOL_ADDR="$line"
      break
    fi
    # Also check if it's quoted
    if [[ "$line" =~ \"(C[A-Z0-9]{55})\" ]]; then
      POOL_ADDR="${BASH_REMATCH[1]}"
      break
    fi
  done <<< "$PAIR_OUTPUT"
  
  if [ -z "$POOL_ADDR" ]; then
    echo "   ⚠️  Warning: Could not extract pool address for index $i"
    continue
  fi
  
  POOL_ADDRESSES+=("$POOL_ADDR")
done

echo "   Found ${#POOL_ADDRESSES[@]} pool addresses"

echo "🔄 Step 3: Getting token addresses for each pool..."

# Create a temporary file to store results
TEMP_JSON=$(mktemp)
echo "[" > "$TEMP_JSON"

FIRST=true
for pool_addr in "${POOL_ADDRESSES[@]}"; do
  echo "   Processing pool: $pool_addr"
  
  # Get token_0
  TOKEN_0_OUTPUT=$(stellar contract invoke \
    --id "$pool_addr" \
    --source "$SOURCE_ACCOUNT" \
    --network "$NETWORK" \
    --send=no \
    -- \
    token_0 2>&1)
  
  TOKEN_0=""
  while IFS= read -r line; do
    if [[ "$line" =~ ⚠️|ℹ️|Simulation|warning|ignoring ]]; then
      continue
    fi
    if [[ "$line" =~ ^C[A-Z0-9]{55}$ ]]; then
      TOKEN_0="$line"
      break
    fi
    if [[ "$line" =~ \"(C[A-Z0-9]{55})\" ]]; then
      TOKEN_0="${BASH_REMATCH[1]}"
      break
    fi
  done <<< "$TOKEN_0_OUTPUT"
  
  # Get token_1
  TOKEN_1_OUTPUT=$(stellar contract invoke \
    --id "$pool_addr" \
    --source "$SOURCE_ACCOUNT" \
    --network "$NETWORK" \
    --send=no \
    -- \
    token_1 2>&1)
  
  TOKEN_1=""
  while IFS= read -r line; do
    if [[ "$line" =~ ⚠️|ℹ️|Simulation|warning|ignoring ]]; then
      continue
    fi
    if [[ "$line" =~ ^C[A-Z0-9]{55}$ ]]; then
      TOKEN_1="$line"
      break
    fi
    if [[ "$line" =~ \"(C[A-Z0-9]{55})\" ]]; then
      TOKEN_1="${BASH_REMATCH[1]}"
      break
    fi
  done <<< "$TOKEN_1_OUTPUT"
  
  if [ -z "$TOKEN_0" ] || [ -z "$TOKEN_1" ]; then
    echo "   ⚠️  Warning: Could not extract tokens for pool $pool_addr"
    continue
  fi
  
  if [ "$FIRST" = false ]; then
    echo "," >> "$TEMP_JSON"
  fi
  FIRST=false
  
  echo "  {" >> "$TEMP_JSON"
  echo "    \"pool_address\": \"$pool_addr\"," >> "$TEMP_JSON"
  echo "    \"token_0\": \"$TOKEN_0\"," >> "$TEMP_JSON"
  echo "    \"token_1\": \"$TOKEN_1\"" >> "$TEMP_JSON"
  echo -n "  }" >> "$TEMP_JSON"
done

echo "" >> "$TEMP_JSON"
echo "]" >> "$TEMP_JSON"

# Generate TypeScript file
TEMP_SCRIPT=$(mktemp)
cat > "$TEMP_SCRIPT" << 'NODE_EOF'
const fs = require('fs');
const jsonFile = process.argv[2] ?? process.argv[1];

const pools = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));

const tsContent = `// Auto-generated file - Do not edit manually
// Generated from Soroswap factory all_pairs

export interface SimplePool {
  pool_address: string;
  token_0: string;
  token_1: string;
}

export const soroswapPools: SimplePool[] = ${JSON.stringify(pools, null, 2)};
`;

console.log(tsContent);
NODE_EOF

TS_CONTENT=$(node "$TEMP_SCRIPT" "$TEMP_JSON")

echo "$TS_CONTENT" > "$OUTPUT_FILE"

POOL_COUNT=$(node -e "const fs = require('fs'); const pools = JSON.parse(fs.readFileSync('$TEMP_JSON', 'utf-8')); console.log(pools.length);")

# Clean up temp files
rm "$TEMP_JSON" "$TEMP_SCRIPT"

echo "✅ Generated TypeScript file: $OUTPUT_FILE"
echo "   Found $POOL_COUNT pools"

