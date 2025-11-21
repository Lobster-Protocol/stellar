import { Decimal } from 'decimal.js';
import { AMMFormulas } from '../formulas/amm';
import { ZERO, ONE } from '../constants';

describe('AMMFormulas', () => {
  let ammFormulas: AMMFormulas;

  beforeEach(() => {
    ammFormulas = new AMMFormulas();
  });

  describe('calculateSpotPrice', () => {
    it('should calculate correct spot price for equal reserves', () => {
      const price = ammFormulas.calculateSpotPrice(
        new Decimal(1000000),
        new Decimal(1000000)
      );
      expect(price.eq(ONE)).toBe(true);
    });

    it('should calculate correct spot price for different reserves', () => {
      const price = ammFormulas.calculateSpotPrice(
        new Decimal(1000000),
        new Decimal(2000000)
      );
      expect(price.eq(2)).toBe(true);
    });

    it('should throw error for zero reserveToken0', () => {
      expect(() => {
        ammFormulas.calculateSpotPrice(ZERO, new Decimal(1000000));
      }).toThrow('Invalid reserves reserveToken0');
    });
  });

  describe('getNormalizedTVL', () => {
    it('should calculate normalized TVL correctly', () => {
      const tvl = ammFormulas.getNormalizedTVL(
        new Decimal(1000000),
        new Decimal(1000000)
      );
      expect(tvl.gt(ZERO)).toBe(true);
      expect(tvl.eq(new Decimal(2000000))).toBe(true);
    });

    it('should throw error for zero reserveToken1', () => {
      expect(() => {
        ammFormulas.getNormalizedTVL(new Decimal(1000000), ZERO);
      }).toThrow('reserveToken1 cannot be zero');
    });
  });

  describe('getGlobalToken0Exposure', () => {
    it('should calculate correct exposure for balanced pool', () => {
      const exposure = ammFormulas.getGlobalToken0Exposure(
        new Decimal(1000000),
        new Decimal(1000000)
      );
      expect(exposure.eq(new Decimal(0.5))).toBe(true);
    });

    it('should calculate exposure correctly for different ratios', () => {
      // For balanced pool (1M:1M), exposure should be 0.5
      const exposure1 = ammFormulas.getGlobalToken0Exposure(
        new Decimal(1000000),
        new Decimal(1000000)
      );
      expect(exposure1.eq(new Decimal(0.5))).toBe(true);
      
      // For 2M:1M pool, price = 2M/1M = 2, normalizedTVL = 2M + 2*1M = 4M
      // Exposure = 2M/4M = 0.5 (the formula normalizes by price)
      const exposure2 = ammFormulas.getGlobalToken0Exposure(
        new Decimal(2000000),
        new Decimal(1000000)
      );
      expect(exposure2.eq(new Decimal(0.5))).toBe(true);
    });
  });

  describe('calculateAveragePrice', () => {
    it('should calculate geometric mean correctly', () => {
      const avgPrice = ammFormulas.calculateAveragePrice(
        new Decimal(2),
        new Decimal(8)
      );
      // √(2 * 8) = √16 = 4
      expect(avgPrice.eq(4)).toBe(true);
    });

    it('should throw error for zero prices', () => {
      expect(() => {
        ammFormulas.calculateAveragePrice(ZERO, new Decimal(2));
      }).toThrow('Prices must be positive');
    });
  });

  describe('calculateNormalizedVolume', () => {
    it('should calculate normalized volume correctly', () => {
      const volume = ammFormulas.calculateNormalizedVolume(
        new Decimal(1000),
        new Decimal(2000),
        new Decimal(2)
      );
      expect(volume.gt(ZERO)).toBe(true);
    });

    it('should throw error for zero average price', () => {
      expect(() => {
        ammFormulas.calculateNormalizedVolume(
          new Decimal(1000),
          new Decimal(2000),
          ZERO
        );
      }).toThrow('Average price cannot be zero');
    });
  });

  describe('calculateCapturedFees', () => {
    it('should calculate captured fees correctly', () => {
      const fees = ammFormulas.calculateCapturedFees(
        new Decimal(1000),
        new Decimal(2000),
        new Decimal(2)
      );
      expect(fees.gte(ZERO)).toBe(true);
    });
  });

  describe('calculatePoolFeeRate', () => {
    it('should calculate fee rate correctly', () => {
      const feeRate = ammFormulas.calculatePoolFeeRate(
        new Decimal(10),
        new Decimal(1000)
      );
      expect(feeRate.eq(new Decimal(0.01))).toBe(true);
    });

    it('should throw error for zero volume', () => {
      expect(() => {
        ammFormulas.calculatePoolFeeRate(new Decimal(10), ZERO);
      }).toThrow('Normalized volume cannot be zero');
    });
  });

  describe('calculateTurnoverFactor', () => {
    it('should calculate turnover factor correctly', () => {
      const volumes = [
        new Decimal(1000),
        new Decimal(2000),
        new Decimal(1500)
      ];
      const tvl = new Decimal(10000);
      const factor = ammFormulas.calculateTurnoverFactor(
        volumes,
        new Decimal(3),
        tvl
      );
      expect(factor.gt(ZERO)).toBe(true);
    });

    it('should throw error for mismatched window size', () => {
      expect(() => {
        ammFormulas.calculateTurnoverFactor(
          [new Decimal(1000)],
          new Decimal(2),
          new Decimal(10000)
        );
      }).toThrow('normalizedVolumesWindow length must equal s');
    });
  });

  describe('calculateProfit', () => {
    it('should calculate cumulative profit correctly', () => {
      const fees = [new Decimal(10), new Decimal(20), new Decimal(15)];
      const tvls = [new Decimal(1000), new Decimal(1000), new Decimal(1000)];
      const profit = ammFormulas.calculateProfit(fees, tvls);
      expect(profit.gt(ZERO)).toBe(true);
      // Should be (10/1000 + 20/1000 + 15/1000) = 0.045
      expect(profit.eq(new Decimal(0.045))).toBe(true);
    });

    it('should throw error for empty series', () => {
      expect(() => {
        ammFormulas.calculateProfit([], []);
      }).toThrow('Input series cannot be empty');
    });

    it('should throw error for mismatched lengths', () => {
      expect(() => {
        ammFormulas.calculateProfit(
          [new Decimal(10)],
          [new Decimal(1000), new Decimal(1000)]
        );
      }).toThrow('Input series must have the same length');
    });
  });

  describe('calculatePercentLossBalanced', () => {
    it('should calculate zero loss for same price', () => {
      const loss = ammFormulas.calculatePercentLossBalanced(
        new Decimal(1.0),
        new Decimal(1.0)
      );
      expect(loss.eq(ZERO)).toBe(true);
    });

    it('should calculate positive loss for price changes', () => {
      const loss = ammFormulas.calculatePercentLossBalanced(
        new Decimal(1.0),
        new Decimal(2.0)
      );
      expect(loss.gt(ZERO)).toBe(true);
    });

    it('should be symmetric for price changes', () => {
      const initialPrice = new Decimal(1.0);
      const loss1 = ammFormulas.calculatePercentLossBalanced(
        initialPrice,
        new Decimal(2.0)
      );
      const loss2 = ammFormulas.calculatePercentLossBalanced(
        initialPrice,
        new Decimal(0.5)
      );
      expect(loss1.eq(loss2)).toBe(true);
    });

    it('should throw error for zero prices', () => {
      expect(() => {
        ammFormulas.calculatePercentLossBalanced(ZERO, new Decimal(1.0));
      }).toThrow('initialPrice must be positive');
    });
  });

  describe('calculatePnL', () => {
    it('should calculate PnL correctly', () => {
      const profit = new Decimal(0.1);
      const loss = new Decimal(0.05);
      const pnl = ammFormulas.calculatePnL(profit, loss);
      // PnL = (1 + 0.1) * (1 - 0.05) - 1 = 1.1 * 0.95 - 1 = 1.045 - 1 = 0.045
      expect(pnl.gt(ZERO)).toBe(true);
    });

    it('should handle negative PnL', () => {
      const profit = new Decimal(0.01);
      const loss = new Decimal(0.1);
      const pnl = ammFormulas.calculatePnL(profit, loss);
      // PnL = (1 + 0.01) * (1 - 0.1) - 1 = 1.01 * 0.9 - 1 = 0.909 - 1 = -0.091
      expect(pnl.lt(ZERO)).toBe(true);
    });
  });

  describe('calculateAPR', () => {
    it('should calculate APR correctly', () => {
      const pnl = new Decimal(0.05);
      const annualizationFactor = new Decimal(2);
      const apr = ammFormulas.calculateAPR(pnl, annualizationFactor);
      expect(apr.eq(new Decimal(0.1))).toBe(true);
    });
  });

  describe('calculatePeriodReturn', () => {
    it('should calculate period return correctly', () => {
      const pnlAtT = new Decimal(0.1);
      const pnlAtTMinus1 = new Decimal(0.05);
      const returnRate = ammFormulas.calculatePeriodReturn(pnlAtT, pnlAtTMinus1);
      // r = (0.1 - 0.05) / 0.05 = 1.0
      expect(returnRate.eq(ONE)).toBe(true);
    });

    it('should throw error for zero previous PnL', () => {
      expect(() => {
        ammFormulas.calculatePeriodReturn(new Decimal(0.1), ZERO);
      }).toThrow('pnlAtTMinus1 cannot be zero');
    });
  });

  describe('calculateAverageReturn', () => {
    it('should calculate average return correctly', () => {
      const returns = [
        new Decimal(0.1),
        new Decimal(0.2),
        new Decimal(0.15)
      ];
      const avg = ammFormulas.calculateAverageReturn(returns, new Decimal(3));
      // (0.1 + 0.2 + 0.15) / 3 = 0.15
      expect(avg.eq(new Decimal(0.15))).toBe(true);
    });
  });

  describe('calculateInstantaneousVolatility', () => {
    it('should calculate volatility correctly', () => {
      const currentPrice = new Decimal(2.0);
      const previousPrice = new Decimal(1.0);
      const volatility = ammFormulas.calculateInstantaneousVolatility(
        currentPrice,
        previousPrice
      );
      expect(volatility.gte(ZERO)).toBe(true);
    });
  });

  describe('calculateAverageVolatility', () => {
    it('should calculate average volatility correctly', () => {
      const volatilities = [
        new Decimal(0.1),
        new Decimal(0.2),
        new Decimal(0.15)
      ];
      const avg = ammFormulas.calculateAverageVolatility(
        volatilities,
        new Decimal(3)
      );
      expect(avg.gt(ZERO)).toBe(true);
    });
  });

  describe('getAnnualizationFactor', () => {
    it('should calculate annualization factor correctly', () => {
      const avgBlockTime = new Decimal(5); // 5 seconds
      const blockNow = new Decimal(1000);
      const blockPast = new Decimal(100);
      const factor = ammFormulas.getAnnualizationFactor(
        avgBlockTime,
        blockNow,
        blockPast
      );
      expect(factor.gt(ZERO)).toBe(true);
    });

    it('should throw error if blockNow <= blockPast', () => {
      expect(() => {
        ammFormulas.getAnnualizationFactor(
          new Decimal(5),
          new Decimal(100),
          new Decimal(100)
        );
      }).toThrow('blockNow must be greater than blockPast');
    });
  });
});

