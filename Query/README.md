## Lobster Query Indexer

A production-ready SubQuery project that ingests Soroban events on Stellar to keep a unified view of AMM activity for Lobster. The indexer watches Phoenix, Soroswap, and Aquarius liquidity pools, stores normalized entities in Postgres, exposes them through GraphQL, and fan-outs near-real-time updates over NATS.

```
           ┌──────────────┐     Soroban RPC / Horizon
on-chain → │ SubQuery Node├───────────────┬────────────┐
           └──────┬───────┘               │            │
                  │                       │            │
                  ▼                 parses handlers    │
           PostgreSQL ◄──── dist/mappings ◄─ project.ts│
                  │                                     
                  │ GraphQL API                         │
                  ▼                                     
         subql-query service ── HTTP & WS ── clients    
                  │                                     
                  ├─ optional Express bridge → NATS JetStream → subscribers
                  └─ SDK consumers / dashboards
```

If you are new to SubQuery, the [SubQuery Academy](https://academy.subquery.network) offers a concise primer on the tooling referenced below.

---

## Highlights

- **Multi-DEX coverage**: Phoenix XYK pools, Soroswap Factory/Router, Aquarius pools (contract-level filters).
- **Per-transaction reconstruction**: handlers stitch Soroban event fragments by transaction hash to build human-readable swap/liquidity entities.
- **Streaming bus**: `postToAPI` pushes entities into the `bridge-API` service that republishes them to `lobster.events.*` subjects on NATS with JetStream persistence.
- **Pool registries**: `src/pool_repertory/*` provides deterministic token metadata (per network) for known pools.
- **One-command local stack**: `docker compose up` launches Postgres, the SubQuery node, query service, NATS, and the REST bridge.

---

## Repository Map

| Path | Purpose |
| --- | --- |
| `project.ts` | Source-of-truth SubQuery config (network, handlers, env-aware settings). |
| `schema.graphql` | Entity definitions for swaps/liquidity/pairs across DEXes. |
| `src/mappings/mappingHandlers.ts` | Soroban event handlers delegating to protocol parsers. |
| `src/{Phoenix,Soroswap,Aquarius}` | Parser implementations that shape events into entities and trigger downstream hooks. |
| `src/services/natsService.ts` | JetStream helper to publish/consume Lobster events. |
| `bridge-API/` | Lightweight Express service that accepts POSTs from the indexer and publishes onto NATS. |
| `docker-compose.yml` | Local orchestration for Postgres, SubQuery node, GraphQL endpoint, NATS, and bridge API. |

---

## Requirements

- Node 18+
- Docker Desktop or compatible engine
- `@subql/cli` installed globally (`npm install -g @subql/cli`)
- Access to a Horizon archive endpoint (public or private)
- For production, credentials for your own Postgres and NATS deployments

---

## Environment Configuration

The project reads `.env`, `.env.develop`, etc. via `NODE_ENV`. Key variables:

| Variable | Description | Default |
| --- | --- | --- |
| `CHAIN_ID` | Stellar network passphrase. | `Test SDF Network ; September 2015` |
| `HORIZON_ENDPOINT` | Comma-separated Horizon URLs (archive required). | `https://horizon-testnet.stellar.org` |
| `SOROBAN_ENDPOINT` | Soroban RPC endpoint used by event handlers. | `https://soroban-testnet.stellar.org` |
| `START_BLOCK` | First ledger to index (integer). | `1675410` |
| `AQUARIUS_CONTRACT_ID` | Filter for Aquarius pools. | `CBCFTQSP...` |
| `CHAIN_ID_NUM` | Numeric chain identifier pushed via NATS payloads. | unset |
| `NETWORK` | `testnet` or `mainnet`, toggles pool repertory. | `testnet` |

### Example `.env.develop`

```
NODE_ENV=develop
CHAIN_ID=Test SDF Network ; September 2015
CHAIN_ID_NUM=400
HORIZON_ENDPOINT=https://horizon-testnet.stellar.org
SOROBAN_ENDPOINT=https://soroban-testnet.stellar.org
START_BLOCK=1675410
NETWORK=testnet
AQUARIUS_CONTRACT_ID=CBCF...
```

---

## Installation & First Run

1. **Install dependencies**
   ```
   npm install -g @subql/cli
   cd Query
   npm install
   ```

2. **Generate types and build**
   ```
   npm run build        # (runs codegen + build)
   ```

3. **Launch the stack**
   ```
   docker compose up
   ```

   This starts:
   - `postgres` (ledger data store)
   - `subquery-node` (indexer) on port 3001
   - `graphql-engine` (GraphQL playground/API) on port 3000
   - `nats-server` with JetStream on ports 4222/8222
   - `express-nats-service` on port 8080 (HTTP bridge)

4. **Explore the API**: Open http://localhost:3000 to view the schema and run sample queries.

To reset containers/images quickly:

```
clear && docker system prune -a --volumes && \
docker load -i subql-query_latest.tar && \
docker load -i subql-node-stellar_v6.0.3-0.tar && \
docker load -i nats_2.10-alpine.tar && \
npm run dev
```

---

## Data Sources & Entities

Handlers are declared in `project.ts` and compiled into `project.yaml`. They listen to Soroban topics and call parser functions which:

1. Normalize addresses/amounts.
2. Collect fragments per transaction (`txHash` + `contractId`).
3. Persist typed entities under `src/types/models`.
4. Optionally POST the final entity to the Express bridge (`postToAPI`) for streaming.

### Phoenix
- Pool initialization fragments (`handleNewPairPhoenix*`) store LP details plus staking contract references.
- Liquidity provide/withdraw events track senders, tokens, share amounts.
- Swap events capture sell/buy token, reserves before/after, spread and referral fees.
- Pool metadata is enriched via `pool_repertory/phoenix_pools*.ts`.

### Soroswap
- Factory and router events map to `NewPairEventEntity`, `AddLiquidityEventEntity`, `RemoveLiquiditEntity`, `SwapEventEntity`, `SyncEventEntity`.
- Event parsing ensures reserves and order details are kept for analytics.

### Aquarius
- Contract-specific filters ensure only Aquarius pools are ingested.
- Entities cover pool creation, deposits, withdrawals, swaps, and reserve syncs.

Refer to `schema.graphql` for field-level documentation and indexes.

---

## Querying the GraphQL API

Use the playground at `http://localhost:3000` or any GraphQL client. Example:

```graphql
query LatestAquariusSwaps {
  swapAquariusEntities(first: 5, orderBy: BLOCK_DESC) {
    nodes {
      id
      contract
      amount0
      amount1
      sender
      block
      timestamp
    }
  }
}
```

Example output:

```
{
  "data": {
    "swapAquariusEntities": {
      "nodes": [
        {
          "id": "e4de12c0e75d0665b1d8692216e75e8538809c7a4685246c6786752aeae66897",
          "contract": "GDAX2ZVJTBHJZ46E2IKSBNAC3LT2MJI2PVMKPZ3ZCR63HIEWJZMCRM7P",
          "amount0": "60",
          "amount1": "85",
          "sender": "GBDLTYLVIFS44CA2OX6RFGYESHY5U25BM2YSU6XAQLLDKJ65CBIVZHRL",
          "block": "313786",
          "timestamp": "1756763034"
        },
        { "... more nodes ..." }
      ]
    }
  }
}
```

The GraphQL documentation sidebar enumerates all entities, relationships, and derived fields (e.g., `Account.sentTransfers`).

---

## Event Streaming via NATS

For consumers that need push-based updates, the indexer can forward entities to NATS:

1. `src/mappings/mappingHandlers.ts` calls `postToAPI(subject, entity)` after key events.
2. `bridge-API/api.js` receives the POST on `/publish` and publishes the payload to `NATS_SUBJECT` (defaults to `events` but handlers pass e.g. `lobster.phoenix.swap`).
3. `nats-server` (JetStream enabled) persists events under the `LOBSTER_EVENTS` stream with subjects `lobster.events.*`.
4. Downstream services connect via `nats://localhost:4222` (or your cluster) and consume durable subscriptions using `NatsService`.

Monitoring: visit http://localhost:8222/healthz or the JetStream dashboard to inspect stream lag, consumers, and message throughput. See `NATS_README.md` for extended usage patterns.

---

## Useful Scripts

| Command | Description |
| --- | --- |
| `npm run codegen` | Generate TypeScript models from `schema.graphql`. Run after schema edits. |
| `npm run build` | `subql codegen && subql build`. Produces `dist/`. |
| `npm run dev` | Build + pull docker images + `docker compose up`. Handy for clean starts. |
| `npm run test` | Build then execute `subql-node-stellar test`. |
| `npm run build:develop` | Build with `NODE_ENV=develop` to load `.env.develop`. |

---

## Extending the Indexer

- **Add a new pool registry**: extend `src/pool_repertory/*.ts` with the pool and token metadata.
- **Track a new contract**: add a handler in `project.ts` with the appropriate topics or contract ID, then implement the parser and entity definitions.
- **Emit more streaming events**: wrap the entity in `postToAPI` (or use `NatsService.publishEvent`) inside the parser once all fragments are assembled.
- **Tune performance**: adjust `--workers` and `--batch-size` in `docker-compose.yml` for your Horizon rate limits. Archive nodes can handle higher throughput.

---

## Troubleshooting

- **Indexer stuck**: ensure the configured Horizon endpoint is archival. Non-archive nodes prune ledgers and will stall historical syncs.
- **Rate limits**: lower `--batch-size` and `--workers` for `subquery-node`, or point to a private RPC.
- **GraphQL empty**: confirm `subquery-node` health at `http://localhost:3001/ready` and inspect `docker compose logs subquery-node`.
- **NATS not receiving events**: check `docker compose logs express-nats-service` to confirm POSTs, and verify the subject matches your subscriptions.
- **Schema changes not reflected**: re-run `npm run codegen && npm run build`, then restart the node.

---

## Monitoring with Grafana

Expose the SubQuery node metrics endpoint to your Prometheus/Grafana stack to confirm the indexer keeps catching up:

1. **Scrape the node**: Add `http://localhost:3001/metrics` (or your deployed URL) as a Prometheus target. This endpoint is enabled by default on the `subquery-node` container.
2. **Track progress**: The metric `subql_indexer_processing_block_height` reports the latest processed ledger. Configure a Grafana panel to display it or set an alert if it stops increasing.
3. **Quick sanity check**: Even without Prometheus, you can curl the endpoint locally and verify the value moves upward over time:
   ```
   curl http://localhost:3001/metrics | grep subql_indexer_processing_block_height
   ```
   If the number is flat or decreasing, inspect your Horizon endpoint, database connectivity, or `docker compose logs subquery-node`.

This simple check ensures your indexing pipeline is live before downstream services rely on the data.

---

## Support & References

- SubQuery Academy: https://academy.subquery.network
- SubQuery Discord: https://discord.com/invite/subquery
- NATS docs: https://docs.nats.io
- Lobster internal deck: `/home/esteban/Desktop/Lobster/NATS_README.md`

Happy indexing!