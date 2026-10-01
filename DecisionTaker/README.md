# DecisionTaker

Express service that decides where each Lobster vault's liquidity should sit, and moves it. For each vault it's asked about, it reads the active DEX from the vault, the latest APRs from the DataProcess API and a USD price from the Soroswap price API. An idle vault is deposited into the DEX with the best APR. An active one is compared with the other two DEXes (`shouldChangePool` in `src/services/analysis/poolAnalyzer.ts`) and withdrawn and re-added elsewhere when the rule says so.

Transactions are signed with one key or by a set of multisig signers. A signer is either a local key or an instance of `multisig/signerApi.ts`, a small service that can run on its own machine.

Pool numbers follow the vault's `get_active_protocol`: 0 Soroswap, 1 Phoenix, 2 Aquarius, 5 no position. The vault in `../SmartContract` only has the Soroswap entry points, so every call for 1 or 2 fails against it. A move from 0 to 1 or 2 still runs the Soroswap withdraw first, and the tokens then stay idle in the vault.

## Run it

Node 20 or later.

```bash
cp .env.example .env
npm install
npm run dev        # http://localhost:3334
```

Compiled:

```bash
npm run build
npm start
```

## Routes

| Route | What it does |
| --- | --- |
| `GET /` | `{ message }`, to see that the API is up |
| `GET /health` | `{ status: "ok" }` |
| `GET /api/run/all` | analyzes every vault of `FACTORY_ID`, returns `{ success, count, results }` |
| `GET /api/run/user/:userAddress` | only the vaults owned by that address, returns `{ success, userAddress, count, results }` |
| `GET /api/run/pool/:poolId` | one vault by its numeric factory ID, returns `{ success, poolId, result }`, where `result` is an array too |
| `GET /api/feepayer/xlm-balance` | XLM balance of the account behind `FEEPAYER_SECRET` (or `SECRET`) |

The `/api/run` routes are GETs with no authentication, and they can submit deposits and migrations on chain. Errors come back as `{ success: false, error }` with status 400 or 500.

```bash
curl http://localhost:3334/api/run/all
```

```json
{
  "success": true,
  "count": 1,
  "results": [
    {
      "poolId": 1,
      "lobsterAddress": "C...",
      "token0": "C...",
      "token1": "C...",
      "currentPool": 0,
      "newPool": null,
      "error": "null"
    }
  ]
}
```

`newPool` is the DEX the analysis picked, or `null` when the vault stays where it is. `error` is the string `"null"` when nothing failed. A vault whose analysis threw comes back with `currentPool: -1` and the message in `error`.

## Configuration

`.env` is read with dotenv. In Docker, pass the same variables with `--env-file` or `-e`. `.env.example` is valid for both and leaves the secrets empty: `SECRET`, `FEEPAYER_SECRET`, `SIGNER_SECRET_HEX` and `API_KEY`.

| Variable | Default | Use |
| --- | --- | --- |
| `PORT` | `3334` | API port |
| `HOST` | `0.0.0.0` | only printed in the startup log, the server listens on all interfaces |
| `RPC_URL` | `https://soroban-testnet.stellar.org` | Soroban RPC for every contract call |
| `NETWORK_PASSPHRASE` | | when unset, the contract clients guess it from `RPC_URL` (testnet when the URL contains `testnet` or `futurenet`, public otherwise), but multisig signing falls back to the testnet passphrase. Set it on mainnet. |
| `FACTORY_ID` | required | Lobster factory to read vaults from |
| `FEEPAYER_SECRET` | `SECRET` | Stellar secret that signs and pays for everything the API sends. Without it or `SECRET`, every `/api/run` call returns 500. An empty `FEEPAYER_SECRET=` line counts as set and does not fall back to `SECRET`, so delete the line if you only fill in `SECRET`. |
| `SECRET` | | used when `FEEPAYER_SECRET` is unset. `src/scripts/testTX*.ts` need it. |
| `CALLER_ADDRESS` | public key of the signing secret | address passed as `caller` to the vault. In multisig modes, the multisig account. |
| `SOROSWAP_ROUTER` | | router passed to `add_liquidity_soroswap` and `withdraw_soroswap`. It has to be the router the vault was created with. |
| `PROCESS_URL` | `http://localhost:8085/data/last` | DataProcess endpoint that returns the pool address and latest APR of a pair |
| `API_KEY` | | key for the Soroswap price API (`api.soroswap.finance`). Without it, a vault that already has a position comes back with an error. |
| `NETWORK` | `mainnet` | network sent to the price API, `mainnet` or `testnet` |

## Multisig

| Variable | Default | Use |
| --- | --- | --- |
| `MULTISIG_MODE` | `single` | `single`, `multisig-local` (or `local`), `multisig-external` (or `external`) |
| `MULTISIG_SIGNER_SECRETS` | | comma-separated signer keys. Local mode needs `S...` secrets, external mode also takes 64-character hex ed25519 seeds. |
| `MULTISIG_SIGNER_APIS` | | comma-separated base URLs of signer services, for example `http://signer-a:4001`. The API calls `/health` and `/sign` on each. |
| `MULTISIG_TYPE` | `n-of-n` | `n-of-n` collects every signature, sorted by public key. `1-of-n` uses the first signer that answers. |

External mode needs at least one entry in `MULTISIG_SIGNER_SECRETS` or `MULTISIG_SIGNER_APIS`, otherwise every `/api/run` call returns 500.

Each signer service holds one key:

| Variable | Default | Use |
| --- | --- | --- |
| `SIGNER_SECRET_HEX` | required | the signer's 32-byte ed25519 seed, as 64 hex characters. The service logs its public key, never the seed. |
| `SIGNER_API_PORT` | `4001` | port |

It answers `POST /sign` with a JSON body `{ "payloadHash": "<64 hex chars>", "index": 0 }` and returns `{ index, publicKey, signature }` in hex. `GET /health` returns `{ status: "ok", publicKey }`. There is no authentication on `/sign`, so only the API should be able to reach a signer. Run it with `npm run dev:signer` or `npm run start:signer`, or `node dist/multisig/signerApi.js` after a build.

## Docker

The `Dockerfile` builds both images from the same sources.

```bash
docker build -t decisiontaker-server --target server .
docker build -t decisiontaker-signer --target signer .

docker run --rm -p 3334:3334 --env-file .env --name decisiontaker-api decisiontaker-server

# one container per signer; SIGNER_SECRET_HEX is read from your shell, so export each seed before its run
docker run --rm -p 127.0.0.1:4001:4001 -e SIGNER_SECRET_HEX -e SIGNER_API_PORT=4001 --name signer-a decisiontaker-signer
docker run --rm -p 127.0.0.1:4002:4002 -e SIGNER_SECRET_HEX -e SIGNER_API_PORT=4002 --name signer-b decisiontaker-signer
```

The server image declares port 3000, but the app listens on `PORT` (3334 unless set), so map that one. Docker reads `--env-file` lines literally: no spaces around `=`, no quotes. List the signer URLs in `MULTISIG_SIGNER_APIS` once they're reachable. With the API in a container too, a URL like `http://signer-a:4001` only resolves when the containers share a user-defined network (`docker network create`, then `--network` on each `docker run`).

## Scripts

| Command | What it runs |
| --- | --- |
| `npm run dev` | `tsx watch src/api/server.ts` |
| `npm run build` | `tsc -p tsconfig.json`, output in `dist/` |
| `npm start` | `node dist/src/api/server.js` |
| `npm run dev:signer` | `tsx watch multisig/signerApi.ts` |
| `npm run start:signer` | `tsx multisig/signerApi.ts` |
| `npm run test:multisig-simple` | `src/scripts/testMultisigSimple.ts` |
| `npm run test:multisig` | `src/services/multisig/multisig.ts`, one `add_liquidity_soroswap` call on testnet signed with every key in `MULTISIG_SIGNER_SECRETS` |

There are no unit tests. The files in `src/scripts/` run against the network in `.env` and submit real transactions. `testMultisigSimple.ts` sends one `add_liquidity_phoenix` call to `CONTRACT_ID` through the multisig signing path, so it's the place to read that flow end to end. `testTXAdmin.ts` and `testTXMultisig.ts` (run them with `npx tsx`) move every vault of `FACTORY_ID` into Soroswap.

## Layout

| Path | Contents |
| --- | --- |
| `src/api/server.ts` | Express app and routes |
| `src/services/analysis/` | `poolAnalyzer.ts` (APR rule, price and DataProcess calls) and `poolAnalyzerMultisig.ts`, which the routes run |
| `src/services/operations/` | deposit, withdraw and migration calls, single key or multisig |
| `multisig/signerApi.ts` | signer service |
| `bindings/` | `lobster.ts`, `factory.ts` and `token.ts`, generated with `stellar contract bindings typescript`, plus `*Client.ts` wrappers that sign with a local secret |
| `Dockerfile` | `server` and `signer` targets |
