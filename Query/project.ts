import {
  StellarDatasourceKind,
  StellarHandlerKind,
  StellarProject,
} from "@subql/types-stellar";
import { Horizon } from "@stellar/stellar-sdk";

import * as dotenv from 'dotenv';
import path from 'path';

const mode = process.env.NODE_ENV || 'production';

const dotenvPath = path.resolve(__dirname, `.env${mode !== 'production' ? `.${mode}` : ''}`);
dotenv.config({ path: dotenvPath, quiet: true });

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
    chainId: process.env.CHAIN_ID || "Test SDF Network ; September 2015",
    /**
     * These endpoint(s) should be public non-pruned archive node
     * We recommend providing more than one endpoint for improved reliability, performance, and uptime
     * Public nodes may be rate limited, which can affect indexing speed
     * When developing your project we suggest getting a private API key
     * If you use a rate limited endpoint, adjust the --batch-size and --workers parameters
     * These settings can be found in your docker-compose.yaml, they will slow indexing but prevent your project being rate limited
     * You can find RPC endpoints for Stellar here https://soroban.stellar.org/docs/reference/rpc-list
     */
    // HORIZON_ENDPOINT can list several endpoints separated by commas
    endpoint: process.env.HORIZON_ENDPOINT 
      ? process.env.HORIZON_ENDPOINT.split(',').map(e => e.trim())
      : ["https://horizon-testnet.stellar.org"],
    /* This is a specific Soroban endpoint
      It is only required when you are using a soroban/EventHandler */
    sorobanEndpoint: process.env.SOROBAN_ENDPOINT || "https://soroban-testnet.stellar.org",
  },
  dataSources: [
    {
      kind: StellarDatasourceKind.Runtime,
      // Logical start block for indexing (e.g. when contracts were deployed)
      startBlock: process.env.START_BLOCK ? parseInt(process.env.START_BLOCK, 10) : 1675410,
      mapping: {
        file: "./dist/index.js",
        handlers: [
          // Soroswap
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
          // Phoenix
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

          // Aquarius
          {
            handler: "handleNewPairAquariusEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              contractId: process.env.AQUARIUS_CONTRACT_ID || "CBCFTQSPDBAIZ6R6PJQKSQWKNKWH2QIV3I4J72SHWBIK3ADRRAM5A6GD",
              topics: ["add_pool"],
            },
          },
          {
            handler: "handleDepositAquariusEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              contractId: process.env.AQUARIUS_CONTRACT_ID || "CBCFTQSPDBAIZ6R6PJQKSQWKNKWH2QIV3I4J72SHWBIK3ADRRAM5A6GD",
              topics: ["deposit_liquidity"],
            },
          },
          {
            handler: "handleWithdrawAquariusEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              contractId: process.env.AQUARIUS_CONTRACT_ID || "CBCFTQSPDBAIZ6R6PJQKSQWKNKWH2QIV3I4J72SHWBIK3ADRRAM5A6GD",
              topics: ["withdraw"],
            },
          },
          {
            handler: "handleTradeAquariusEvent",
            kind: StellarHandlerKind.Event,
            filter: {
              topics: ["trade"],
            },
          },
          {
            handler: "handleUpdateReservesAquariusEvent",
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
