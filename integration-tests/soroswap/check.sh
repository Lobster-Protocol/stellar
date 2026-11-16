#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
unset KANATOKO_CAPTURE_RPC LOBSTER_MAINNET_WASM
./build.sh
cargo +1.95.0 test --locked "$@"
