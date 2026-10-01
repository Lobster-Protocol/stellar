# Query

SubQuery indexer for the Soroswap, Phoenix and Aquarius pools on Stellar. It reads Soroban contract events, rebuilds swaps, liquidity changes and new pools from them, stores the records in Postgres and serves them over GraphQL. Each new pool, deposit, withdrawal and swap, once complete, is also posted to a small HTTP bridge that publishes it on NATS (see [NATS_README.md](NATS_README.md)).

```
Horizon + Soroban RPC
          |
    subquery-node (handlers in src/) --POST /publish--> express-nats-service --> nats-server
          |
       postgres
          |
    graphql-engine (GraphQL over HTTP and WebSocket, port 3000)
```

## Requirements

- Node 20 or later. `@subql/cli` is a dev dependency on the `latest` tag, and its current release requires Node 20. `npm install` brings it in, so there is nothing to install globally.
- Docker with Compose v2 (`docker compose`).
- A Horizon endpoint that keeps full history (a non-pruned archive node) and a Soroban RPC endpoint.

## Layout

| Path | Contents |
| --- | --- |
| `project.ts` | SubQuery manifest: network, endpoints, start block, event handlers. `npm run build` generates `project.yaml` from it. |
| `schema.graphql` | Entities and indexes |
| `src/mappings/mappingHandlers.ts` | Handler entry points and `postToAPI` |
| `src/Soroswap`, `src/Phoenix`, `src/Aquarius` | Parsers that turn events into entities |
| `src/pool_repertory/` | Known pools and their tokens, per protocol, for testnet and mainnet |
| `src/services/natsService.ts` | JetStream helper that the handlers do not call (see NATS_README.md) |
| `src/test/test-nats.js` | Prints every NATS message |
| `bridge-API/` | Express service that publishes posted records on NATS |
| `docker/` | Postgres 16 image with the `btree_gist` extension |
| `docker-compose.yml` | Local stack |

## Configuration

`project.ts` loads `.env`, or `.env.<NODE_ENV>` when `NODE_ENV` is set to anything other than `production` (`npm run build:develop` reads `.env.develop`). The values end up in the generated manifest, so rebuild after changing them. `.env` comes with testnet values, and `.env example` is an identical copy to start other files from.

| Variable | Default | Meaning |
| --- | --- | --- |
| `CHAIN_ID` | `Test SDF Network ; September 2015` | Network passphrase. Mainnet is `Public Global Stellar Network ; September 2015`. |
| `HORIZON_ENDPOINT` | `https://horizon-testnet.stellar.org` | Horizon URLs, comma-separated |
| `SOROBAN_ENDPOINT` | `https://soroban-testnet.stellar.org` | Soroban RPC URL |
| `START_BLOCK` | `1675410` (`.env` sets `1675415`) | First ledger to index |
| `AQUARIUS_CONTRACT_ID` | the testnet ID | Contract whose `add_pool`, `deposit_liquidity` and `withdraw` events are indexed. `.env example` has the testnet and mainnet IDs. |
| `NETWORK` | `testnet` | Picks the testnet or mainnet lists in `src/pool_repertory/` |
| `CHAIN_ID_NUM` | unset | Copied into the `chain_id` field of each NATS message |

`NETWORK` and `CHAIN_ID_NUM` are read by the handlers while indexing, not by `project.ts`. SubQuery hands the project's `.env` (that file only, whatever `NODE_ENV` says) to handler code starting with `@subql/node-core` 18.4.0, released in September 2025. The `subql-node-stellar:v6.0.3-0` image pinned in `docker-compose.yml` was published in August 2025 and predates it, so in this stack the handlers use their defaults: testnet pool lists and no `chain_id`.

## Running locally

```bash
npm install
npm run build
docker compose up
```

`npm run dev` does the build, pulls the images and starts the stack in one go. `npm run start:docker` pulls and starts without building.

| Service | Host port | Role |
| --- | --- | --- |
| `postgres` | 5432 | Indexed data, kept in `.data/postgres` |
| `subquery-node` | 3001 | Indexer, with `/ready` and `/metrics` |
| `graphql-engine` | 3000 | GraphQL API, playground at http://localhost:3000 |
| `nats-server` | 4222, 8222 | NATS with JetStream enabled; 8222 is the monitoring port |
| `express-nats-service` | 8080 | Bridge from the indexer to NATS |

Database credentials are in `docker-compose.yml` and `docker/pg-Dockerfile`. To reindex from `START_BLOCK`, stop the stack, delete `.data/postgres` and start it again.

The node runs with `--unsafe` because the handlers use Node's `http` and `https` modules (to post to the bridge, and in the Phoenix parser to fetch transaction meta from a Soroban RPC), which the SubQuery sandbox does not allow otherwise. `--workers=1` and `--batch-size=2` keep the request rate low for public endpoints; raise them in `docker-compose.yml` if yours allow it. Both the node and the query service run with `--subscription`, so GraphQL subscriptions work over WebSocket on port 3000.

## Entities

Handlers are declared in `project.ts`; fields and indexes are in `schema.graphql`.

Soroswap: `new_pair` from the factory, `add` and `remove` from the router, `swap` and `sync` from the pair contracts. They map to `NewPairEventEntity`, `AddLiquidityEventEntity`, `RemoveLiquiditEntity`, `SwapEventEntity` and `SyncEventEntity`. A swap takes its reserves from the `sync` event emitted just before it in the same transaction.

Phoenix emits one event per field (sender, token, amount and so on), so the handlers collect the pieces under the transaction hash, plus the contract ID for liquidity and swaps, until the record is complete. `NewPairPhoenixEntity` gets the two tokens, the pool address (`pair`) and the transaction's source account as `creator`; its `fees`, `initial_0`, `initial_1` and `staking_contract` fields stay empty. `SwapPhoenixEntity` holds the sell and buy tokens and amounts, the spread and the referral fee; the `referral_fee_amount` handler then reads the fee and the reserves from the transaction meta, adds the pool's tokens and publishes the swap. Liquidity goes to `AddLiquidityPhoenixEntity` and `RemoveLiquidityPhoenixEntity`.

Aquarius: `add_pool`, `deposit_liquidity` and `withdraw` are filtered on `AQUARIUS_CONTRACT_ID` and stored as `NewPairAquariusEntity`, `AddLiquidityAquariusEntity` and `RemoveLiquidityAquariusEntity`. `trade` and `update_reserves` have no contract filter. A trade is kept only when its contract is a known pool (an indexed `add_pool` or an entry in `src/pool_repertory/`) and becomes a `SwapAquariusEntity`. The `update_reserves` handler is written to fill in that trade's reserves, publish it and store a `ReserveAquariusEntity`, but its lookup misses the trade (see [Known issues](#known-issues)).

When a pool's creation was not indexed (it happened before `START_BLOCK`, for example), the handlers take the pool's tokens from `src/pool_repertory/`. Soroswap swaps and syncs and Aquarius trades on a pool found in neither place are dropped; a Phoenix swap on such a pool is saved without its tokens and reserves and is not published.

`Account`, `Transfer` and `Payment` come from the SubQuery starter schema. No handler writes them.

## Querying

The playground is at http://localhost:3000. Field names are camel-cased in GraphQL (`amount_0` in the schema is `amount0`), and amounts, ledgers and timestamps are stored as strings. Timestamps are 10-digit Unix seconds, so sorting on them as text gives time order.

```graphql
query LatestAquariusSwaps {
  swapAquariusEntities(first: 5, orderBy: TIMESTAMP_DESC) {
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

## NATS

Once a new pool, deposit, withdrawal or swap is complete and saved, the parser posts it to `express-nats-service`, which publishes it on `lobster.<dex>.<event>`, for example `lobster.phoenix.swap`. These are plain NATS messages and nothing stores them: a subscriber only gets what is published while it is connected. [NATS_README.md](NATS_README.md) lists the subjects and the payload, with a subscriber example.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run codegen` | Generates the entity classes in `src/types` from `schema.graphql`. |
| `npm run build` | `subql codegen`, then `subql build`. Output in `dist/`. |
| `npm run build:develop` | Same build with `NODE_ENV=develop`. |
| `npm run dev` | Build, `docker compose pull`, `docker compose up --remove-orphans`. |
| `npm run start:docker` | Pull and start, no build. |
| `npm test` | Build, then `subql-node-stellar test`. `src/` has no SubQuery test files for it to run. |

## Extending

- New pool: add it to the matching file in `src/pool_repertory/`, for each network that has it.
- New contract or event: declare a handler in `project.ts` (topics, plus `contractId` when the topics are not specific enough), export a function with that name from `src/mappings/mappingHandlers.ts` that calls your parser, add the entity to `schema.graphql`, then run `npm run build`.
- New NATS message: call `postToAPI("lobster.<dex>.<event>", payload)` once the entity is saved.

## Troubleshooting

- Indexing stalls on old ledgers: the Horizon endpoint has to keep full history. Pruned nodes cannot serve old ledgers.
- Rate limits: lower `--batch-size` and `--workers` in `docker-compose.yml`, or use a private endpoint.
- GraphQL returns nothing: check `curl http://localhost:3001/ready` and `docker compose logs subquery-node`.
- Nothing on NATS: `docker compose logs express-nats-service` shows every publish. Check the subject you subscribe to.
- Schema changes do not show up: run `npm run build` and restart the node.

## Known issues

- Aquarius: the `update_reserves` handler looks for the trade with `txHash` equal to the transaction hash followed by the previous event ID, while trades store the bare hash. The lookup never matches, so Aquarius swaps keep empty reserve fields, no `ReserveAquariusEntity` is written and nothing is published on `lobster.aquarius.swap`.
- Aquarius: a trade on a pool known only from `src/pool_repertory/` is stored with empty `token_0` and `token_1`.
- Phoenix: the swap handler reads the transaction meta with a `getTransaction` call to `soroban-testnet.stellar.org`, hard-coded in `src/Phoenix/phoenixparser.ts`. When that RPC does not have the transaction (any mainnet swap, or a testnet one older than what the RPC keeps), the swap is saved with empty `token_0`, `token_1`, `amount_0`, `amount_1`, `fee` and reserves, and is not published.

## Monitoring

The node serves Prometheus metrics at http://localhost:3001/metrics. `subql_indexer_processing_block_height` is the ledger being processed. Compare it with `subql_indexer_target_block_height` to see how far behind the indexer is, or alert when it stops increasing.

```bash
curl -s http://localhost:3001/metrics | grep subql_indexer_processing_block_height
```

## References

- SubQuery documentation: https://subquery.network/doc/
- SubQuery Discord: https://discord.com/invite/78zg8aBSMG
- NATS documentation: https://docs.nats.io
