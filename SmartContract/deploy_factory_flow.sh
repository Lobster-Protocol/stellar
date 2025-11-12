#!/usr/bin/env bash

# Orchestrates the standard Lobster deployment flow:
#  1. Install the lobster pool contract wasm to obtain the on-chain wasm hash.
#  2. Convert the hex hash emitted by `soroban` into a `Bytes32` decimal array string.
#  3. Deploy the factory contract, providing the freshly installed wasm hash.
#  4. Create a pool via the factory.
#  5. Deposit tokens into the newly created pool.
#
# Configuration is done via environment variables; sensible defaults are provided
# to mirror the values in the project Makefile. Override them when needed.

set -euo pipefail

ROOT_DIR="/home/esteban/Desktop/Lobster"

: "${WASM_LOBSTER:=target/wasm32v1-none/release/lobster_contract_optimized.wasm}"
: "${WASM_FACTORY:=target/wasm32v1-none/release/lobster_factory.wasm}"
: "${SOURCE_ACCOUNT:=alice2}"
: "${NETWORK:=testnet}"
: "${FEE_BPS:=1000}"
: "${TOKEN0:=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC}"
: "${TOKEN1:=CBORLTYGFWD5XJEG5A7YC7F72IA6JAMRJVUTMYQNYYBVOEUNAHWKRKK5}"
# 32-byte salt; default mirrors the Makefile target.
: "${DEPOSIT_AMOUNT0:=6000000}"
: "${DEPOSIT_AMOUNT1:=6000000}"

# Ensure required executables are present before doing anything else.
for cmd in soroban python3; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done

echo "==> Installing lobster contract wasm:"
echo "    file: $WASM_LOBSTER"
INSTALL_OUTPUT="$(soroban contract install \
  --wasm "$WASM_LOBSTER" \
  --source "$SOURCE_ACCOUNT" \
  --network "$NETWORK" 2>&1)"
echo "$INSTALL_OUTPUT"

WASM_HASH_HEX="$(echo "$INSTALL_OUTPUT" | tail -1 | tr -d '[:space:]')"
if [[ -z "$WASM_HASH_HEX" ]]; then
  echo "Could not find wasm hash in install output; aborting." >&2
  exit 1
fi
echo "    parsed wasm hash (hex): $WASM_HASH_HEX"

export WASM_HASH_HEX
WASM_HASH_BYTES="$(python3 - <<'PYCODE'
import os
hex_hash = os.environ["WASM_HASH_HEX"].strip().lower()
if hex_hash.startswith("0x"):
    hex_hash = hex_hash[2:]
if len(hex_hash) != 64:
    raise SystemExit(f"Unexpected hash length ({len(hex_hash)} digits)")
try:
    byte_values = [str(int(hex_hash[i:i+2], 16)) for i in range(0, len(hex_hash), 2)]
except ValueError as exc:
    raise SystemExit(f"Invalid hex hash: {exc}")
print("[" + ", ".join(byte_values) + "]")
PYCODE
)"
echo "    wasm hash as Bytes32: $WASM_HASH_BYTES"

echo
echo "==> Deploying factory contract:"
echo "    file: $WASM_FACTORY"
FACTORY_DEPLOY_OUTPUT="$(soroban contract deploy \
  --wasm "$WASM_FACTORY" \
  --source "$SOURCE_ACCOUNT" \
  --network "$NETWORK" \
  -- \
  --admin "$SOURCE_ACCOUNT" \
  --wasm_hash "$WASM_HASH_BYTES" \
  --fee_bps "$FEE_BPS" 2>&1)"
echo "$FACTORY_DEPLOY_OUTPUT"

FACTORY_ID="$(echo "$FACTORY_DEPLOY_OUTPUT" | grep -o 'C[A-Z0-9]\{55\}' | tail -1)"
if [[ -z "$FACTORY_ID" ]]; then
  echo "Failed to parse factory contract ID from deploy output." >&2
  exit 1
fi
echo "    factory contract id: $FACTORY_ID"

echo
echo "==> Creating pool through factory:"
CREATE_POOL_OUTPUT="$(soroban contract invoke \
  --id "$FACTORY_ID" \
  --source "$SOURCE_ACCOUNT" \
  --network "$NETWORK" \
  -- \
  create_pool \
  --user "$SOURCE_ACCOUNT" \
  --token0 "$TOKEN0" \
  --token1 "$TOKEN1" 2>&1)"
echo "$CREATE_POOL_OUTPUT"

POOL_ID="$(echo "$CREATE_POOL_OUTPUT" | grep -o 'C[A-Z0-9]\{55\}' | tail -1)"
if [[ -z "$POOL_ID" ]]; then
  echo "Failed to identify pool contract ID from create_pool output." >&2
  exit 1
fi
echo "    pool contract id: $POOL_ID"

echo
echo "==> Depositing into pool:"
DEPOSIT_OUTPUT="$(soroban contract invoke \
  --id "$POOL_ID" \
  --source "$SOURCE_ACCOUNT" \
  --network "$NETWORK" \
  -- \
  deposit \
  --caller "$SOURCE_ACCOUNT" \
  --amount0 "$DEPOSIT_AMOUNT0" \
  --amount1 "$DEPOSIT_AMOUNT1" 2>&1)"
echo "$DEPOSIT_OUTPUT"

echo
echo "All steps completed successfully."
echo "  Factory ID: $FACTORY_ID"
echo "  Pool ID:    $POOL_ID"

