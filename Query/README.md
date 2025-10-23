# Lobster SubQuery Indexer (Stellar/Soroban)

This project is a SubQuery indexer tailored for Lobster to track AMM activity on Stellar/Soroban.

It indexes on-chain events from multiple DEX protocols and exposes them via GraphQL and an optional WebSocket stream:

- Phoenix AMM: pool creation, provide/withdraw liquidity, swaps
- Soroswap: pool events and swaps
- Aquarius: pool events and swaps (by `contractId`)

If you're new to SubQuery, see the official docs at the SubQuery Academy (`https://academy.subquery.network`).

## Quick Start

1) Install the SubQuery CLI: `npm install -g @subql/cli`
2) Install dependencies in this folder: `npm install` (or `yarn install`)
3) Build and run via Docker: `clear && docker system prune -a --volumes && npm run dev`

This will generate types, build the project to `dist/`, and start Postgres, the indexer, and the GraphQL service. Visit `http://localhost:3000` to explore the GraphQL schema.

## What is Indexed

- Phoenix entities: `NewPairPhoenixEntity`, `AddLiquidityPhoenixEntity`, `RemoveLiquidityPhoenixEntity`, `SwapPhoenixEntity`
- Soroswap entities: created via `src/Soroswap/soroswapparser.ts`
- Aquarius entities: created via `src/Aquarius/aquariusparser.ts`

Events are consumed by handlers declared in `project.ts` and implemented in `src/mappings/mappingHandlers.ts` that delegate to protocol-specific parsers. Each fragment from a Soroban event is tied together per-transaction using the tx hash as the entity id.

## Configuration

- Network and endpoints are defined in `project.ts` (testnet by default). Adjust `chainId`, `endpoint`, and `sorobanEndpoint` as needed.
- Event filters and handler bindings live in `project.ts` under `dataSources[0].mapping.handlers`.
- GraphQL schema is in `schema.graphql`; generated types appear under `src/types` after `npm run codegen`.
- Optional WebSocket broadcaster is in `src/services/websocketService.ts` and is started from `src/index.ts`.

## Query your project

For this project, you can try to query with the following GraphQL code to get a taste of how it works.

```graphql
query {
  swapAquariusEntities(first: 5) {
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

Results (example):

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
        {
          "id": "5173d87d52691afa0ed0ec821a9d436b73e7b845f4ae0ffcebdd7c1d46522b72",
          "contract": "GDAX2ZVJTBHJZ46E2IKSBNAC3LT2MJI2PVMKPZ3ZCR63HIEWJZMCRM7P",
          "amount0": "60",
          "amount1": "85",
          "sender": "GBDLTYLVIFS44CA2OX6RFGYESHY5U25BM2YSU6XAQLLDKJ65CBIVZHRL",
          "block": "313805",
          "timestamp": "1756763129"
        },
        {
          "id": "c54aeee5876713fded599a287450b90ef782310a32d38f27c2efdebcabdc662e",
          "contract": "GDAX2ZVJTBHJZ46E2IKSBNAC3LT2MJI2PVMKPZ3ZCR63HIEWJZMCRM7P",
          "amount0": "60",
          "amount1": "85",
          "sender": "GBDLTYLVIFS44CA2OX6RFGYESHY5U25BM2YSU6XAQLLDKJ65CBIVZHRL",
          "block": "313792",
          "timestamp": "1756763064"
        },
        {
          "id": "fe4069fbb2eccc444ddde72c7635f6c45c6b901292fd8d0d5a7b0956d00c5feb",
          "contract": "GDAX2ZVJTBHJZ46E2IKSBNAC3LT2MJI2PVMKPZ3ZCR63HIEWJZMCRM7P",
          "amount0": "60",
          "amount1": "85",
          "sender": "GBDLTYLVIFS44CA2OX6RFGYESHY5U25BM2YSU6XAQLLDKJ65CBIVZHRL",
          "block": "313801",
          "timestamp": "1756763109"
        },
        {
          "id": "e59909fa885f4fca562cf12687726b6c6d2516888b131cb6052fe910ebecbc2a",
          "contract": "GDAX2ZVJTBHJZ46E2IKSBNAC3LT2MJI2PVMKPZ3ZCR63HIEWJZMCRM7P",
          "amount0": "60",
          "amount1": "85",
          "sender": "GBDLTYLVIFS44CA2OX6RFGYESHY5U25BM2YSU6XAQLLDKJ65CBIVZHRL",
          "block": "313799",
          "timestamp": "1756763099"
        }
      ]
    }
  }
}
```

Use the GraphQL docs panel in the playground to explore all entities and fields.

## Running locally

- `npm run codegen` — generate types from GraphQL schema
- `npm run build` — build to `dist/`
- `docker compose up` — start Postgres, the indexer and query service

If you change `schema.graphql` or mappings, re-run codegen/build.

## Notes & Tips

- Ensure your Horizon endpoint is an archive node or indexing will stall on older ledgers.
- For rate-limited endpoints, reduce `--batch-size` and `--workers` in `docker-compose.yml`.
- Handlers are split per-topic to reconstruct full transactions across multiple event fragments.

## Need Help?

- SubQuery docs: `https://academy.subquery.network`
- Discord: `https://discord.com/invite/subquery`

clear && docker system prune -a --volumes && docker load -i subql-query_latest.tar && docker load -i subql-node-stellar_v6.0.3-0.tar && docker load -i nats_2.10-alpine.tar && npm run dev