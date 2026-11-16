# Soroswap deadline regressions

Complements the native mock tests with two local Lobster-to-Soroswap integration
tests. Builds the current lobster-contract and executes it against captured
Protocol 29 mainnet router, pool and token code.

## Run

Install Rust 1.95.0 with the wasm32v1-none target, then run from the repository root:

```sh
rustup toolchain install 1.95.0 --profile minimal --target wasm32v1-none
./integration-tests/soroswap/check.sh
# After dependencies have been downloaded:
./integration-tests/soroswap/check.sh --offline
```

The script builds the current checkout's contracts and replays committed captures.
No Stellar CLI, wallet, public-network deployment or RPC is needed for replay.
The isolated test workspace installs Kanatoko 29.1.2 from crates.io; it does
not change the contracts' SDK dependencies. WASM outputs are ignored, rebuilt in
CI and never used as a substitute for the current source.

## Coverage

- Add and withdraw reject ledger sequence + 60, an expired timestamp and equality;
  a future timestamp succeeds. The real router uses Unix timestamp seconds.
- Rejections preserve checked vault/pool balances, LP balance and position state.
- Advancing time to a once-future withdrawal deadline rejects; retrying with the
  next second succeeds and clears the position.

The argument names are retained for compatibility. Existing callers using
99999999999 are not shown failing by these tests.

## Captures and local setup

- Router: CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH, selected by
  the documented mainnet factory's SW_ROUTER entry.
- add.json: ledger 65508083, timestamp 1794826457.
- withdraw.json: ledger 65508085, timestamp 1794826467.
- Each capture has coherent provenance and zero final replay RPC reads.

The local vault starts with zero XLM/USDC balances. Funding and authorization
are explicit test setup; no live vault changes. Only ledger time advances.
Transaction admission, fees and archival are outside this test.

Capture refresh is explicit: build, then call cargo test directly with
KANATOKO_CAPTURE_RPC set to a compatible Protocol 29 endpoint. check.sh clears
that variable. A missing or insufficient capture fails instead of using RPC.
