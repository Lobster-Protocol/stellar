# DataProcess

Analytics service for Lobster. It reads the swaps of a token pair from the SubQuery indexer in `../Query`, computes AMM metrics (spot price, normalized TVL and volume, captured fees, PnL, APR, volatility and a few derived scores) and stores the result as one gzipped JSON object per pair in S3-compatible storage. An Express API starts the processing and serves the stored results.

The API takes `soroswap`, `phoenix` and `aquarius` pairs. Only Soroswap pairs come out with metrics; [Known issues](#known-issues) explains why the other two stop.

## Running it

Node 18 or later (the code relies on the global `fetch` and `AbortSignal.timeout`).

```bash
npm install
npm run api        # http://localhost:8085
```

The API needs the indexer's GraphQL endpoint (`SUBQUERY_URL`, default `http://localhost:3000`) and a bucket. To get a local bucket, start MinIO from the compose file and keep the API on the host:

```bash
docker compose up -d minio minio-init
npm run api
```

Or run everything in Docker with `docker compose up -d`. Before the first run, edit the two host paths under `volumes:` in `docker-compose.yml`: they are absolute paths from a developer machine, one for the MinIO data and one for this folder, which `data-api` mounts at `/app`.

The compose file starts three services:

- `minio`: S3 API on port 9000, web console on http://localhost:9001. The login is the `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` pair in `docker-compose.yml`; `minio-init` and `data-api` repeat it, so change the three together.
- `minio-init`: creates the `lobster` bucket and allows anonymous downloads from it, so anyone who can reach port 9000 can read the results.
- `data-api`: `node:20-alpine`, runs `npm ci` and then `ts-node src/api.ts` on port 8085. It reaches the indexer at `http://host.docker.internal:3000`, the port where `Query/docker-compose.yml` publishes GraphQL. Nothing watches the files, so restart the container after a code change.

## Pipeline

`processPoolData(token0, token1, protocol)` in `src/process/querySwaps.ts` runs three steps:

1. `queryPoolData` pages through the indexer's swap entities for the pair, 100 at a time, over the last 365 days and in timestamp order.
2. `calculateAllMetrics` builds the series with the formulas in `src/formulas/amm.ts`.
3. `saveToDatabase` uploads the result to `<protocol>/<token0>_<token1>.latest.json.gz`, overwriting the object from the last run.

The pair is matched exactly as given: `token0` and `token1` must be in the order the indexer stored them, or no swap is found.

## API

| Route | What it does |
| --- | --- |
| `GET /health` | Checks the indexer (a `{ __typename }` query) and the bucket (`HeadBucket`). 200 with `status: "ok"`, or 503 with `status: "degraded"` and the failing check. |
| `GET /health/live` | Always 200, no dependency checks. |
| `GET /health/ready` | 200 when the indexer and the bucket both answer, 503 otherwise. |
| `POST /process` | Body `{ "token0", "token1", "protocol" }`. Answers 202 at once and processes the pair in the background. |
| `POST /processAll` | Processes every known pair in the background and answers 202. `source` is `query` (default, pairs from the indexer's new-pair entities) or `repertory` (pairs from `src/pool_repertory/`, chosen by `NETWORK`). `concurrency` defaults to 3. Both go in the JSON body or the query string. |
| `GET /data?token0=&token1=&protocol=` | The stored object for the pair. |
| `GET /data/last?token0=&token1=&protocol=` | `calculatedAt`, the addresses, and the last value of each series under `last`. |

Background jobs only report through the server log. The object is in the bucket once the log shows `Metrics saved to database successfully`. A `/process` job that worked still ends with `Background processing failed` and `ERR_HTTP_HEADERS_SENT`, because the handler tries to send a second response after the 202. Until a pair has been processed once, `/data` and `/data/last` answer 500 because the object does not exist.

```bash
T0=C...   # token0 contract ID
T1=C...   # token1 contract ID

curl -s -X POST http://localhost:8085/process \
  -H 'content-type: application/json' \
  -d "{\"token0\":\"$T0\",\"token1\":\"$T1\",\"protocol\":\"soroswap\"}"

curl -s "http://localhost:8085/data/last?token0=$T0&token1=$T1&protocol=soroswap"
```

DecisionTaker reads `/data/last` through its `PROCESS_URL` setting.

## Stored object

```json
{
  "calculatedAt": "2025-09-29T20:08:51.952Z",
  "token0Address": "C...",
  "token1Address": "C...",
  "pooladdress": "C...",
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

Values are `decimal.js` numbers serialized as strings. Series follow the swaps from oldest to newest but do not all have the same length: some start at the second or third swap, `efficiencyList` and `stabilityList` hold one value, and `turnoverFactor`, `profit` and `pnl` are single values. `pooladdress` is the `contract` field of the earliest swap in the window. `calculateAllMetrics` also computes average return, return standard deviation and a Sharpe ratio series, but only logs them.

The two `*.latest.json*` files at the root of this folder are a sample result for one pair, plain and gzipped.

## Configuration

Nothing loads a `.env` file. Set the variables in the shell or in the container; `.env example` lists them with comments.

| Variable | Default | Used for |
| --- | --- | --- |
| `PORT` | `8085` | API port |
| `SUBQUERY_URL` | `http://localhost:3000` | Indexer GraphQL endpoint |
| `S3_ENDPOINT` | `http://127.0.0.1:9000` | S3 endpoint (`http://minio:9000` inside compose) |
| `S3_REGION` | `us-east-1` | S3 region |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | none, both required | S3 credentials (the local MinIO login is in `docker-compose.yml`) |
| `S3_BUCKET` | `lobster` | Bucket for the results |
| `NETWORK` | `testnet` | `testnet` or `mainnet` pool lists for `POST /processAll` with `source=repertory` |
| `POOL_POLL_INTERVAL_MS` | 12 hours | Interval for `npm run pools:poll` |

`S3_OVERWRITE`, set in `docker-compose.yml` and `.env example`, is not read by the code: every run replaces the pair's object.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run api` | Starts the API with ts-node. |
| `npm run run:swap` | Runs `src/process/test.ts`: queries one hard-coded Soroswap pair and computes its metrics without uploading them. |
| `npm run pools:poll` | Logs how many pairs the indexer's new-pair entities hold for each protocol, with a short sample, at start and then every `POOL_POLL_INTERVAL_MS`. It stores nothing. |
| `npm run examples` | Runs the formula examples in `src/examples/basicUsage.ts`. |
| `npm test`, `npm run test:watch` | Jest. The tests in `src/__tests__/amm.test.ts` cover `AMMFormulas`. |
| `npm run lint` | ESLint on `src/`. |
| `npm run build`, `npm run clean` | Compile to `dist/`, or remove it. |

`npm run dev` runs `src/index.ts` with ts-node, and `npm start` runs its compiled copy from `dist/` after `npm run build`. That file is the library entry point and only re-exports the formulas, types, pipeline functions and constants, so neither command starts a server. The server is `npm run api`.

To poll every 6 hours instead of 12:

```bash
POOL_POLL_INTERVAL_MS=$((6*60*60*1000)) npm run pools:poll
```

## Code layout

- `src/api.ts`: routes
- `src/process/querySwaps.ts`: the pipeline
- `src/formulas/amm.ts`: metric formulas
- `src/types/queries.ts`: GraphQL queries sent to the indexer
- `src/utils/graphql.ts`: GraphQL client, 30 second timeout
- `src/utils/bd.ts`: S3 upload and download
- `src/pool_repertory/`: known pools per protocol, testnet and mainnet

## Troubleshooting

- `SubQuery connection failed` or `Error fetching swap events` in the log: check that `SUBQUERY_URL` answers GraphQL POST requests. `GET /health` shows the endpoint it tried.
- `No swap events found`: the pair had no swap in the last 365 days, or `token0` and `token1` are reversed.
- `/data` answers 500: the pair has not been processed yet, MinIO is down, or the `lobster` bucket is missing (`minio-init` creates it).

## Known issues

- Phoenix pairs fail. The metrics start from each swap's `reserveBefore0` and `reserveBefore1`, which `QUERY_SWAP_PHOENIX_ENTITIES` in `src/types/queries.ts` does not request, so the first swap throws `[DecimalError] Invalid argument: undefined`.
- Aquarius pairs fail with `[DecimalError] Invalid argument` because the indexer stores Aquarius swaps with empty reserves. On a pool the indexer only knows from its pool lists, the swaps have no tokens either, and the run ends with `No swap events found`. Both causes are in the indexer and listed under known issues in [Query/README.md](../Query/README.md#known-issues).

## License

MIT
