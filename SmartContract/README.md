## SmartContract workspace (Soroban)

This directory contains Soroban smart contracts for the Lobster project.
It is a standalone Cargo workspace aligned with the `soroban-amm` toolchain and dependency versions.

### Prerequisites
- Rust toolchain (rustup) with channel pinned in `rust-toolchain.toml` (nightly-2025-08-07)
- Target: `wasm32v1-none`
- Soroban CLI: `cargo install soroban-cli --locked`
- Optional: `go-task` to run tasks in `Taskfile.yaml`

Quick install:
```bash
# Install rustup if needed, then load cargo in this shell
command -v rustup >/dev/null 2>&1 || curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"

# Pin toolchain & add target (these are also declared in rust-toolchain.toml)
rustup toolchain install nightly-2025-08-07
rustup target add wasm32v1-none --toolchain nightly-2025-08-07

# Soroban CLI
cargo install soroban-cli --locked
```

### Workspace layout
- `Cargo.toml` (workspace): pins versions matching `soroban-amm`
- `rust-toolchain.toml`: Rust channel and target
- `Taskfile.yaml`: common tasks (build/test/optimize)
- `lobster/`: vault (pool) contract crate
- `factory/`: pool factory crate
- `contracts/`: build output for optimized `.wasm`

### Build
From this directory:
```bash
# Build all contracts and produce optimized wasm in ./contracts
cargo build --release --target wasm32v1-none --workspace
# Or with Taskfile
task build
```

Artifacts are written to:
- `target/wasm32v1-none/release/*.wasm` (raw)
- `contracts/*.wasm` (optimized via `soroban contract optimize`)

### Test
```bash
cargo test --workspace
# Or
task test
```

### Lint/Format
```bash
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
```

### Deploy (outline)
1. Configure network and keys
```bash
soroban config identity generate lobster-dev
soroban config network add testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"
```
2. Deploy a contract wasm
```bash
# Example with token contract wasm
WASM=contracts/soroban_token_contract.wasm
soroban contract deploy --wasm $WASM --network testnet --source lobster-dev
```
3. Invoke contract functions
```bash
soroban contract invoke --id <CONTRACT_ID> --fn <function> --arg <json-arg>
```

### Notes
- Dependency versions are kept in the workspace root, mirroring `soroban-amm/Cargo.toml` to avoid version drift.
- If you update `soroban-amm` versions, update `[workspace.dependencies]` here accordingly.


mainnet factory
CAFGQVKFCZITN7UJUOIJPMULGZRUR7RXG6DAYJ2VBGIGFWHHFGR6MCR5

wasm hashes (pinned toolchain + stellar contract optimize)
vault   a72a67ac4b9fa0ad561032d8d433d4da0024100cdb27f9098cb89997243b8382
factory cd12142a580641ef92a99f9464a667be5851e8c221c632ce50f99e964553a732