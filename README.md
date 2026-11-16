# Lobster Protocol

Lobster manages liquidity positions on Stellar. A user gets one Soroban vault per token pair, and the vault puts the deposited tokens into a Soroswap pool. Off-chain, an indexer and an analytics service follow pools on Soroswap, Phoenix and Aquarius. A decision service reads the metrics and calls the vaults to add or withdraw liquidity.

## Repository layout

| Directory | What's in it |
| --- | --- |
| `SmartContract/` | Soroban contracts in Rust: the vault (`lobster/`) and the factory that deploys one vault per user and token pair (`factory/`). The pool list scripts are here too. |
| `Query/` | SubQuery indexer for Soroswap, Phoenix and Aquarius events, with Postgres, a GraphQL API and a NATS feed of what it indexes. |
| `DataProcess/` | Express API that pulls a pair's history from Query, computes prices, volumes, fees, TVL, PnL, APR and volatility, and writes the result to S3-compatible storage. |
| `DecisionTaker/` | Express API that reads those metrics for each vault and sends the vault's add and withdraw calls, signed with one key or a multisig. Comes with a signer API for remote signers. |
| `FrontStellar/` | React and Vite app: connect a Stellar wallet, create a vault, deposit, withdraw. |

The contracts execute on Soroswap only. Phoenix and Aquarius show up in the indexer, the metrics and the pool lists, all of which stay off-chain. Each directory has its own README with the details.

## Requirements

The contracts build with rustup and [stellar-cli](https://developers.stellar.org/docs/tools/cli/install-cli) 26.0.0, the version the mainnet wasm was built with. `SmartContract/rust-toolchain.toml` pins `nightly-2025-08-07` with the `wasm32v1-none` target. That nightly is too old to compile the CLI, which wants Rust 1.92, so run `cargo install --locked stellar-cli --version 26.0.0` from outside `SmartContract/` or take the prebuilt binary from the CLI's v26.0.0 release. The Node projects need Node.js 20.19+ or 22.12+ with npm; Vite 7 in FrontStellar sets that floor. Query and the MinIO storage used by DataProcess run in Docker, with Compose. [go-task](https://taskfile.dev) is optional, for `SmartContract/Taskfile.yaml`.

## Build and test the contracts

```bash
cd SmartContract
rustup toolchain install nightly-2025-08-07
rustup target add wasm32v1-none --toolchain nightly-2025-08-07

stellar contract build
stellar contract optimize --wasm target/wasm32v1-none/release/lobster_contract.wasm
stellar contract optimize --wasm target/wasm32v1-none/release/lobster_factory.wasm
cargo test --workspace
```

The optimized `lobster_contract.optimized.wasm` (vault) and `lobster_factory.optimized.wasm` (factory) end up next to the raw files in `target/wasm32v1-none/release/`, byte for byte the ones on mainnet ([hashes](SmartContract/README.md#mainnet)). A plain `cargo build` gives other bytes, so build through the CLI. Build before testing: the factory tests import the raw vault from that directory.

`Taskfile.yaml` runs the same steps: `task build`, `task test`, `task fmt`, `task check`, `task clean`, and `task all` for the whole sequence. For lint, run `cargo clippy --workspace`.

To deploy, upload the vault wasm first. The factory's constructor takes its hash, the admin, the performance fee on profit (`fee_bps`, 2000 at most) and the one Soroswap router every vault will use. After that, each `create_pool(user, token0, token1)` call deploys a new vault. [SmartContract/README.md](SmartContract/README.md) has the commands.

## Pool lists

`SmartContract/generate_pools_soroswap.sh`, `generate_pools_phoenix.sh` and `generate_pools_aquarius.sh` read every pool from the Soroswap factory, the Phoenix factory and the Aquarius router through simulated `stellar contract invoke` calls (`--send=no`, nothing gets submitted). Each one writes `<dex>_pools.ts` next to itself. The contracts never read these lists. The indexer falls back on them for a pool's tokens when it has not indexed the pool's creation, and DataProcess's `/processAll` can take its pairs from them.

The scripts need bash, node and stellar-cli. `NETWORK` defaults to `mainnet` and `SOURCE_ACCOUNT`, a stellar-cli identity, to `alice2`. `PHOENIX_FACTORY_ID` overrides the Phoenix factory and `CHUNK_SIZE` sets the Aquarius batch size (10). The Soroswap factory and the Aquarius router are fixed in the scripts, with the testnet IDs in a comment, so a testnet run means editing those two lines and setting `PHOENIX_FACTORY_ID` along with `NETWORK=testnet`. No script writes the `*_testnet.ts` files.

Query and DataProcess read their own copies from `src/pool_repertory/`, so copy a fresh list there, under the `*_testnet.ts` name when it is a testnet list. The code there reads `token_a` and `token_b`. The Phoenix and Aquarius scripts write those names, but the Soroswap script writes `token_0` and `token_1`, so rename them when you copy a Soroswap list.

## Run the services

Start Query, then DataProcess, then DecisionTaker: each one reads from the one before. FrontStellar talks to the contracts directly and only calls DecisionTaker after a deposit.

### Query

```bash
cd Query
npm install
npm run dev
```

`npm run dev` generates the types and builds the mappings, which is all `npm run build` does, then pulls the images and starts the Docker stack. The GraphQL API and its playground are on http://localhost:3000, with subscriptions over WebSocket on the same port, and the indexer node is on port 3001 (`/health`, `/ready`). Postgres takes 5432 and NATS 4222, with monitoring on 8222. Port 8080 is a small bridge that forwards indexed events to NATS.

Settings are in `Query/.env`, which is committed with testnet values (`.env example` holds the same keys): `CHAIN_ID` for the network passphrase, `HORIZON_ENDPOINT`, `SOROBAN_ENDPOINT`, `START_BLOCK`, `AQUARIUS_CONTRACT_ID`, and `NETWORK`, which picks the testnet or mainnet pool lists. More in [Query/README.md](Query/README.md).

### DataProcess

```bash
cd DataProcess
npm install
npm run api
```

The API listens on 8085 and expects Query's GraphQL at http://localhost:3000. It reads its settings from the environment; nothing loads a `.env` file. `.env example` lists them: `PORT`, `NETWORK`, `SUBQUERY_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, and `POOL_POLL_INTERVAL_MS` for `npm run pools:poll`. `S3_ACCESS_KEY` and `S3_SECRET_KEY` have no default; for the local MinIO, use the values `docker-compose.yml` sets.

Both volume paths in that file are absolute, so edit them for your machine first. Then `docker compose up -d minio minio-init` starts MinIO (S3 API on 9000, console on 9001) and creates the `lobster` bucket. A plain `docker compose up -d` also runs the API in a container on 8085, in place of `npm run api`.

Routes:

- `POST /process` takes `token0`, `token1` and `protocol` (`soroswap`, `phoenix` or `aquarius`) in a JSON body. It answers 202 and runs in the background.
- `POST /processAll` runs every pair Query knows about, or every pair in the pool lists with `"source": "repertory"`.
- `GET /data` returns the stored metrics for the `token0`, `token1` and `protocol` query parameters. `GET /data/last` returns only the latest value of each.
- `GET /health`, `/health/live` and `/health/ready`.

With `TOKEN0` and `TOKEN1` set to the pair's token contract IDs:

```bash
curl -X POST http://localhost:8085/process -H 'content-type: application/json' \
  -d "{\"token0\":\"$TOKEN0\",\"token1\":\"$TOKEN1\",\"protocol\":\"soroswap\"}"
curl "http://localhost:8085/data/last?token0=$TOKEN0&token1=$TOKEN1&protocol=soroswap"
```

Each result is stored in the bucket as `<protocol>/<token0>_<token1>.latest.json.gz`. `npm test` runs the Jest tests for the formulas and `npm run lint` runs ESLint. More in [DataProcess/README.md](DataProcess/README.md).

### DecisionTaker

```bash
cd DecisionTaker
cp .env.example .env
npm install
npm run dev
```

The API listens on `PORT` (3334 by default) and loads `.env` itself. It reads `RPC_URL`, `NETWORK_PASSPHRASE`, `NETWORK`, `FACTORY_ID`, `PROCESS_URL` (DataProcess's `/data/last`), `SOROSWAP_ROUTER`, and `API_KEY` for the Soroswap price API. The key in `FEEPAYER_SECRET`, or in `SECRET` when that is unset, pays for every transaction and, in `single` mode, signs the vault calls. `CALLER_ADDRESS` is the address the vault sees as caller; without it, the key's own address is used.

`MULTISIG_MODE` decides how vault calls get signed: `single` (the default), `multisig-local` with the keys in `MULTISIG_SIGNER_SECRETS`, or `multisig-external` with signer URLs in `MULTISIG_SIGNER_APIS`. `local` and `external` work as short forms. `MULTISIG_TYPE` is `n-of-n` (the default) or `1-of-n`. The `.env.example` values select `external`, with signers on ports 4001 to 4003 and a multisig `CALLER_ADDRESS`; to sign with the one key, set `single` and remove `CALLER_ADDRESS`.

- `GET /` and `GET /health`
- `GET /api/run/all` runs the analysis on every vault in the factory, `GET /api/run/user/:userAddress` on one user's vaults, and `GET /api/run/pool/:poolId` on one vault, by its numeric id in the factory.
- `GET /api/feepayer/xlm-balance` returns the fee payer's XLM balance.

`npm run dev:signer` starts the signer API (`POST /sign`) on `SIGNER_API_PORT` (4001 by default), with its key in `SIGNER_SECRET_HEX`. `npm run build` then `npm start` runs the compiled server.

The Dockerfile builds both, from inside `DecisionTaker/`:

```bash
docker build --target server -t decisiontaker-server .
docker build --target signer -t decisiontaker-signer .
docker run --rm -p 3334:3334 --env-file .env decisiontaker-server
```

Inside the container the API still listens on `PORT`, not on the 3000 the Dockerfile exposes. `--env-file` keeps quotes as part of the value and rejects a space before `=`, so it wants plain `KEY=value` lines. More in [DecisionTaker/README.md](DecisionTaker/README.md).

### FrontStellar

```bash
cd FrontStellar
cp .env.example .env
npm install
npm run dev
```

Vite serves it on http://localhost:5173. `VITE_NETWORK` is `testnet` (the default) or `mainnet`. `VITE_FACTORY_CONTRACT` and `VITE_FACTORY_NETWORK` override the factory ID and passphrase taken from `bindings/factory.ts`, and `VITE_FACTORY_RPC` the RPC URL. After a deposit the app calls DecisionTaker at `VITE_DECISION_TAKER_URL` (default `http://localhost:3334`).

`npm run build` type-checks and builds into `dist/`, and `npm run lint` runs ESLint. More in [FrontStellar/README.md](FrontStellar/README.md).

## License

GPL-3.0, see [LICENSE](LICENSE). `Query/` carries its own MIT [license](Query/LICENSE).

## Links

- [Stellar developer docs](https://developers.stellar.org/)
- [SubQuery docs](https://subquery.network/doc/)
- [Soroswap](https://soroswap.finance/)
- [Phoenix](https://www.phoenix-hub.io/)
- [Aquarius](https://aqua.network/)

## Offline Soroswap deadline regressions

[Run the current-contract tests](integration-tests/soroswap/README.md) for
add/withdraw expiry, equality, balance preservation and a successful retry.
Soroswap deadlines are Unix timestamp seconds, not ledger sequence numbers.
