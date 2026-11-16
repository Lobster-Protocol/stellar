#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
workspace="$root/SmartContract"
target_dir="${CARGO_TARGET_DIR:-$workspace/target}"
mkdir -p "$here/wasm"
cd "$workspace"
cargo +1.95.0 build --locked --release --target wasm32v1-none --package lobster-contract
cp "$target_dir/wasm32v1-none/release/lobster_contract.wasm" "$here/wasm/lobster_contract.wasm"
