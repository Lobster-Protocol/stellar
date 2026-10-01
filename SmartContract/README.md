# SmartContract

Two Soroban contracts in one Cargo workspace.

The vault (`lobster/`, crate `lobster-contract`) holds one owner's pair of tokens and puts them in a Soroswap pool through the router it was created with. Only the owner or the vault's multisig admin can move funds. When liquidity comes out of Soroswap at a profit, the admin takes a cut of that profit (20% at most).

The factory (`factory/`, crate `lobster-factory`) deploys one vault per owner and token pair from an uploaded vault wasm, and keeps the index of vaults. Its admin can replace that wasm hash, and can change the fee given to new vaults after a 14-day notice.

## Setup

`rust-toolchain.toml` pins `nightly-2025-08-07` with the `wasm32v1-none` target. The build runs through stellar-cli 26.0.0, called as `stellar` below and in `Taskfile.yaml`. [Task](https://taskfile.dev) is optional.

```bash
# rustup, if it isn't installed yet
command -v rustup >/dev/null 2>&1 || curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"

rustup toolchain install nightly-2025-08-07
rustup target add wasm32v1-none --toolchain nightly-2025-08-07

# run this outside SmartContract/: the CLI needs Rust 1.92, newer than the pinned nightly.
# the v26.0.0 GitHub release of stellar-cli also has prebuilt binaries.
cargo install --locked stellar-cli --version 26.0.0
```

## Layout

- `Cargo.toml`: the workspace. Dependency versions are pinned once in `[workspace.dependencies]` and both crates use `workspace = true`.
- `Taskfile.yaml`: `build`, `test`, `fmt`, `check`, `clean`, and `all` (clean, fmt, build, check, test).
- `lobster/`, `factory/`: the two crates. Each test run rewrites the JSON files under their `test_snapshots/`.
- `generate_pools_soroswap.sh`, `generate_pools_phoenix.sh`, `generate_pools_aquarius.sh`: list every pool of that DEX with read-only `stellar contract invoke --send=no` calls and write `soroswap_pools.ts`, `phoenix_pools.ts` or `aquarius_pools.ts` with `node`. The DEX contract IDs at the top of each script are the mainnet ones, with the testnet ID in a comment. `NETWORK` (default `mainnet`) and `SOURCE_ACCOUNT` (a CLI identity, default `alice2`) come from the environment. Query and DataProcess don't import these files, they read their own copies in `src/pool_repertory/`, where the Soroswap entries use `token_a` and `token_b` instead of `token_0` and `token_1`.

## Build

```bash
stellar contract build
stellar contract optimize --wasm target/wasm32v1-none/release/lobster_contract.wasm
stellar contract optimize --wasm target/wasm32v1-none/release/lobster_factory.wasm
```

`task build` runs the same three commands. Both crates build with the pinned toolchain into `target/wasm32v1-none/release/`, and each optimize writes a `.optimized.wasm` next to its input. Those are the files to upload, and with stellar-cli 26.0.0 they match the mainnet hashes below byte for byte. The CLI flags `contract optimize` as deprecated in favor of `build --optimize`, but that would overwrite the raw `lobster_contract.wasm`, which the factory tests load and the test snapshots record by hash.

Build with the CLI, not with cargo directly. It strips the cargo registry path from the wasm, sets the SDK's build flags and writes its own version into the contract meta (`cliver`), so a plain `cargo build --release --target wasm32v1-none`, or another CLI version, gives other bytes. `stellar contract info meta --wasm <file>` shows which version built a wasm.

## Test

```bash
cargo test --workspace   # task test
```

The factory tests load the vault from `target/wasm32v1-none/release/lobster_contract.wasm` (`contractimport!`), so build once before the first test run.

Format and lint:

```bash
cargo fmt --all   # task fmt
cargo clippy --workspace --all-targets -- -D warnings
```

## Deploy

The factory constructor takes the vault's wasm hash, so upload the vault first. On testnet:

```bash
stellar keys generate lobster-dev --network testnet --fund

# prints the vault wasm hash
stellar contract upload --wasm target/wasm32v1-none/release/lobster_contract.optimized.wasm \
  --source-account lobster-dev --network testnet

stellar contract deploy --wasm target/wasm32v1-none/release/lobster_factory.optimized.wasm \
  --source-account lobster-dev --network testnet \
  -- --admin "$(stellar keys address lobster-dev)" \
     --wasm_hash <vault wasm hash> \
     --fee_bps <fee in bps, 2000 max> \
     --soroswap_router <Soroswap router contract ID>
```

The constructor needs the admin's signature, so deploy with the admin as source account. `set_admin` hands the factory to another account afterwards.

Open a vault for a token pair:

```bash
stellar contract invoke --id <factory ID> --source-account lobster-dev --network testnet \
  -- create_pool --user "$(stellar keys address lobster-dev)" --token0 <token contract ID> --token1 <token contract ID>
```

## Mainnet

Factory: `CAFGQVKFCZITN7UJUOIJPMULGZRUR7RXG6DAYJ2VBGIGFWHHFGR6MCR5`

It runs the factory code below and deploys vaults from the vault hash it stores. The build above gives both.

| Contract | Hash |
| --- | --- |
| vault | `a72a67ac4b9fa0ad561032d8d433d4da0024100cdb27f9098cb89997243b8382` |
| factory | `cd12142a580641ef92a99f9464a667be5851e8c221c632ce50f99e964553a732` |

To compare with the chain, fetch the factory's code and read the vault hash it deploys from:

```bash
stellar contract fetch --id CAFGQVKFCZITN7UJUOIJPMULGZRUR7RXG6DAYJ2VBGIGFWHHFGR6MCR5 --network mainnet \
  --out-file target/factory-mainnet.wasm
sha256sum target/factory-mainnet.wasm target/wasm32v1-none/release/lobster_factory.optimized.wasm
stellar contract read --id CAFGQVKFCZITN7UJUOIJPMULGZRUR7RXG6DAYJ2VBGIGFWHHFGR6MCR5 --network mainnet \
  --durability persistent --key lob_hash
```
