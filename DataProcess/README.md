# DataProcess — Lobster Protocol Analytics & API

A TypeScript service that pulls on-chain swap/pool data from SubQuery, computes AMM analytics (prices, volumes, fees, TVL-derived metrics, PnL, APR, Sharpe, etc.), and stores results as compressed JSON in S3-compatible storage (MinIO by default). An Express API serves the latest metrics per pair.

- **Data source**: SubQuery GraphQL (configurable via `SUBQUERY_URL`)
- **Storage**: S3-compatible (MinIO in `docker-compose.yml`)
- **Protocols**: `soroswap`, `phoenix`, `aquarius`

## Quick start

```bash
# From DataProcess/
npm install
npm run api     # starts the Express API at :8085
```

Or with Docker (recommended, runs MinIO and API together):

```bash
# From DataProcess/
docker compose up -d
# API → http://localhost:8085
# MinIO Console → http://localhost:9001 (user: lobster / pass: lobster-secret-123)
```

## What it does

1) Queries swaps and pool events for a token pair from SubQuery.
2) Computes time-series metrics using analytical formulas.
3) Writes the latest computed snapshot to S3 as `gzip`-compressed JSON.
4) Exposes endpoints to fetch the latest metrics or just the last values.

Core pipeline lives in `src/process/querySwaps.ts` with three main steps:
- `queryPoolData(token0, token1, protocol)`
- `calculateAllMetrics(poolData)`
- `saveToDatabase(metrics, protocol)` → uploads to S3 at `protocol/<token0>_<token1>.latest.json.gz`

A pool discovery script `src/process/poolsPoller.ts` lists new pairs per protocol.

## API

Starts with `npm run api` or via Docker service `data-api`.

- GET `/health`
  - Returns `{ ok: true }`.

- POST `/process`
  - Body: `{ token0: string, token1: string, protocol: "soroswap"|"phoenix"|"aquarius" }`
  - Kicks off processing in the background and responds `202 { accepted: true }` immediately.
  - When processing completes, the server logs a completion message and responds once with a JSON containing the last values computed during that run (best-effort, mainly for debugging).

- GET `/data?token0=...&token1=...&protocol=...`
  - Reads and returns the full latest metrics JSON from S3.

- GET `/data/last?token0=...&token1=...&protocol=...`
  - Returns only the final/most recent values for each metric (thin payload).

Example requests:

```bash
# Trigger processing (background)
curl -s -X POST http://localhost:8085/process \
  -H 'content-type: application/json' \
  -d '{"token0":"CCWHNL...NLNHL","token1":"CDF3IU...G4LT","protocol":"soroswap"}'

# Fetch full data snapshot (after processing finishes)
curl -s 'http://localhost:8085/data?token0=CCWHNL...NLNHL&token1=CDF3IU...G4LT&protocol=soroswap' | jq .

# Fetch only last values
curl -s 'http://localhost:8085/data/last?token0=CCWHNL...NLNHL&token1=CDF3IU...G4LT&protocol=soroswap' | jq .
```

## Output format (S3 object)

Key: `protocol/<token0>_<token1>.latest.json.gz`

Decompressed JSON shape:

```json
{
  "calculatedAt": "2025-09-23T12:34:56.000Z",
  "token0Address": "...",
  "token1Address": "...",
  "lists": {
    "spotPriceList": ["..."],
    "normalizedTVLList": ["..."],
    "globalToken0ExposureList": ["..."],
    "averagePriceList": ["..."],
    "normalizedVolumeList": ["..."],
    "capturedFeesList": ["..."],
    "poolFeeRateList": ["..."],
    "turnoverFactor": "...",
    "profit": "...",
    "profitList": ["..."],
    "percentLossBalancedList": ["..."],
    "pnl": "...",
    "pnlList": ["..."],
    "annualizationFactorList": ["..."],
    "aprList": ["..."],
    "periodReturnList": ["..."],
    "instantaneousVolatilityList": ["..."],
    "averageVolatilityList": ["..."],
    "volatilityVarianceList": ["..."],
    "averageTVLList": ["..."],
    "tvlVarianceList": ["..."],
    "efficiencyList": ["..."],
    "stabilityList": ["..."]
  }
}
```

Notes:
- Numeric values are produced with `decimal.js`; serialization may be strings.
- Lists are time-ordered based on fetched events.

## Configuration

Environment variables (API and processing):

- `PORT` — API port (default `8085`)
- `SUBQUERY_URL` — GraphQL endpoint for SubQuery (default `http://localhost:3000`)
- `S3_ENDPOINT` — S3 endpoint (default `http://127.0.0.1:9000` or `minio:9000` in Docker)
- `S3_REGION` — S3 region (default `us-east-1`)
- `S3_ACCESS_KEY` — S3 access key (default `lobster`)
- `S3_SECRET_KEY` — S3 secret (default `lobster-secret-123`)
- `S3_BUCKET` — bucket name (default `lobster`)
- `S3_OVERWRITE` — if set truthy, allows overwriting objects

`docker-compose.yml` already wires sane defaults and creates the `lobster` bucket.

## Scripts

From `package.json`:

- `npm run api` — start the Express API (ts-node)
- `npm run run:swap` — run the processing example in `src/process/test.ts`
- `npm run pools:poll` — list new pairs across protocols once and then on an interval
- `npm run dev` — ts-node on `src/index.ts` (stub entry)
- `npm run build` — compile TypeScript to `dist/`
- `npm test` — run Jest tests

Examples:

```bash
# Run a one-off processing sample
npm run run:swap

# Poll pairs from all protocols once, then every 12h
POOL_POLL_INTERVAL_MS=$((6*60*60*1000)) npm run pools:poll
```

## Development notes

- SubQuery client: see `src/utils/graphql.ts` (`SUBQUERY_URL` controls the endpoint).
- Metrics computation: see `src/formulas/amm.ts` and `src/process/querySwaps.ts`.
- Validation helpers live in `src/utils/validation.ts`.
- S3 writer is `src/utils/bd.ts` (uploads `.json.gz`).

## Docker services

`docker-compose.yml` defines:
- `minio` — S3-compatible storage + web console
- `minio-init` — creates `lobster` bucket and sets public download
- `data-api` — Node 20 container running the API with your working directory mounted

Mounts:
- `/home/esteban/Desktop/Lobster/DataProcess:/app` (live-reloads code in the container)
- MinIO data at `/home/esteban/Desktop/Lobster/.volumes/minio`

## Troubleshooting

- 502/timeout from GraphQL: ensure `SUBQUERY_URL` is reachable and returns data.
- Empty metrics: verify the token pair exists in SubQuery and timestamps are within the last year.
- S3 read errors: confirm MinIO is up and the `lobster` bucket exists (compose creates it).
- Node fetch missing: use Node 18+ (the code relies on `globalThis.fetch`).

## License

MIT