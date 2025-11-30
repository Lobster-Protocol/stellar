import type { Pool } from '../types/pool';

export const mockPools: Pool[] = [
  {
    id: 'lob-001',
    name: 'Blue Ocean Liquidity',
    protocol: 'soroswap',
    status: 'active',
    strategy: 'balanced',
    apy: 12.4,
    lpTokens: 12890,
    tvl: 540_000,
    createdAt: '2024-11-01T12:00:00.000Z',
    updatedAt: '2024-11-24T19:22:00.000Z',
    pendingRewards: 1420,
    tokens: [
      {
        symbol: 'USDC',
        name: 'USD Coin',
        address: 'GAUSDC6YQP2NGCZ7BUSDCYFHTUSDC6YQP2NGCZ7BUSDCE',
        amount: 220_000,
        usdValue: 220_000,
      },
      {
        symbol: 'XLM',
        name: 'Stellar Lumens',
        address: 'GAXLMQPK2S6XLMAPZK2S6XLMQPK2S6XLMAPZK2S6XLM',
        amount: 1_600_000,
        usdValue: 180_000,
      },
      {
        symbol: 'BTC',
        name: 'Wrapped Bitcoin',
        address: 'GABTC2X5BTCBTCGABTC2X5BTCBTCGABTC2X5BTCBTC',
        amount: 6.2,
        usdValue: 140_000,
      },
    ],
  },
  {
    id: 'lob-002',
    name: 'Delta Neutral Vault',
    protocol: 'phoenix',
    status: 'active',
    strategy: 'stable',
    apy: 8.9,
    lpTokens: 9820,
    tvl: 320_000,
    createdAt: '2024-10-15T09:00:00.000Z',
    updatedAt: '2024-11-22T11:10:00.000Z',
    pendingRewards: 620,
    tokens: [
      {
        symbol: 'USDT',
        name: 'Tether USD',
        address: 'GAUSDTTPQ9USDTTPQ9USDTTPQ9USDTTPQ9USDTTPQ9U',
        amount: 160_000,
        usdValue: 160_000,
      },
      {
        symbol: 'USDY',
        name: 'Yield USD',
        address: 'GAUSDYQ98USDYQ98USDYQ98USDYQ98USDYQ98USDYQ',
        amount: 160_000,
        usdValue: 160_000,
      },
    ],
  },
  {
    id: 'lob-003',
    name: 'Aquarius Yield Lab',
    protocol: 'aquarius',
    status: 'pending',
    strategy: 'growth',
    apy: 18.1,
    lpTokens: 14320,
    tvl: 610_000,
    createdAt: '2024-11-20T14:30:00.000Z',
    updatedAt: '2024-11-24T16:44:00.000Z',
    pendingRewards: 0,
    tokens: [
      {
        symbol: 'ETH',
        name: 'Wrapped ETH',
        address: 'GAETHJ3RETHJ3RETHJ3RETHJ3RETHJ3RETHJ3RETHJ',
        amount: 120,
        usdValue: 480_000,
      },
      {
        symbol: 'USDC',
        name: 'USD Coin',
        address: 'GAUSDC6YQP2NGCZ7BUSDCYFHTUSDC6YQP2NGCZ7BUSDCE',
        amount: 130_000,
        usdValue: 130_000,
      },
    ],
  },
];





