import { mockPools } from '../data/mockPools';
import type { AddLiquidityPayload, CreatePoolPayload, Pool } from '../types/pool';

const API_BASE = import.meta.env.VITE_LOBSTER_API ?? 'http://localhost:8085';
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const clone = <T,>(value: T): T =>
  typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));

let memoryPools: Pool[] = clone(mockPools);

const recalcPool = (pool: Pool) => {
  pool.tvl = pool.tokens.reduce((sum, token) => sum + token.usdValue, 0);
  pool.updatedAt = new Date().toISOString();
};

export async function fetchPools(): Promise<Pool[]> {
  try {
    const response = await fetch(`${API_BASE}/pools`);
    if (!response.ok) throw new Error('Non 2xx response');
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('Unexpected payload');
    return data;
  } catch (err) {
    console.warn('[lobsterApi] Falling back to mock pools:', err);
    await delay(300);
    return clone(memoryPools);
  }
}

export async function createPool(payload: CreatePoolPayload): Promise<Pool> {
  try {
    const response = await fetch(`${API_BASE}/pools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Non 2xx response');
    return await response.json();
  } catch (err) {
    console.warn('[lobsterApi] Using local create pool fallback:', err);
    await delay(400);

    const newPool: Pool = {
      id: `lob-${Math.floor(Math.random() * 10_000)}`,
      name: payload.name,
      protocol: payload.protocol,
      strategy: payload.strategy,
      status: 'pending',
      apy: payload.strategy === 'growth' ? 16 : payload.strategy === 'balanced' ? 11 : 8,
      lpTokens: Math.round((payload.depositUsd ?? 25_000) / 25),
      tvl: payload.depositUsd ?? 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pendingRewards: 0,
      tokens: payload.tokens.map((token) => ({
        symbol: token.symbol || 'TOKEN',
        name: token.symbol || 'Custom Token',
        address: token.address,
        amount: token.amount,
        usdValue: token.amount,
      })),
    };

    recalcPool(newPool);
    memoryPools = [newPool, ...memoryPools];
    return clone(newPool);
  }
}

export async function addLiquidity(payload: AddLiquidityPayload): Promise<Pool> {
  try {
    const response = await fetch(`${API_BASE}/pools/${payload.poolId}/liquidity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload.entries),
    });
    if (!response.ok) throw new Error('Non 2xx response');
    return await response.json();
  } catch (err) {
    console.warn('[lobsterApi] Using local add-liquidity fallback:', err);
    await delay(300);
    const pool = memoryPools.find((p) => p.id === payload.poolId);
    if (!pool) throw new Error('Pool not found');

    payload.entries.forEach((entry) => {
      if (!entry.amount) return;
      const token =
        pool.tokens.find((t) => t.symbol.toLowerCase() === entry.symbol.toLowerCase()) ??
        pool.tokens.find((t) => t.address === entry.symbol);

      if (token) {
        token.amount += entry.amount;
        token.usdValue += entry.amount;
      } else {
        pool.tokens.push({
          symbol: entry.symbol.toUpperCase(),
          name: `${entry.symbol.toUpperCase()} Token`,
          address: entry.symbol,
          amount: entry.amount,
          usdValue: entry.amount,
        });
      }
    });

    pool.lpTokens += payload.entries.reduce((sum, entry) => sum + entry.amount * 1.5, 0);
    recalcPool(pool);
    return clone(pool);
  }
}

export async function withdrawLiquidity(poolId: string): Promise<Pool> {
  try {
    const response = await fetch(`${API_BASE}/pools/${poolId}/withdraw`, { method: 'POST' });
    if (!response.ok) throw new Error('Non 2xx response');
    return await response.json();
  } catch (err) {
    console.warn('[lobsterApi] Using local withdraw fallback:', err);
    await delay(300);
    const pool = memoryPools.find((p) => p.id === poolId);
    if (!pool) throw new Error('Pool not found');

    pool.status = 'withdrawing';
    pool.pendingRewards = 0;
    pool.lpTokens *= 0.2;
    pool.tokens = pool.tokens.map((token) => ({
      ...token,
      amount: token.amount * 0.25,
      usdValue: token.usdValue * 0.25,
    }));
    recalcPool(pool);
    return clone(pool);
  }
}





