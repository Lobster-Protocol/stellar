# DecisionTaker

DecisionTaker is a TypeScript/Express service that automates liquidity-pool due diligence for Soroban-based DEX ecosystems (Soroswap, Phoenix, Aquarius). It compares APRs, inspects balances, and—when configured—can trigger multisig pool migrations using custom bindings that ship with the repo. The project ships with a REST API (for triggering analyses) and a lightweight signer API used by multisig deployments.

---

## Highlights
- Runs targeted or portfolio-wide pool analysis with a single HTTP call.
- Supports single-signer, local multisig, and external multisig flows.
- Ships with two Docker targets (analysis API + signer API) so you can scale them independently.
- Provides generated Soroban bindings for interacting with Lobster, Factory, and Token contracts.

---

## Project Layout

| Path | Purpose |
| --- | --- |
| `src/server.ts` | Express entry point exposing health + analysis routes. |
| `src/poolAnalyzer*.ts` | Analysis logic plus multisig orchestration. |
| `multisig/signerApi.ts` | Stand-alone signer microservice (used in N-of-N external multisig). |
| `bindings/` | Soroban client bindings generated via `soroban contract bindings`. |
| `Dockerfile` | Multi-stage build producing `server` and `signer` images from the same sources. |

---

## Prerequisites
- Node.js 20+
- npm 10+
- Docker (for containerized workflows)
- Access to Soroban RPC + Lobster contracts (set through env vars)

---

## Local Development

```bash
cp .env.example .env   # create your local env file (see vars below)
npm install
npm run dev            # start Express in watch mode (defaults to http://localhost:3334)
```

Build and run the compiled server:

```bash
npm run build
npm start
```

Unit/integration scripts (optional helpers in `src/test*.ts`) can be executed with `ts-node` or by extending the npm scripts.

---

## API Routes

All routes live under the main Express server (default port `3334`). Each request returns JSON and surfaces errors with HTTP 4xx/5xx codes.

| Method | Route | Description |
| --- | --- | --- |
| `GET /` | Basic status message to confirm the API is reachable. |
| `GET /health` | Health probe used by Docker/Kubernetes. |
| `GET /api/run/all` | Runs the analyzer across every known Lobster pool. Returns `{ success, count, results[] }`. |
| `GET /api/run/user/:userAddress` | Filters analysis to pools created by the provided Stellar address. |
| `GET /api/run/pool/:poolId` | Targets a specific pool ID and uses the multisig-aware analyzer. |

Example request:

```bash
curl http://localhost:3334/api/run/user/CBX5O4ZT...UTN5JCOH
```

Response (trimmed):

```json
{
  "success": true,
  "userAddress": "CBX5O4ZT…",
  "count": 2,
  "results": [
    {
      "poolId": 42,
      "lobsterAddress": "CCU3…",
      "token0": "CBW6…",
      "token1": "CD7P…",
      "currentPool": 1,
      "newPool": 2
    }
  ]
}
```

Every result object includes enough metadata (tokens, APR decision, migration target, error string) for downstream automation.

---

## Environment Variables

Create a `.env` (or inject values via Docker/Kubernetes secrets). The most important options are grouped below.

### Core Analyzer + API (`src/server.ts`, `src/poolAnalyzer*.ts`)

| Variable | Required | Description |
| --- | --- | --- |
| `HOST` | No (default `0.0.0.0`) | Address Express binds to. |
| `PORT` | No (default `3334`) | Public API port. |
| `NETWORK` | No (default `mainnet`) | Market data target (`mainnet` or `testnet`). |
| `RPC_URL` | Yes | Soroban RPC endpoint used for contract calls. |
| `NETWORK_PASSPHRASE` | Yes | Matching passphrase for the RPC target. |
| `SECRET` | Yes | Stellar secret for general contract calls. |
| `FEEPAYER_SECRET` | Yes for multisig | Stellar secret that pays fees when migrating pools. |
| `FACTORY_ID` | Yes | Factory contract ID. |
| `PROCESS_URL` | No (defaults to local) | Data service used by `getDataLast`. |
| `API_KEY` | Maybe | API token for external market data (falls back to demo key). |
| `CALLER_ADDRESS` | Optional | Address recorded as the caller of pool operations. |
| `SOROSWAP_ROUTER` | Optional | Router contract used during migrations. |

### Multisig Coordination (`src/poolAnalyzerMultisig.ts`)

| Variable | Description |
| --- | --- |
| `MULTISIG_MODE` | `single`, `multisig-local`, or `multisig-external`. |
| `MULTISIG_SIGNER_SECRETS` | Comma-separated Stellar secrets or 32-byte hex seeds for local signers. |
| `MULTISIG_SIGNER_APIS` | Comma-separated URLs (e.g. `http://signer-a:4001/sign`) for external signer services. |
| `MULTISIG_TYPE` | `1-of-n` or `n-of-n` (see `src/testMultisigSimple.ts`). |

### Signer Microservice (`multisig/signerApi.ts`)

| Variable | Required | Description |
| --- | --- | --- |
| `SIGNER_SECRET_HEX` | Yes | 32-byte ed25519 seed (64 hex chars). Derives the signer keypair. |
| `SIGNER_API_PORT` | No (default `4001`) | HTTP port for this signer instance. |

---

## Docker: Two-Container System

The `Dockerfile` exposes two targets so that you can run the analysis API and any number of signer APIs independently.

### Build images

```bash
# Build the Express analysis API
docker build -t decisiontaker-server --target server .

# Build the signer microservice (reusable for every signer node)
docker build -t decisiontaker-signer --target signer .
```

### Run containers

```bash
# 1) API server (requires your .env values for RPC + secrets)
docker run --rm \
  -p 3334:3000 \
  --env-file .env \
  --name decisiontaker-api \
  decisiontaker-server

# 2) Signer nodes (repeat per signer with unique secrets/ports)
docker run --rm \
  -p 4001:4001 \
  -e SIGNER_SECRET_HEX=0000...0001 \
  -e SIGNER_API_PORT=4001 \
  --name signer-a \
  decisiontaker-signer

docker run --rm \
  -p 4002:4002 \
  -e SIGNER_SECRET_HEX=0000...0002 \
  -e SIGNER_API_PORT=4002 \
  --name signer-b \
  decisiontaker-signer
```

Once the signer pods are reachable, list their URLs in `MULTISIG_SIGNER_APIS` so the analyzer can request signatures when executing pool migrations.

---

## Troubleshooting

- **`401` or RPC errors**: Validate `SECRET`, `FEEPAYER_SECRET`, and `FACTORY_ID`. Ensure the account trusts the required tokens.
- **`MULTISIG_MODE=external` but no signers**: Confirm both `MULTISIG_SIGNER_SECRETS` and/or `MULTISIG_SIGNER_APIS` are set.
- **Docker health check fails**: Verify `HOST`/`PORT` mappings and that `npm run build` completed during the image stage.

---

## Useful Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Runs `ts-node-dev` with hot reload for the Express API. |
| `npm run build` | Transpiles TypeScript to `dist/`. |
| `npm start` | Launches the compiled server (`dist/src/server.js`). |
| `node dist/multisig/signerApi.js` | Runs the signer microservice locally (after `npm run build`). |

---

Need more detail? Check `src/testMultisigSimple.ts` for example multisig flows, or inspect the bindings in `bindings/*.ts` for on-chain method signatures.