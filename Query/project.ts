import {
  StellarDatasourceKind,
  StellarHandlerKind,
  StellarProject,
} from "@subql/types-stellar";
import { Horizon } from "@stellar/stellar-sdk";

import * as dotenv from 'dotenv';
import path from 'path';

const mode = process.env.NODE_ENV || 'production';

// Load the appropriate .env file
const dotenvPath = path.resolve(__dirname, `.env${mode !== 'production' ? `.${mode}` : ''}`);
dotenv.config({ path: dotenvPath, quiet: true });

// SubQuery project configuration for indexing Stellar/Soroban events used by Lobster
// - Defines the network, endpoints, start block and the mapping handlers that will
//   be triggered for specific Soroban event topics (Soroswap, Phoenix, Aquarius)
const project: StellarProject = {
  specVersion: "1.0.0",
  name: "soroban-starter",
  version: "0.0.1",
  runner: {
    node: {
      name: "@subql/node-stellar",
      version: "*",
    },
    query: {
      name: "@subql/query",
      version: "*",
    },
  },
  // General project metadata
  description:
    "This project can be use as a starting point for developing your new Stellar SubQuery project (mainnet)",
  repository: "https://github.com/subquery/stellar-subql-starter",
  schema: {
    file: "./schema.graphql",
  },
  network: {
    /* Stellar and Soroban uses the network passphrase as the chainId
      'Test SDF Network ; September 2015' for testnet
      'Public Global Stellar Network ; September 2015' for mainnet
      'Test SDF Future Network ; October 2022' for Future Network */
    // Testnet by default; adjust to mainnet by changing the passphrase above
    chainId: "Test SDF Network ; September 2015",//process.env.CHAIN_ID!,
    /**
     * These endpoint(s) should be public non-pruned archive node
     * We recommend providing more than one endpoint for improved reliability, performance, and uptime
     * Public nodes may be rate limited, which can affect indexing speed
     * When developing your project we suggest getting a private API key
     * If you use a rate limited endpoint, adjust the --batch-size and --workers parameters
     * These settings can be found in your docker-compose.yaml, they will slow indexing but prevent your project being rate limited
     * You can find RPC endpoints for Stellar here https://soroban.stellar.org/docs/reference/rpc-list
     */
    // Horizon endpoint(s) used to read history. Prefer non-pruned archive nodes
    endpoint: ["https://horizon-testnet.stellar.org"],//['https://horizon.stellar.lobstr.co'],
    /* This is a specific Soroban endpoint
      It is only required when you are using a soroban/EventHandler */
    // Soroban RPC endpoint used for contract event decoding
    sorobanEndpoint: "https://soroban-testnet.stellar.org"//"https://mainnet.sorobanrpc.com",//"https://soroban-rpc.mainnet.stellar.gateway.fm",
  },
  dataSources: [
    {
      kind: StellarDatasourceKind.Runtime,
      // Logical start block for indexing (e.g. when contracts were deployed)
      startBlock: 794923,//584425, //657106 for demo
      mapping: {
        file: "./dist/index.js",
        handlers: [
          //////////////////////////////////////////// SOROSWAP ///////////////////////////////////////
          // Handlers for Soroswap events (commented examples retained for reference)
          {
            handler: "handleSwapPairEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["SoroswapPair", "swap"],
            },
          },
          {
            handler: "handleSyncEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["SoroswapPair", "sync"],
            },
          },
          {
            handler: "handleNewPairEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["SoroswapFactory", "new_pair"],
            },
          },
          {
            handler: "handleDepositEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["SoroswapRouter", "add"],
            },
          },
          {
            handler: "handleRemoveEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["SoroswapRouter", "remove"],
            },
          },
          // ////////////////////////////////////////////////  PHOENIX ///////////////////////////////////////////////
          // Handlers that capture Phoenix AMM lifecycle: create pool, provide/remove liquidity, swaps
          {
            handler: "handleNewPairPhoenixTokenAEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["initialize", "XYK LP token_a"],
            },
          },
          {
            handler: "handleNewPairPhoenixTokenBEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["initialize", "XYK LP token_b"],
            },
          },
          {
            handler: "handleNewPairPhoenixEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["create", "liquidity_pool"],
            },
          },
          {
            handler: "handleDepositSenderPhoenixEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["provide_liquidity", "sender"],
            },
          },
          {
            handler: "handleDepositTokenAPhoenixEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["provide_liquidity", "token_a"],
            },
          },
          {
            handler: "handleDepositTokenAAmountPhoenixEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["provide_liquidity", "token_a-amount"],
            },
          },
          {
            handler: "handleDepositTokenBPhoenixEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["provide_liquidity", "token_b"],
            },
          },
          {
            handler: "handleDepositTokenBAmountPhoenixEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["provide_liquidity", "token_b-amount"],
            },
          },

          {
            handler: "handleSwapSenderPhoenixEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["swap", "sender"],
            },
          },
          {
            handler: "handleSwapSellTokenPhoenixEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["swap", "sell_token"],
            },
          },
          {
            handler: "handleSwapOfferAmountPhoenixEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["swap", "offer_amount"],
            },
          },
          {
            handler: "handleSwapActualReceivedPhoenixEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["swap", "actual received amount"],
            },
          },
          {
            handler: "handleSwapReturnAmountPhoenixEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["swap", "return_amount"],
            },
          },
          {
            handler: "handleSwapSpreadAmountPhoenixEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["swap", "spread_amount"],
            },
          },
          {
            handler: "handleSwapReferralFeePhoenixEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["swap", "referral_fee_amount"],
            },
          },
          {
            handler: "handleSwapBuyTokenPhoenixEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["swap", "buy_token"],
            },
          },
          {
            handler: "handleWithdrawSenderPhoenixEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["withdraw_liquidity", "sender"],
            },
          },
          {
            handler: "handleWithdrawSharesAmountPhoenixEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["withdraw_liquidity", "shares_amount"],
            },
          },
          {
            handler: "handleWithdrawReturnAmountAPhoenixEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["withdraw_liquidity", "return_amount_a"],
            },
          },
          {
            handler: "handleWithdrawReturnAmountBPhoenixEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["withdraw_liquidity", "return_amount_b"],
            },
          },

          // ///////////////////////////////////////  AQUARIUS ////////////////////////////////////
          // Handlers for Aquarius events (explicit contractId filter used)

          {
            handler: "handleNewPairAquariusEvent",
            kind: StellarHandlerKind.Event,
            filter: {
               contractId: "CDQWFZRG5VFGT5FI2UBVL333PSSUTBY4GJMMBAJXQAAAX6ZICBBCV5X2",
              topics: ["add_pool"],
            },
          },
          {
            handler: "handleDepositAquariusEvent", // deposit liquidity
            kind: StellarHandlerKind.Event,
            filter: {
               contractId: "CBXIO7XBTVPZAO3VT4FDAY7TIWWI77F7JUK3U3WH6XX6QA6C7KDFBBPZ",
              topics: ["deposit"],
            },
          },
          {
            handler: "handleWithdrawAquariusEvent", // withdraw liquidity
            kind: StellarHandlerKind.Event,
            filter: {
               contractId: "CBXIO7XBTVPZAO3VT4FDAY7TIWWI77F7JUK3U3WH6XX6QA6C7KDFBBPZ",
              topics: ["withdraw"],
            },
          },
            {
              handler: "handleSwapAquariusEvent", // swap liquidity
              kind: StellarHandlerKind.Event,
              filter: {
                contractId: "CBXIO7XBTVPZAO3VT4FDAY7TIWWI77F7JUK3U3WH6XX6QA6C7KDFBBPZ",
                topics: ["swap"],
              },
            },
            {
              handler: "handleTradeAquariusEvent", // trade liquidity
              kind: StellarHandlerKind.Event,
              filter: {
                topics: ["trade"],
              },
            },
            {
              handler: "handleUpdateReservesAquariusEvent", // update reserves
              kind: StellarHandlerKind.Event,
              filter: {
                topics: ["update_reserves"],
              },
            },

        ],

      },
    },
  ],
};

// Must set default to the project instance
export default project;
