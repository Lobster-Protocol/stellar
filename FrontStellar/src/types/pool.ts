export type Protocol = 'soroswap' | 'phoenix' | 'aquarius';

export type PoolStatus = 'active' | 'pending' | 'withdrawing';

export type Strategy = 'balanced' | 'stable' | 'growth';

export interface PoolToken {
  symbol: string;
  name: string;
  address: string;
  amount: number; // Locked in DEX pool (from get_amounts_from_*)
  usdValue: number;
  availableAmount?: number; // Available in contract, not in DEX (from get_amounts_tokens)
  decimals?: number;
}

export interface Pool {
  id: string;
  name: string;
  protocol: Protocol | null; // null when protocol is 5 (scanning for best pool)
  status: PoolStatus;
  strategy: Strategy;
  lpTokens: number;
  apy: number;
  tvl: number;
  createdAt: string;
  updatedAt: string;
  pendingRewards: number;
  tokens: PoolToken[];
  actualPool?: string | null; // Address of the actual DEX pool
}

export interface CreatePoolPayload {
  name: string;
  protocol: Protocol;
  strategy: Strategy;
  tokens: Array<{
    symbol: string;
    address: string;
    amount: number;
  }>;
  depositUsd?: number;
}

export interface AddLiquidityPayload {
  poolId: string;
  entries: Array<{
    symbol: string;
    amount: number;
  }>;
}





