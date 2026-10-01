import { PoolReserves, SwapParams, SwapResult, LiquidityParams, LiquidityResult, AMMConfig } from '../types';
import { ZERO, ONE, FEE_DENOMINATOR, MIN_LIQUIDITY } from '../constants';
import Decimal from "decimal.js";

/**
 * Pool analytics for constant product (x * y = k) AMMs, computed from swap reserves and amounts
 */
export class AMMFormulas {
  /**
   * Calculate spot price (price without considering slippage)
   * Formula: price = reserveB / reserveA
   */
  public calculateSpotPrice(reserveToken0: Decimal, reserveToken1: Decimal): Decimal {
    if (reserveToken0.lte(ZERO)) {
      throw new Error('Invalid reserves reserveToken0');
    }

    return reserveToken1.div(reserveToken0);
  }

  /**
   * Compute the normalized TVL of a pool
   * @param reserveToken0 - reserve of Token0
   * @param reserveToken1 - reserve of Token1
   * @returns normalized TVL in Token0 units
   * Formula: normalizedTVL(t) = reserveToken0(t) + P(t) × reserveToken1(t)
   */
  public getNormalizedTVL(reserveToken0: Decimal, reserveToken1: Decimal): Decimal {
    if (reserveToken1.lte(ZERO)) {
      throw new Error("reserveToken1 cannot be zero (division by zero).");
    }

    // Price of Token1 in terms of Token0
    const price = reserveToken0.div(reserveToken1);

    const normalizedTVL = reserveToken0.add(price.mul(reserveToken1));

    return normalizedTVL;
  }

  /**
   * Compute the annualization factor to convert period-based metrics to annual rates
   * @param avgTimeStellarBlock - average block time on Stellar (in seconds)
   * @param blockNow - block number at time t
   * @param blockPast - block number at time (t - s)
   * @returns annualization factor
   * 
   * Formula: annualizationFactor = 31536000 / (avgTimeStellarBlock × (block(t) - block(t - s)))
   */
  public getAnnualizationFactor(
    avgTimeStellarBlock: Decimal,
    blockNow: Decimal,
    blockPast: Decimal
  ): Decimal {
    const SECONDS_IN_YEAR = new Decimal(31536000);

    const blockDiff = blockNow.sub(blockPast);
    if (blockDiff.lte(ZERO)) {
      throw new Error("blockNow must be greater than blockPast.");
    }

    return SECONDS_IN_YEAR.div(avgTimeStellarBlock.mul(blockDiff));
  }

  /**
   * Compute the Global Token0 Exposure
   * @param reserveToken0 - reserve of Token0
   * @param reserveToken1 - reserve of Token1
   * @returns proportion of pool value held in Token0
   */
  public getGlobalToken0Exposure(reserveToken0: Decimal, reserveToken1: Decimal): Decimal {
    const normalizedTVL = this.getNormalizedTVL(reserveToken0, reserveToken1);

    if (normalizedTVL.lte(ZERO)) {
      throw new Error("normalizedTVL cannot be zero.");
    }

    return reserveToken0.div(normalizedTVL);
  }

  /**
   * Calculate average price during a swap
   * Formula: P_avg(t) = √(P(t) × P(t - 1))
   * Geometric mean price during the swap
   * 
   * @param currentPrice - Price at time t: P(t)
   * @param previousPrice - Price at time t-1: P(t-1)
   * @returns Average price: P_avg(t)
   */
  public calculateAveragePrice(currentPrice: Decimal, previousPrice: Decimal): Decimal {
    if (currentPrice.lte(ZERO) || previousPrice.lte(ZERO)) {
      throw new Error('Prices must be positive calculateAveragePrice');
    }

    // P_avg(t) = √(P(t) × P(t - 1))
    const product = currentPrice.mul(previousPrice);
    return product.sqrt();
  }

  /**
   * Calculate normalized volume
   * Formula: normalizedVolume(t) = max[ |amountSwapToken0(t)|, |amountSwapToken1(t)| / P_avg(t) ]
   * Volume expressed in Token0 equivalent
   * 
   * @param amountSwapToken0 - Amount of Token0 swapped (can be negative)
   * @param amountSwapToken1 - Amount of Token1 swapped (can be negative)
   * @param averagePrice - Average price P_avg(t)
   * @returns Normalized volume in Token0 equivalent
   */
  public calculateNormalizedVolume(
    amountSwapToken0: Decimal,
    amountSwapToken1: Decimal,
    averagePrice: Decimal
  ): Decimal {
    if (averagePrice.lte(ZERO)) {
      throw new Error('Average price cannot be zero');
    }

    // normalizedVolume(t) = max[ |amountSwapToken0(t)|, |amountSwapToken1(t)| / P_avg(t) ]
    const absAmountToken0 = amountSwapToken0.abs();
    const absAmountToken1 = amountSwapToken1.abs();
    const token1InToken0Equivalent = absAmountToken1.div(averagePrice);

    return Decimal.max(absAmountToken0, token1InToken0Equivalent);
  }

  /**
   * Calculate captured fees
   * Formula: feeCaptured(t) = |amountSwapToken0(t) + amountSwapToken1(t) / P_avg(t)|
   * Total fees captured by the pool
   * 
   * @param amountSwapToken0 - Amount of Token0 swapped
   * @param amountSwapToken1 - Amount of Token1 swapped
   * @param averagePrice - Average price P_avg(t)
   * @returns Total fees captured in Token0 equivalent
   */
  public calculateCapturedFees(
    amountSwapToken0: Decimal,
    amountSwapToken1: Decimal,
    averagePrice: Decimal
  ): Decimal {
    if (averagePrice.lte(ZERO)) {
      throw new Error('Average price cannot be zero');
    }

    // feeCaptured(t) = |amountSwapToken0(t) + amountSwapToken1(t) / P_avg(t)|
    const token1InToken0Equivalent = amountSwapToken1.div(averagePrice);
    const totalFees = amountSwapToken0.add(token1InToken0Equivalent);

    return totalFees.abs();
  }

  /**
   * Calculate pool fee rate
   * Formula: poolFee(t) = feeCaptured(t) / normalizedVolume(t)
   * Effective fee rate for the swap
   * 
   * @param feeCaptured - Total fees captured in Token0 equivalent
   * @param normalizedVolume - Normalized volume in Token0 equivalent
   * @returns Effective pool fee rate (unitless fraction)
   */
  public calculatePoolFeeRate(
    feeCaptured: Decimal,
    normalizedVolume: Decimal
  ): Decimal {
    if (normalizedVolume.lte(ZERO)) {
      throw new Error('Normalized volume cannot be zero');
    }

    return feeCaptured.div(normalizedVolume);
  }

  /**
   * Calculate turnover factor
   * Formula: turnoverFactor(t) = (sum_{n=t-s+1}^{t} normalizedVolume(n)) / (s × normalizedTVL(t))
   * 
   * @param normalizedVolumesWindow - Array of last s normalized volumes ordered oldest..newest
   * @param s - Window size (must equal normalizedVolumesWindow.length)
   * @param normalizedTVLAtT - normalizedTVL(t)
   * @returns Turnover factor (unitless)
   */
  public calculateTurnoverFactor(
    normalizedVolumesWindow: Decimal[],
    s: Decimal,
    normalizedTVLAtT: Decimal
  ): Decimal {
    if (s.lte(ZERO)) {
      throw new Error('Window size s must be positive');
    }
    if (normalizedVolumesWindow.length !== s.toNumber()) {
      throw new Error('normalizedVolumesWindow length must equal s');
    }
    if (normalizedTVLAtT.lte(ZERO)) {
      throw new Error('normalizedTVLAtT cannot be zero');
    }

    const sumVolumes = normalizedVolumesWindow.reduce((acc, v) => acc.add(v.abs()), ZERO);
    return sumVolumes.div(s.mul(normalizedTVLAtT));
  }

  /**
   * Calculate cumulative profit from fees over a time period [t0, t]
   * Formula: profit(t0, t) = Σ_{n=t0}^{t} ( feeCaptured(n) / normalizedTVL(n) )
   * 
   * @param feeCapturedSeries - Array of feeCaptured values for each period n (t0..t)
   * @param normalizedTVLSeries - Array of normalizedTVL values for each period n (t0..t)
   * @returns Cumulative profit (unitless fraction)
   */
  public calculateProfit(
    feeCapturedSeries: Decimal[],
    normalizedTVLSeries: Decimal[]
  ): Decimal {
    if (feeCapturedSeries.length === 0 || normalizedTVLSeries.length === 0) {
      throw new Error('Input series cannot be empty');
    }
    if (feeCapturedSeries.length !== normalizedTVLSeries.length) {
      throw new Error('Input series must have the same length');
    }

    let profit = ZERO;
    for (let i = 0; i < feeCapturedSeries.length; i++) {
      const tvl = normalizedTVLSeries[i];
      if (tvl.lte(ZERO)) {
        throw new Error(`normalizedTVL at index ${i} cannot be zero`);
      }
      profit = profit.add(feeCapturedSeries[i].div(tvl));
    }
    return profit;
  }

  public calculateProfitSeries(
    feeCapturedSeries: Decimal[],
    normalizedTVLSeries: Decimal[]
  ): Decimal[] {
    if (feeCapturedSeries.length !== normalizedTVLSeries.length) {
      throw new Error('Input series must have the same length');
    }
  
    let profit = ZERO;
    const profitList: Decimal[] = [];
  
    for (let i = 0; i < feeCapturedSeries.length; i++) {
      const tvl = normalizedTVLSeries[i];
      if (tvl.lte(ZERO)) {
        throw new Error(`normalizedTVL at index ${i} cannot be zero`);
      }
      profit = profit.add(feeCapturedSeries[i].div(tvl));
      profitList.push(profit);
    }
  
    return profitList;
  }
  


    /**
   * Calculate  profit from fees from 1 swap
   * Formula: feeCaptured / normalizedTVL
   * 
   * @param feeCapturedSeries - feeCaptured values for each period n (t0..t)
   * @param normalizedTVLSeries - normalizedTVL values for each period n (t0..t)
   * @returns profit (unitless fraction)
   */
    public calculateOneProfit(
      feeCaptured: Decimal,
      normalizedTVL: Decimal
    ): Decimal {
        if (normalizedTVL.lte(ZERO)) {
          throw new Error(`normalizedTVL cannot be zero`);
        }
        const profit = new Decimal(0);
      
      return profit.add(feeCaptured.div(normalizedTVL));
    }

  /**
   * Calculate percent loss (impermanent loss) for a balanced 50/50 pool
   * Simplified Formula:
   *   percentLoss(t0, t) = 1 - ( 2 * √( P(t) / P(t0) ) ) / ( 1 + P(t) / P(t0) )
   * 
   * @param initialPrice - P(t0)
   * @param currentPrice - P(t)
   * @returns Percent loss as a fraction (e.g., 0.05 for 5%)
   */
  public calculatePercentLossBalanced(
    initialPrice: Decimal,
    currentPrice: Decimal
  ): Decimal {
    if (initialPrice.lte(ZERO)) {
      throw new Error('initialPrice must be positive');
    }
    if (currentPrice.lte(ZERO)) {
      throw new Error('currentPrice must be positive');
    }

    const priceRatio = currentPrice.div(initialPrice); // P(t) / P(t0)
    const sqrtRatio = priceRatio.sqrt();

    return ONE.sub(new Decimal(2).mul(sqrtRatio).div(ONE.add(priceRatio)));
  }

  /**
   * Calculate Profit and Loss (PnL) accounting for impermanent loss
   * Formula: PnL(t0, t) = (1 + profit(t0, t)) × (1 - percentLoss(t0, t)) - 1
   * 
   * @param cumulativeProfit - profit(t0, t), cumulative profit fraction from fees
   * @param percentLoss - percentLoss(t0, t), impermanent loss fraction (0..1)
   * @returns Net PnL fraction
   */
  public calculatePnL(
    cumulativeProfit: Decimal,
    percentLoss: Decimal
  ): Decimal {
    if (!cumulativeProfit.isFinite()) {
      throw new Error('cumulativeProfit must be finite');
    }
    if (!percentLoss.isFinite()) {
      throw new Error('percentLoss must be finite');
    }

    return ONE.add(cumulativeProfit).mul(ONE.sub(percentLoss)).sub(ONE);
  }

  /**
   * Calculate Annual Percentage Rate (APR)
   * Formula: APR(t) = PnL(t - s, t) × annualizationFactor
   * 
   * @param pnlWindow - PnL over the last window [t - s, t]
   * @param annualizationFactor - Factor to annualize period returns (e.g., 31536000/(avgBlockTime*blocksInWindow))
   * @returns APR as a fraction
   */
  public calculateAPR(
    pnlWindow: Decimal,
    annualizationFactor: Decimal
  ): Decimal {
    if (!pnlWindow.isFinite()) {
      throw new Error('pnlWindow must be finite');
    }
    if (!annualizationFactor.isFinite()) {
      throw new Error('annualizationFactor must be finite');
    }

    return pnlWindow.mul(annualizationFactor);
  }

  /**
   * Calculate period-over-period return rate r(t)
   * Formula: r(t) = [PnL(t, t0) - PnL(t - 1, t0)] / PnL(t - 1, t0)
   * 
   * @param pnlAtT - PnL(t, t0)
   * @param pnlAtTMinus1 - PnL(t - 1, t0)
   * @returns Period-over-period return rate
   */
  public calculatePeriodReturn(
    pnlAtT: Decimal,
    pnlAtTMinus1: Decimal
  ): Decimal {
    if (!pnlAtT.isFinite() || !pnlAtTMinus1.isFinite()) {
      throw new Error('Inputs must be finite');
    }
    if (pnlAtTMinus1.lte(ZERO)) {
      throw new Error('pnlAtTMinus1 cannot be zero');
    }

    return pnlAtT.sub(pnlAtTMinus1).div(pnlAtTMinus1);
  }

  /**
   * Calculate average return over a smoothing period
   * Formula: r̄ = (1 / s) × Σ_{n=t-s+1}^{t} r(n)
   * 
   * @param returnsWindow - Array of last s period returns r(n) ordered oldest..newest
   * @param s - Window size (must equal returnsWindow.length)
   * @returns Mean return over the window
   */
  public calculateAverageReturn(
    returnsWindow: Decimal[],
    s: Decimal
  ): Decimal {
    if (s.lte(ZERO)) {
      throw new Error('Window size s must be positive');
    }
    if (returnsWindow.length !== s.toNumber()) {
      throw new Error('returnsWindow length must equal s');
    }

    const sum = returnsWindow.reduce((acc, r) => acc.add(r), ZERO);
    return sum.div(s);
  }

  public calculateAverageReturnSeries(returns: Decimal[], windowSize: number): Decimal[] {
    if (returns.length < windowSize) return [];
  
    const averages: Decimal[] = [];
    let runningSum = ZERO;
  
    for (let i = 0; i < windowSize; i++) {
      runningSum = runningSum.add(returns[i]);
    }
    averages.push(runningSum.div(new Decimal(windowSize)));
  
    for (let i = windowSize; i < returns.length; i++) {
      runningSum = runningSum.add(returns[i]).sub(returns[i - windowSize]);
      averages.push(runningSum.div(new Decimal(windowSize)));
    }
  
    return averages;
  }

  /**
   * Calculate standard deviation of returns over a smoothing period
   * Formula: σ_r = sqrt( (1 / s) × Σ_{n=t-s+1}^{t} ( r(n) - r̄ )^2 )
   * 
   * @param returnsWindow - Array of last s period returns r(n) ordered oldest..newest
   * @param s - Window size (must equal returnsWindow.length)
   * @param averageReturn - Optional precomputed mean return r̄; if omitted computed from window
   * @returns Standard deviation of returns over the window
   */
  public calculateReturnStdDev(
    returnsWindow: Decimal[],
    s: Decimal,
    averageReturn?: Decimal
  ): Decimal {
    if (s.lte(ZERO)) {
      throw new Error('Window size s must be positive');
    }
    if (returnsWindow.length !== s.toNumber()) {
      throw new Error('returnsWindow length must equal s');
    }

    const mean = averageReturn !== undefined ? averageReturn : this.calculateAverageReturn(returnsWindow, s);
    const variance = returnsWindow.reduce((acc, r) => {
      const diff = r.sub(mean);
      return acc.add(diff.mul(diff));
    }, ZERO).div(s);

    return variance.sqrt();
  }

  public calculateReturnStdDevSeries(returns: Decimal[]): Decimal[] {
    const stdDevs: Decimal[] = [];
    let runningSum = ZERO;
    let runningSumSquares = ZERO;
  
    for (let i = 0; i < returns.length; i++) {
      const r = returns[i];
      runningSum = runningSum.add(r);
      const mean = runningSum.div(new Decimal(i + 1));
  
      const diff = r.sub(mean);
      runningSumSquares = runningSumSquares.add(diff.mul(diff));
  
      stdDevs.push(runningSumSquares.div(new Decimal(i + 1)).sqrt());
    }
  
    return stdDevs;
  }

  /**
   * Calculate Sharpe Ratio (risk-adjusted return)
   * Formula: sharpe(t) = r̄ × sqrt(annualizationFactor) / σ_r
   * Assumes risk-free rate is 0 and volatility scales with sqrt(time)
   * 
   * @param averageReturn - Mean return over window r̄
   * @param stdDevReturns - Standard deviation of returns σ_r
   * @param annualizationFactor - Factor for annualizing returns (per your block/time basis)
   * @returns Sharpe ratio
   */
  public calculateSharpeRatio(
    averageReturn: Decimal,
    stdDevReturns: Decimal,
    annualizationFactor: Decimal
  ): Decimal {
    if (!averageReturn.isFinite()) {
      throw new Error('averageReturn must be finite');
    }
    if (stdDevReturns.lte(ZERO) || !stdDevReturns.isFinite()) {
      throw new Error('stdDevReturns must be positive and finite');
    }
    if (annualizationFactor.lte(ZERO) || !annualizationFactor.isFinite()) {
      throw new Error('annualizationFactor must be positive and finite');
    }

    const scale = annualizationFactor.sqrt();
    return averageReturn.mul(scale).div(stdDevReturns);
  }

  /**
   * Calculate instantaneous price volatility for an individual swap
   * Formula: vol(t) = | ln( P(t) / P(t - 1) ) |
   */
  public calculateInstantaneousVolatility(currentPrice: Decimal, previousPrice: Decimal): Decimal {
    if (currentPrice.lte(ZERO) || previousPrice.lte(ZERO)) {
      throw new Error('Prices must be positive');
    }
    return currentPrice.div(previousPrice).ln().abs();
  }

  /**
   * Calculate average volatility over a smoothing period
   * Formula: V̄(t) = (1 / s) × Σ_{n=t-s+1}^{t} vol(n)
   * 
   * @param volWindow - Array of last s instantaneous vol values ordered oldest..newest
   * @param s - Window size (must equal volWindow.length)
   * @returns Mean volatility over the window
   */
  public calculateAverageVolatility(volWindow: Decimal[], s: Decimal): Decimal {
    if (s.lte(ZERO)) {
      throw new Error('Window size s must be positive');
    }
    if (volWindow.length !== s.toNumber()) {
      throw new Error('volWindow length must equal s');
    }

    const sum = volWindow.reduce((acc, v) => acc.add(v), ZERO);
    return sum.div(s);
  }

  public calculateAverageVolatilitySeries(volSeries: Decimal[]): Decimal[] {
    const averages: Decimal[] = [];
    let runningSum = ZERO;
  
    for (let i = 0; i < volSeries.length; i++) {
      runningSum = runningSum.add(volSeries[i]);
      averages.push(runningSum.div(new Decimal(i + 1)));
    }
  
    return averages;
  }

  /**
   * Calculate variance of price volatility over a smoothing period
   * Formula: V_vol(t) = (1 / s) × Σ_{n=t-s+1}^{t} [ vol(n) - V̄(t) ]^2
   * 
   * @param volWindow - Array of last s instantaneous vol values ordered oldest..newest
   * @param s - Window size (must equal volWindow.length)
   * @param averageVolatility - Optional precomputed mean volatility V̄(t); if omitted computed from window
   * @returns Variance of volatility
   */
  public calculateVolatilityVariance(
    volWindow: Decimal[],
    s: Decimal,
    averageVolatility?: Decimal
  ): Decimal {
    if (s.lte(ZERO)) {
      throw new Error('Window size s must be positive');
    }
    if (volWindow.length !== s.toNumber()) {
      throw new Error('volWindow length must equal s');
    }

    const meanVol = averageVolatility !== undefined ? averageVolatility : this.calculateAverageVolatility(volWindow, s);
    const variance = volWindow.reduce((acc, v) => {
      const diff = v.sub(meanVol);
      return acc.add(diff.mul(diff));
    }, ZERO).div(s);

    return variance;
  }

  public calculateVolatilityVarianceSeries(volSeries: Decimal[]): Decimal[] {
    const variances: Decimal[] = [];
    let runningSum = ZERO;
    let runningSumSquares = ZERO;
  
    for (let i = 0; i < volSeries.length; i++) {
      const vol = volSeries[i];
      runningSum = runningSum.add(vol);
      const meanVol = runningSum.div(new Decimal(i + 1));
  
      const diff = vol.sub(meanVol);
      runningSumSquares = runningSumSquares.add(diff.mul(diff));
  
      variances.push(runningSumSquares.div(new Decimal(i + 1)));
    }
  
    return variances;
  }

  /**
   * Calculate average normalized TVL over a smoothing period
   * Formula: TVL̄(t) = (1 / s) × Σ_{n=t-s+1}^{t} normalizedTVL(n)
   */
  public calculateAverageTVL(normalizedTVLWindow: Decimal[], s: Decimal): Decimal {
    if (s.lte(ZERO)) {
      throw new Error('Window size s must be positive');
    }
    if (normalizedTVLWindow.length !== s.toNumber()) {
      throw new Error('normalizedTVLWindow length must equal s');
    }
    const sum = normalizedTVLWindow.reduce((acc, v) => acc.add(v), ZERO);
    return sum.div(s);
  }

  public calculateAverageTVLSeries(normalizedTVLList: Decimal[]): Decimal[] {
    const averages: Decimal[] = [];
    let runningSum = ZERO;
  
    for (let i = 0; i < normalizedTVLList.length; i++) {
      runningSum = runningSum.add(normalizedTVLList[i]);
      averages.push(runningSum.div(new Decimal(i + 1)));
    }
  
    return averages;
  }

  /**
   * Calculate TVL variance over a smoothing period
   * Formula: V_tvl(t) = (1 / s) × Σ_{n=t-s+1}^{t} [ normalizedTVL(n) - TVL̄(t) ]^2
   */
  public calculateTVLVariance(
    normalizedTVLWindow: Decimal[],
    s: Decimal,
    averageTVL?: Decimal
  ): Decimal {
    if (s.lte(ZERO)) {
      throw new Error('Window size s must be positive');
    }
    if (normalizedTVLWindow.length !== s.toNumber()) {
      throw new Error('normalizedTVLWindow length must equal s');
    }

    const meanTVL = averageTVL !== undefined ? averageTVL : this.calculateAverageTVL(normalizedTVLWindow, s);
    const variance = normalizedTVLWindow.reduce((acc, v) => {
      const diff = v.sub(meanTVL);
      return acc.add(diff.mul(diff));
    }, ZERO).div(s);

    return variance;
  }

  public calculateTVLVarianceSeries(normalizedTVLList: Decimal[]): Decimal[] {
    const variances: Decimal[] = [];
    let runningSum = ZERO;
    let runningSumSquares = ZERO;
  
    for (let i = 0; i < normalizedTVLList.length; i++) {
      const tvl = normalizedTVLList[i];
      runningSum = runningSum.add(tvl);
      const meanTVL = runningSum.div(new Decimal(i + 1));
  
      const diff = tvl.sub(meanTVL);
      runningSumSquares = runningSumSquares.add(diff.mul(diff));
  
      variances.push(runningSumSquares.div(new Decimal(i + 1)));
    }
  
    return variances;
  }

  /**
   * Calculate pool efficiency metric (0-100%)
   * Formula: efficiency(t) = 100 × (1 - e^{-10×turnoverFactor(t)}) × min(globalToken0Exposure(t), 1 - globalToken0Exposure(t)) × 2
   * 
   * @param turnoverFactor - turnoverFactor(t), non-negative
   * @param globalToken0Exposure - globalToken0Exposure(t) in [0, 1]
   * @returns Efficiency percentage (0 to 100)
   */
  public calculateEfficiency(turnoverFactor: Decimal, globalToken0Exposure: Decimal): Decimal {
    if (turnoverFactor.lt(ZERO) || !turnoverFactor.isFinite()) {
      throw new Error('turnoverFactor must be a non-negative finite number');
    }
    if (!globalToken0Exposure.isFinite() || globalToken0Exposure.lt(ZERO) || globalToken0Exposure.gt(ONE)) {
      throw new Error('globalToken0Exposure must be in [0, 1]');
    }

    const utilizationComponent = ONE.sub(new Decimal(-10).mul(turnoverFactor).exp());
    const balanceComponent = Decimal.min(globalToken0Exposure, ONE.sub(globalToken0Exposure)).mul(2);
    const efficiency = new Decimal(100).mul(utilizationComponent).mul(balanceComponent);

    return Decimal.max(ZERO, Decimal.min(new Decimal(100), efficiency));
  }

  /**
   * Calculate stability metric (0-100%) combining price and depth stability
   * Formula: stability(t) = 100 × exp(-10 × V_vol(t) / V̄(t)) × exp(-10 × V_tvl(t) / TVL̄(t))
   * 
   * @param volatilityVariance - V_vol(t)
   * @param averageVolatility - V̄(t) (must be > 0)
   * @param tvlVariance - V_tvl(t)
   * @param averageTVL - TVL̄(t) (must be > 0)
   * @returns Stability score between 0 and 100
   */
  public calculateStability(
    volatilityVariance: Decimal,
    averageVolatility: Decimal,
    tvlVariance: Decimal,
    averageTVL: Decimal
  ): Decimal {
    if (volatilityVariance.lt(ZERO) || !volatilityVariance.isFinite()) {
      throw new Error('volatilityVariance must be a non-negative finite number');
    }
    if (tvlVariance.lt(ZERO) || !tvlVariance.isFinite()) {
      throw new Error('tvlVariance must be a non-negative finite number');
    }
    if (averageVolatility.lte(ZERO) || !averageVolatility.isFinite()) {
      throw new Error('averageVolatility must be positive and finite');
    }
    if (averageTVL.lte(ZERO) || !averageTVL.isFinite()) {
      throw new Error('averageTVL must be positive and finite');
    }

    const priceStability = new Decimal(-10).mul(volatilityVariance.div(averageVolatility)).exp();
    const depthStability = new Decimal(-10).mul(tvlVariance.div(averageTVL)).exp();
    const stability = new Decimal(100).mul(priceStability).mul(depthStability);

    return Decimal.max(ZERO, Decimal.min(new Decimal(100), stability));
  }

  /**
   * Calculate profitability metric (0-100%) using Sharpe ratio normalization
   * Formula: profitability(t) = 100 × 1 / (1 + e^{-10 × sharpe(t)})
   * 50% corresponds to Sharpe = 0
   */
  public calculateProfitability(sharpeRatio: Decimal): Decimal {
    if (!sharpeRatio.isFinite()) {
      throw new Error('sharpeRatio must be finite');
    }
    const sigmoid = ONE.div(ONE.add(new Decimal(-10).mul(sharpeRatio).exp()));
    return new Decimal(100).mul(sigmoid);
  }

  /**
   * Delta APR between target and current pools
   */
  public calculateDeltaAPR(aprTarget: Decimal, aprCurrent: Decimal): Decimal {
    if (!aprTarget.isFinite() || !aprCurrent.isFinite()) {
      throw new Error('APR values must be finite');
    }
    return aprTarget.sub(aprCurrent);
  }

  /**
   * Compute recovery days to cover arbitrage fee using APR differential
   * Formula: recoveryDays = (365 × arbitrageFee) / (userPositionToken0 × (APR_target - APR_current))
   * All rates should be provided as fractions (e.g., 0.12 for 12%).
   */
  public calculateArbitrageRecoveryDays(
    arbitrageFee: Decimal,
    userPositionToken0: Decimal,
    deltaAPR: Decimal
  ): Decimal {
    if (arbitrageFee.lt(ZERO) || !arbitrageFee.isFinite()) {
      throw new Error('arbitrageFee must be a non-negative finite number');
    }
    if (userPositionToken0.lte(ZERO) || !userPositionToken0.isFinite()) {
      throw new Error('userPositionToken0 must be positive and finite');
    }
    if (!deltaAPR.isFinite()) {
      throw new Error('deltaAPR must be finite');
    }
    const denominator = userPositionToken0.mul(deltaAPR);
    if (denominator.lte(ZERO)) {
      // If deltaAPR <= 0, there is no recovery; return Infinity to indicate never recovers
      return new Decimal(Infinity);
    }
    return new Decimal(365).mul(arbitrageFee).div(denominator);
  }

  /**
   * Check whether it is profitable to switch pools based on a recovery day threshold
   * Returns true if recoveryDays > recoveryDayThreshold
   */
  public shouldSwitchPool(recoveryDays: Decimal, recoveryDayThreshold: Decimal): boolean {
    if (!recoveryDays.isFinite() || !recoveryDayThreshold.isFinite()) {
      throw new Error('Inputs must be finite');
    }
    return recoveryDays.gt(recoveryDayThreshold);
  }
}