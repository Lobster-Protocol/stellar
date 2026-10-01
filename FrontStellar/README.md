# FrontStellar

React app for Lobster vaults. Connect a wallet through Stellar Wallets Kit (every wallet module is enabled) and the app lists the vaults the factory holds for that address, with what sits in the DEX and what is still in the vault.

From there you can create a vault for a token pair (`create_pool` on the factory) and deposit into it. Liquidity comes back out of the DEX with the vault's withdraw call for that DEX, or out of the vault to your wallet with `withdraw_contract`.

## Run it

Node 20.19+ or 22.12+ (Vite 7).

```bash
cp .env.example .env
npm install
npm run dev        # http://localhost:5173
```

## Configuration

| Variable | Default | Use |
| --- | --- | --- |
| `VITE_NETWORK` | `testnet` | `mainnet` or `testnet`. Picks the defaults below and the token list, `public/tokens_mainnet.json` or `public/tokens_testnet.json`. |
| `VITE_FACTORY_RPC` | `https://soroban-testnet.stellar.org`, or `https://soroban-rpc.creit.tech` on mainnet | RPC for every contract call, not only the factory |
| `VITE_FACTORY_CONTRACT` | the ID for that network in `bindings/factory.ts` | factory contract |
| `VITE_FACTORY_NETWORK` | the passphrase of that network | network passphrase |
| `VITE_DECISION_TAKER_URL` | `http://localhost:3334` | base URL of the DecisionTaker API |

Vite bakes these into the bundle, so rebuild after a change. The dev server restarts by itself when `.env` changes.

`src/components/TokenSelector.tsx` also reads `VITE_SECRET`, only as the source account of a read-only `symbol()` simulation. Leave it unset: a random keypair is used instead, and anything in a `VITE_` variable ends up in the built JavaScript.

After a deposit into a vault that has no DEX position yet, the app calls DecisionTaker's `GET /api/run/pool/` route with the vault address, on the server set by `VITE_DECISION_TAKER_URL`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc -b && vite build`, output in `dist/` |
| `npm run preview` | serves `dist/` on http://localhost:4173 |
| `npm run lint` | `eslint .` |

There's no test suite. Lint and the type check in `npm run build` are the checks.

`bindings/` holds the TypeScript clients for the vault, factory and token contracts, generated with `stellar contract bindings typescript`.
