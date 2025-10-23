import { Decimal } from 'decimal.js';
import { 
  PoolReserves, 
  SwapParams, 
  LiquidityParams, 
  AMMConfig,
  CurveParams 
} from '../types';
import { ZERO, ONE, HUNDRED, MAX_FEE, MIN_FEE } from '../constants';

/**
 * Validation utilities for AMM calculations
 */
export class ValidationUtils {
  /**
   * Validate pool reserves
   */
  public static validatePoolReserves(reserves: PoolReserves): void {
    if (!reserves.reserveA || !reserves.reserveB || !reserves.totalSupply) {
      throw new Error('Pool reserves must be defined');
    }

    if (reserves.reserveA.lt(ZERO) || reserves.reserveB.lt(ZERO)) {
      throw new Error('Pool reserves must be non-negative');
    }

    if (reserves.totalSupply.lt(ZERO)) {
      throw new Error('Total supply must be non-negative');
    }
  }

  /**
   * Validate swap parameters
   */
  public static validateSwapParams(params: SwapParams): void {
    if (!params.amountIn || !params.tokenIn || !params.tokenOut) {
      throw new Error('Swap parameters must be defined');
    }

    if (params.amountIn.lte(ZERO)) {
      throw new Error('Amount in must be positive');
    }

    if (params.tokenIn === params.tokenOut) {
      throw new Error('Token in and token out must be different');
    }

    if (params.minAmountOut && params.minAmountOut.lt(ZERO)) {
      throw new Error('Minimum amount out must be non-negative');
    }

    if (params.slippageTolerance && (params.slippageTolerance.lt(ZERO) || params.slippageTolerance.gt(HUNDRED))) {
      throw new Error('Slippage tolerance must be between 0 and 100');
    }
  }

  /**
   * Validate liquidity parameters
   */
  public static validateLiquidityParams(params: LiquidityParams): void {
    if (!params.amountA || !params.amountB) {
      throw new Error('Liquidity parameters must be defined');
    }

    if (params.amountA.lte(ZERO) || params.amountB.lte(ZERO)) {
      throw new Error('Liquidity amounts must be positive');
    }

    if (params.minLiquidity && params.minLiquidity.lt(ZERO)) {
      throw new Error('Minimum liquidity must be non-negative');
    }
  }

  /**
   * Validate AMM configuration
   */
  public static validateAMMConfig(config: AMMConfig): void {
    if (!config.feeRate || !config.protocolFeeRate || !config.maxSlippage) {
      throw new Error('AMM configuration must be defined');
    }

    if (config.feeRate.lt(MIN_FEE) || config.feeRate.gt(MAX_FEE)) {
      throw new Error(`Fee rate must be between ${MIN_FEE} and ${MAX_FEE}`);
    }

    if (config.protocolFeeRate.lt(ZERO) || config.protocolFeeRate.gt(MAX_FEE)) {
      throw new Error(`Protocol fee rate must be between 0 and ${MAX_FEE}`);
    }

    if (config.maxSlippage.lt(ZERO) || config.maxSlippage.gt(HUNDRED)) {
      throw new Error('Max slippage must be between 0 and 100');
    }

    if (config.minLiquidity && config.minLiquidity.lt(ZERO)) {
      throw new Error('Minimum liquidity must be non-negative');
    }
  }

  /**
   * Validate curve parameters
   */
  public static validateCurveParams(params: CurveParams): void {
    if (!params.amplification || !params.gamma || !params.alpha) {
      throw new Error('Curve parameters must be defined');
    }

    if (params.amplification.lt(ZERO)) {
      throw new Error('Amplification must be non-negative');
    }

    if (params.gamma.lt(ZERO)) {
      throw new Error('Gamma must be non-negative');
    }

    if (params.alpha.lt(ZERO) || params.alpha.gt(ONE)) {
      throw new Error('Alpha must be between 0 and 1');
    }
  }

  /**
   * Validate decimal precision
   */
  public static validatePrecision(value: Decimal, maxDecimals: number = 18): void {
    const decimalPlaces = value.decimalPlaces();
    if (decimalPlaces > maxDecimals) {
      throw new Error(`Value has too many decimal places. Maximum allowed: ${maxDecimals}`);
    }
  }

  /**
   * Validate price range
   */
  public static validatePriceRange(price: Decimal, minPrice?: Decimal, maxPrice?: Decimal): void {
    if (price.lt(ZERO)) {
      throw new Error('Price must be non-negative');
    }

    if (minPrice && price.lt(minPrice)) {
      throw new Error(`Price ${price} is below minimum ${minPrice}`);
    }

    if (maxPrice && price.gt(maxPrice)) {
      throw new Error(`Price ${price} is above maximum ${maxPrice}`);
    }
  }

  /**
   * Validate tick range
   */
  public static validateTickRange(tickLower: number, tickUpper: number): void {
    if (tickLower >= tickUpper) {
      throw new Error('tickLower must be less than tickUpper');
    }

    if (tickLower < -887272 || tickUpper > 887272) {
      throw new Error('Tick values must be within valid range');
    }
  }

  /**
   * Validate slippage
   */
  public static validateSlippage(slippage: Decimal): void {
    if (slippage.lt(ZERO) || slippage.gt(HUNDRED)) {
      throw new Error('Slippage must be between 0 and 100');
    }
  }

  /**
   * Validate fee rate
   */
  public static validateFeeRate(feeRate: Decimal): void {
    if (feeRate.lt(MIN_FEE) || feeRate.gt(MAX_FEE)) {
      throw new Error(`Fee rate must be between ${MIN_FEE} and ${MAX_FEE}`);
    }
  }

  /**
   * Validate liquidity amount
   */
  public static validateLiquidityAmount(liquidity: Decimal): void {
    if (liquidity.lt(ZERO)) {
      throw new Error('Liquidity must be non-negative');
    }
  }

  /**
   * Validate token addresses
   */
  public static validateTokenAddress(address: string): void {
    if (!address || typeof address !== 'string') {
      throw new Error('Token address must be a non-empty string');
    }

    if (address.length < 20) {
      throw new Error('Token address appears to be invalid');
    }
  }

  /**
   * Validate array of values
   */
  public static validateArray<T>(array: T[], minLength: number = 1, maxLength?: number): void {
    if (!Array.isArray(array)) {
      throw new Error('Value must be an array');
    }

    if (array.length < minLength) {
      throw new Error(`Array must have at least ${minLength} elements`);
    }

    if (maxLength && array.length > maxLength) {
      throw new Error(`Array must have at most ${maxLength} elements`);
    }
  }

  /**
   * Validate numeric range
   */
  public static validateRange(value: Decimal, min: Decimal, max: Decimal): void {
    if (value.lt(min) || value.gt(max)) {
      throw new Error(`Value ${value} must be between ${min} and ${max}`);
    }
  }

  /**
   * Validate positive number
   */
  public static validatePositive(value: Decimal, name: string = 'Value'): void {
    if (value.lte(ZERO)) {
      throw new Error(`${name} must be positive`);
    }
  }

  /**
   * Validate non-negative number
   */
  public static validateNonNegative(value: Decimal, name: string = 'Value'): void {
    if (value.lt(ZERO)) {
      throw new Error(`${name} must be non-negative`);
    }
  }

  /**
   * Validate percentage
   */
  public static validatePercentage(value: Decimal, name: string = 'Percentage'): void {
    if (value.lt(ZERO) || value.gt(HUNDRED)) {
      throw new Error(`${name} must be between 0 and 100`);
    }
  }

  /**
   * Validate timestamp
   */
  public static validateTimestamp(timestamp: number): void {
    const now = Date.now();
    const minTimestamp = now - 365 * 24 * 60 * 60 * 1000; // 1 year ago
    const maxTimestamp = now + 24 * 60 * 60 * 1000; // 1 day in future

    if (timestamp < minTimestamp || timestamp > maxTimestamp) {
      throw new Error('Timestamp appears to be invalid');
    }
  }
}