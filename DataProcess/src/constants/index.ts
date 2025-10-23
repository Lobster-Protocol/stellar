import { Decimal } from 'decimal.js';

// Mathematical constants
export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);
export const TWO = new Decimal(2);
export const HUNDRED = new Decimal(100);
export const THOUSAND = new Decimal(1000);

// AMM specific constants
export const FEE_DENOMINATOR = new Decimal(10000); // 0.01% precision
export const MAX_FEE = new Decimal(1000); // 10% max fee
export const MIN_FEE = new Decimal(1); // 0.01% min fee

// Price constants
export const PRICE_PRECISION = new Decimal(18);
export const TICK_PRECISION = new Decimal(1e18);

// Liquidity constants
export const MIN_LIQUIDITY = new Decimal(1000); // Minimum liquidity to prevent division by zero
export const MAX_LIQUIDITY = new Decimal('115792089237316195423570985008687907853269984665640564039457584007913129639935');

// Curve constants for stable swaps
export const AMP_PRECISION = new Decimal(100);
export const MAX_AMP = new Decimal(1000000);
export const MIN_AMP = new Decimal(1);

// Concentrated liquidity constants
export const MIN_TICK = -887272;
export const MAX_TICK = 887272;
export const TICK_SPACING = {
  '0.01%': 1,
  '0.05%': 10,
  '0.3%': 60,
  '1%': 200,
};

// Protocol specific constants
export const PROTOCOL_FEE_DENOMINATOR = new Decimal(10000);
export const MAX_PROTOCOL_FEE = new Decimal(1000); // 10%

// Slippage and price impact
export const MAX_SLIPPAGE = new Decimal(50); // 50%
export const DEFAULT_SLIPPAGE = new Decimal(0.5); // 0.5%

// Gas and transaction limits
export const MAX_GAS_LIMIT = new Decimal(10000000);
export const DEFAULT_GAS_LIMIT = new Decimal(1000000);

// Time constants
export const BLOCK_TIME_MS = 5000; // 5 seconds average block time
export const HOUR_MS = 3600000;
export const DAY_MS = 86400000;
export const WEEK_MS = 604800000;
export const YEAR_MS = 31536000000;