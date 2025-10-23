import { Decimal } from 'decimal.js';

// Core types for AMM calculations
export interface TokenPair {
  tokenA: string;
  tokenB: string;
  symbolA: string;
  symbolB: string;
}

export interface PoolReserves {
  reserveA: Decimal;
  reserveB: Decimal;
  totalSupply: Decimal;
}

export interface SwapParams {
  amountIn: Decimal;
  tokenIn: string;
  tokenOut: string;
  minAmountOut?: Decimal;
  slippageTolerance?: Decimal; // e.g., 0.01 for 1%
}

export interface SwapResult {
  amountOut: Decimal;
  priceImpact: Decimal;
  effectivePrice: Decimal;
  fee: Decimal;
}

export interface LiquidityParams {
  amountA: Decimal;
  amountB: Decimal;
  minLiquidity?: Decimal;
}

export interface LiquidityResult {
  liquidity: Decimal;
  share: Decimal;
  priceRatio: Decimal;
}

export interface PriceData {
  price: Decimal;
  timestamp: number;
  source: string;
}

export interface AMMConfig {
  feeRate: Decimal; // e.g., 0.003 for 0.3%
  protocolFeeRate: Decimal; // e.g., 0.0005 for 0.05%
  maxSlippage: Decimal; // e.g., 0.1 for 10%
  minLiquidity: Decimal;
}

export interface CurveParams {
  amplification: Decimal; // For stable swap curves
  gamma: Decimal; // For concentrated liquidity
  alpha: Decimal; // For dynamic curves
}

export interface Position {
  id: string;
  owner: string;
  tokenA: string;
  tokenB: string;
  liquidity: Decimal;
  tickLower: number;
  tickUpper: number;
  feeGrowthInside0LastX128: Decimal;
  feeGrowthInside1LastX128: Decimal;
}

export interface Tick {
  index: number;
  liquidityGross: Decimal;
  liquidityNet: Decimal;
  price: Decimal;
}

export interface FeeTier {
  fee: Decimal;
  tickSpacing: number;
}

export interface ConcentratedLiquidityParams {
  amount0: Decimal;
  amount1: Decimal;
  tickLower: number;
  tickUpper: number;
  feeTier: FeeTier;
}

export interface ConcentratedLiquidityResult {
  liquidity: Decimal;
  amount0: Decimal;
  amount1: Decimal;
  priceRange: {
    lower: Decimal;
    upper: Decimal;
  };
}