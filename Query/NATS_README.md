# NATS events

The indexer publishes each new pool, deposit, withdrawal and swap on NATS once the record is complete, through `express-nats-service` (the Express app in `bridge-API/`), which turns HTTP posts into NATS messages.

```
parser in src/ --postToAPI--> POST http://express-nats-service:8080/publish --publish--> nats-server
```

1. A parser in `src/Soroswap`, `src/Phoenix` or `src/Aquarius` saves an entity, then calls `postToAPI(subject, payload)` from `src/mappings/mappingHandlers.ts`.
2. `postToAPI` sends `{ "subject": ..., "data": payload }` to `http://express-nats-service:8080/publish`. The host name is fixed in the code, so the node has to run on the same Compose network as the bridge.
3. The bridge publishes `data` as JSON on `subject` with a plain NATS publish.

If the bridge cannot be reached, the parser logs the error and indexing goes on. An error answer from the bridge (400 or 500) is not logged at all, since `postToAPI` does not check the status code. Either way the entity is in Postgres, but that message is lost.

## Subjects

`lobster.<dex>.<event>`, where `<dex>` is `soroswap`, `phoenix` or `aquarius` and `<event>` is `newpair`, `deposit`, `withdraw` or `swap`. Subscribe to `lobster.>` to get all of them.

A swap goes out once its reserves are known. A Phoenix swap gets them from `soroban-testnet.stellar.org`, so it is only published when that RPC has the transaction. An Aquarius swap would go out from the `update_reserves` handler, which never finds its trade, so nothing arrives on `lobster.aquarius.swap`. Both are listed under known issues in [README.md](README.md#known-issues).

To publish a new kind of record, call `postToAPI` with a new `lobster.<dex>.<event>` subject after saving. Subscribers on `lobster.>` receive it without any change.

## Payload

```json
{
  "block_number": 1675500,
  "block_timestamp": "2025-09-29T20:08:51Z",
  "chain_id": "2051",
  "content": { "id": "...", "contract": "C...", "block": "1675500", "timestamp": "1759176531" },
  "emitter": "C...",
  "tx": "..."
}
```

| Field | Content |
| --- | --- |
| `block_number` | Ledger sequence |
| `block_timestamp` | Ledger close time, as the RPC returns it |
| `chain_id` | `CHAIN_ID_NUM`, left out when the handlers do not see it, which is the case with the node image pinned in `docker-compose.yml` (see the configuration notes in README.md) |
| `content` | The saved entity, with the field names of `schema.graphql` (snake_case, where the GraphQL API uses camelCase) |
| `emitter` | Contract that emitted the event |
| `tx` | Transaction hash |

## Delivery

The bridge does a plain publish, not a JetStream one: each message goes at most once to the subscribers connected at that moment. The server runs with JetStream enabled (storage in the `nats-data` volume), but no stream covers `lobster.>`, so nothing is kept. Add a stream on `lobster.>` if a consumer needs to replay or catch up.

## Subscribing

From the host, NATS listens on `nats://localhost:4222`. With the `nats` package (2.x, the version this folder uses):

```js
const { connect, StringCodec } = require("nats");

(async () => {
  const nc = await connect({ servers: "nats://localhost:4222" });
  const sc = StringCodec();
  for await (const msg of nc.subscribe("lobster.>")) {
    console.log(msg.subject, JSON.parse(sc.decode(msg.data)));
  }
})();
```

`src/test/test-nats.js` listens on every subject (`>`) and prints what arrives. Run it with `node src/test/test-nats.js` after `npm install`.

To test the path without the indexer, post to the bridge by hand:

```bash
curl -s -X POST http://localhost:8080/publish \
  -H 'content-type: application/json' \
  -d '{"subject":"lobster.test.ping","data":{"hello":"world"}}'
```

## Bridge

| Route | What it does |
| --- | --- |
| `GET /ping` | Returns `status`, `timestamp` and `nats`. `nats` reads `connected` once the startup connection succeeded and does not follow later drops. |
| `POST /publish` | Body `{ subject, data }`. Publishes `data` and answers `{ status: "ok", subject }`; 400 without `data`, 500 when NATS is not connected. |

Settings (`docker-compose.yml` sets `NATS_URL` and `NATS_SUBJECT`):

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port |
| `NATS_URL` | `nats://nats-server:4222` | NATS server |
| `NATS_SUBJECT` | `events` | Subject used when a post has no `subject`. The indexer always sends one. |

## NatsService

`src/services/natsService.ts` is a separate JetStream helper. The Aquarius parser imports it, but nothing calls it, so it takes no part in the path above. It logs through SubQuery's global `logger`, so it only runs inside the indexer.

- `start(url)`, default `nats://nats-server:4222`, connects and creates the `LOBSTER_EVENTS` stream on `lobster.events.*`: file storage, messages kept 24 hours, at most 1,000,000 messages and 1 GiB.
- `publishEvent(type, data, metadata)` publishes `{ event_type, event_data, metadata, published_at }` on `lobster.events.<type>`. `publishAquariusSwap`, `publishPhoenixSwap` and `publishPoolEvent` use the types `aquarius_swap`, `phoenix_swap` and `pool_<type>`.
- `subscribeToEvents(subject, callback)` reads through a durable consumer on `LOBSTER_EVENTS`, acks each message after the callback, and naks it when parsing or the callback fails.

## Monitoring and troubleshooting

The monitoring port answers on http://localhost:8222: `/healthz` (also the Compose health check), `/varz` (server stats, including message counts), `/connz` (connections, the bridge among them), `/subsz` (subscriptions) and `/jsz` (JetStream).

- `docker compose logs nats-server` and `docker compose logs express-nats-service`. The bridge logs every publish.
- `curl http://localhost:8080/ping` shows whether the bridge is up.
- The bridge exits when it cannot reach NATS at startup, and the service has no restart policy. Start it again with `docker compose up -d express-nats-service`.
- No messages: subscribe to `lobster.>` and keep the subscriber running before the indexer reaches the ledgers you expect, since nothing is replayed.
