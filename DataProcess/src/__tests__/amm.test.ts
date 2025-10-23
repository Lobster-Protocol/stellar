import { Decimal } from 'decimal.js';
import { AMMFormulas, AMMConfig, PoolReserves, SwapParams, LiquidityParams } from '../index';

describe('AMMFormulas', () => {
  let ammFormulas: AMMFormulas;
  let config: AMMConfig;
  let reserves: PoolReserves;

  beforeEach(() => {
    config = {
      feeRate: new Decimal(30), // 0.3%
      protocolFeeRate: new Decimal(5), // 0.05%
      maxSlippage: new Decimal(5), // 5%
      minLiquidity: new Decimal(1000),
    };
    
    ammFormulas = new AMMFormulas(config);
    
    reserves = {
      reserveA: new Decimal(1000000), // 1M USDC
      reserveB: new Decimal(1000000), // 1M USDT
      totalSupply: new Decimal(1000000), // 1M LP tokens
    };
  });

  describe('calculateSwapOutput', () => {
    it('should calculate correct output for small swap', () => {
      const swapParams: SwapParams = {
        amountIn: new Decimal(1000), // 1000 USDC
        tokenIn: 'A',
        tokenOut: 'B',
      };

      const result = ammFormulas.calculateSwapOutput(reserves, swapParams);
      
      expect(result.amountOut).toBeDefined();
      expect(result.amountOut.gt(0)).toBe(true);
      expect(result.priceImpact).toBeDefined();
      expect(result.effectivePrice).toBeDefined();
      expect(result.fee).toBeDefined();
    });

    it('should throw error for zero amount', () => {
      const swapParams: SwapParams = {
        amountIn: new Decimal(0),
        tokenIn: 'A',
        tokenOut: 'B',
      };

      expect(() => {
        ammFormulas.calculateSwapOutput(reserves, swapParams);
      }).toThrow('Amount in must be positive');
    });

    it('should throw error for negative amount', () => {
      const swapParams: SwapParams = {
        amountIn: new Decimal(-1000),
        tokenIn: 'A',
        tokenOut: 'B',
      };

      expect(() => {
        ammFormulas.calculateSwapOutput(reserves, swapParams);
      }).toThrow('Amount in must be positive');
    });

    it('should throw error for insufficient reserves', () => {
      const emptyReserves: PoolReserves = {
        reserveA: new Decimal(0),
        reserveB: new Decimal(0),
        totalSupply: new Decimal(0),
      };

      const swapParams: SwapParams = {
        amountIn: new Decimal(1000),
        tokenIn: 'A',
        tokenOut: 'B',
      };

      expect(() => {
        ammFormulas.calculateSwapOutput(emptyReserves, swapParams);
      }).toThrow('Insufficient reserves');
    });
  });

  describe('calculateSwapInput', () => {
    it('should calculate correct input for desired output', () => {
      const amountOut = new Decimal(1000);
      const result = ammFormulas.calculateSwapInput(reserves, amountOut, 'A', 'B');
      
      expect(result).toBeDefined();
      expect(result.gt(0)).toBe(true);
    });

    it('should throw error for zero output', () => {
      expect(() => {
        ammFormulas.calculateSwapInput(reserves, new Decimal(0), 'A', 'B');
      }).toThrow('Amount out must be positive');
    });

    it('should throw error for insufficient liquidity', () => {
      const amountOut = new Decimal(2000000); // More than available
      
      expect(() => {
        ammFormulas.calculateSwapInput(reserves, amountOut, 'A', 'B');
      }).toThrow('Insufficient liquidity');
    });
  });

  describe('calculateLiquidity', () => {
    it('should calculate correct liquidity for initial provision', () => {
      const emptyReserves: PoolReserves = {
        reserveA: new Decimal(0),
        reserveB: new Decimal(0),
        totalSupply: new Decimal(0),
      };

      const liquidityParams: LiquidityParams = {
        amountA: new Decimal(10000),
        amountB: new Decimal(10000),
      };

      const result = ammFormulas.calculateLiquidity(emptyReserves, liquidityParams);
      
      expect(result.liquidity).toBeDefined();
      expect(result.liquidity.gt(0)).toBe(true);
      expect(result.share).toBeDefined();
      expect(result.priceRatio).toBeDefined();
    });

    it('should calculate correct liquidity for additional provision', () => {
      const liquidityParams: LiquidityParams = {
        amountA: new Decimal(10000),
        amountB: new Decimal(10000),
      };

      const result = ammFormulas.calculateLiquidity(reserves, liquidityParams);
      
      expect(result.liquidity).toBeDefined();
      expect(result.liquidity.gt(0)).toBe(true);
      expect(result.share).toBeDefined();
      expect(result.share.lt(1)).toBe(true); // Should be less than 100%
    });

    it('should throw error for zero amounts', () => {
      const liquidityParams: LiquidityParams = {
        amountA: new Decimal(0),
        amountB: new Decimal(10000),
      };

      expect(() => {
        ammFormulas.calculateLiquidity(reserves, liquidityParams);
      }).toThrow('Amounts must be positive');
    });
  });

  describe('calculateLiquidityWithdrawal', () => {
    it('should calculate correct withdrawal amounts', () => {
      const liquidity = new Decimal(100000);
      const result = ammFormulas.calculateLiquidityWithdrawal(reserves, liquidity);
      
      expect(result.amountA).toBeDefined();
      expect(result.amountB).toBeDefined();
      expect(result.amountA.gt(0)).toBe(true);
      expect(result.amountB.gt(0)).toBe(true);
    });

    it('should throw error for excessive liquidity', () => {
      const excessiveLiquidity = new Decimal(2000000);
      
      expect(() => {
        ammFormulas.calculateLiquidityWithdrawal(reserves, excessiveLiquidity);
      }).toThrow('Insufficient liquidity');
    });
  });

  describe('calculateSpotPrice', () => {
    it('should calculate correct spot price', () => {
      const price = ammFormulas.calculateSpotPrice(reserves);
      
      expect(price).toBeDefined();
      expect(price.gt(0)).toBe(true);
      expect(price.eq(1)).toBe(true); // Should be 1 for equal reserves
    });

    it('should throw error for invalid reserves', () => {
      const invalidReserves: PoolReserves = {
        reserveA: new Decimal(0),
        reserveB: new Decimal(1000000),
        totalSupply: new Decimal(1000000),
      };

      expect(() => {
        ammFormulas.calculateSpotPrice(invalidReserves);
      }).toThrow('Invalid reserves');
    });
  });

  describe('calculatePriceImpact', () => {
    it('should calculate correct price impact', () => {
      const amountIn = new Decimal(10000);
      const impact = ammFormulas.calculatePriceImpact(reserves, amountIn, 'A');
      
      expect(impact).toBeDefined();
      expect(impact.gte(0)).toBe(true);
    });

    it('should have higher impact for larger trades', () => {
      const smallAmount = new Decimal(1000);
      const largeAmount = new Decimal(100000);
      
      const smallImpact = ammFormulas.calculatePriceImpact(reserves, smallAmount, 'A');
      const largeImpact = ammFormulas.calculatePriceImpact(reserves, largeAmount, 'A');
      
      expect(largeImpact.gt(smallImpact)).toBe(true);
    });
  });

  describe('calculateImpermanentLoss', () => {
    it('should calculate zero loss for same price', () => {
      const price = new Decimal(1.0);
      const loss = ammFormulas.calculateImpermanentLoss(price, price);
      
      expect(loss.eq(0)).toBe(true);
    });

    it('should calculate positive loss for price changes', () => {
      const initialPrice = new Decimal(1.0);
      const currentPrice = new Decimal(2.0);
      const loss = ammFormulas.calculateImpermanentLoss(initialPrice, currentPrice);
      
      expect(loss.gt(0)).toBe(true);
    });

    it('should be symmetric for price changes', () => {
      const initialPrice = new Decimal(1.0);
      const price1 = new Decimal(2.0);
      const price2 = new Decimal(0.5);
      
      const loss1 = ammFormulas.calculateImpermanentLoss(initialPrice, price1);
      const loss2 = ammFormulas.calculateImpermanentLoss(initialPrice, price2);
      
      expect(loss1.eq(loss2)).toBe(true);
    });
  });

  describe('calculateMinAmountOut', () => {
    it('should calculate correct minimum amount out', () => {
      const amountOut = new Decimal(1000);
      const slippageTolerance = new Decimal(1); // 1%
      const minAmountOut = ammFormulas.calculateMinAmountOut(amountOut, slippageTolerance);
      
      expect(minAmountOut).toBeDefined();
      expect(minAmountOut.lt(amountOut)).toBe(true);
      expect(minAmountOut.gt(0)).toBe(true);
    });

    it('should handle zero slippage', () => {
      const amountOut = new Decimal(1000);
      const slippageTolerance = new Decimal(0);
      const minAmountOut = ammFormulas.calculateMinAmountOut(amountOut, slippageTolerance);
      
      expect(minAmountOut.eq(amountOut)).toBe(true);
    });
  });
});