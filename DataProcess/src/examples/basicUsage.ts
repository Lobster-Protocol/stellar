/**
 * Basic usage examples for Lobster Protocol Analytical Formulas
 * 
 * These examples demonstrate how to use the AMMFormulas class to calculate
 * various metrics for AMM pools.
 */

import { Decimal } from 'decimal.js';
import { AMMFormulas } from '../formulas/amm';

/**
 * Example 1: Calculate spot price
 */
export function spotPriceExample(): void {
  console.log('=== Spot Price Example ===');
  
  const formulas = new AMMFormulas();
  
  // Pool with 1M USDC and 1M USDT
  const reserveToken0 = new Decimal(1000000);
  const reserveToken1 = new Decimal(1000000);
  
  const spotPrice = formulas.calculateSpotPrice(reserveToken0, reserveToken1);
  console.log(`Spot Price: ${spotPrice.toString()} USDT/USDC`);
  // Output: Spot Price: 1 USDT/USDC
}

/**
 * Example 2: Calculate normalized TVL
 */
export function normalizedTVLExample(): void {
  console.log('\n=== Normalized TVL Example ===');
  
  const formulas = new AMMFormulas();
  
  const reserveToken0 = new Decimal(1000000);
  const reserveToken1 = new Decimal(1000000);
  
  const normalizedTVL = formulas.getNormalizedTVL(reserveToken0, reserveToken1);
  console.log(`Normalized TVL: ${normalizedTVL.toString()}`);
  // Output: Normalized TVL: 2000000
}

/**
 * Example 3: Calculate average price during a swap
 */
export function averagePriceExample(): void {
  console.log('\n=== Average Price Example ===');
  
  const formulas = new AMMFormulas();
  
  const previousPrice = new Decimal(1.0);
  const currentPrice = new Decimal(1.1);
  
  const averagePrice = formulas.calculateAveragePrice(currentPrice, previousPrice);
  console.log(`Previous Price: ${previousPrice.toString()}`);
  console.log(`Current Price: ${currentPrice.toString()}`);
  console.log(`Average Price: ${averagePrice.toString()}`);
  // Output: Average Price: ~1.0488 (geometric mean)
}

/**
 * Example 4: Calculate normalized volume
 */
export function normalizedVolumeExample(): void {
  console.log('\n=== Normalized Volume Example ===');
  
  const formulas = new AMMFormulas();
  
  const amountToken0 = new Decimal(1000);
  const amountToken1 = new Decimal(-1100);
  const averagePrice = new Decimal(1.1);
  
  const normalizedVolume = formulas.calculateNormalizedVolume(
    amountToken0,
    amountToken1,
    averagePrice
  );
  console.log(`Normalized Volume: ${normalizedVolume.toString()}`);
}

/**
 * Example 5: Calculate captured fees
 */
export function capturedFeesExample(): void {
  console.log('\n=== Captured Fees Example ===');
  
  const formulas = new AMMFormulas();
  
  const amountToken0 = new Decimal(1000);
  const amountToken1 = new Decimal(-1100);
  const averagePrice = new Decimal(1.1);
  
  const capturedFees = formulas.calculateCapturedFees(
    amountToken0,
    amountToken1,
    averagePrice
  );
  console.log(`Captured Fees: ${capturedFees.toString()}`);
}

/**
 * Example 6: Calculate profit from fees
 */
export function profitExample(): void {
  console.log('\n=== Profit Example ===');
  
  const formulas = new AMMFormulas();
  
  const feeCapturedSeries = [
    new Decimal(10),
    new Decimal(20),
    new Decimal(15)
  ];
  const normalizedTVLSeries = [
    new Decimal(1000000),
    new Decimal(1000000),
    new Decimal(1000000)
  ];
  
  const profit = formulas.calculateProfit(feeCapturedSeries, normalizedTVLSeries);
  console.log(`Cumulative Profit: ${profit.toString()}`);
  // Output: Cumulative Profit: 0.000045 (0.0045%)
}

/**
 * Example 7: Calculate impermanent loss
 */
export function impermanentLossExample(): void {
  console.log('\n=== Impermanent Loss Example ===');
  
  const formulas = new AMMFormulas();
  
  const initialPrice = new Decimal(1.0);
  const currentPrice = new Decimal(2.0);
  
  const percentLoss = formulas.calculatePercentLossBalanced(initialPrice, currentPrice);
  console.log(`Initial Price: ${initialPrice.toString()}`);
  console.log(`Current Price: ${currentPrice.toString()}`);
  console.log(`Percent Loss: ${percentLoss.mul(100).toString()}%`);
  // Output: Percent Loss: ~5.72% (for 2x price change)
}

/**
 * Example 8: Calculate PnL (Profit and Loss)
 */
export function pnlExample(): void {
  console.log('\n=== PnL Example ===');
  
  const formulas = new AMMFormulas();
  
  const cumulativeProfit = new Decimal(0.1); // 10% profit from fees
  const percentLoss = new Decimal(0.05); // 5% impermanent loss
  
  const pnl = formulas.calculatePnL(cumulativeProfit, percentLoss);
  console.log(`Cumulative Profit: ${cumulativeProfit.mul(100).toString()}%`);
  console.log(`Percent Loss: ${percentLoss.mul(100).toString()}%`);
  console.log(`Net PnL: ${pnl.mul(100).toString()}%`);
  // Output: Net PnL: ~4.5% (after accounting for impermanent loss)
}

/**
 * Example 9: Calculate APR
 */
export function aprExample(): void {
  console.log('\n=== APR Example ===');
  
  const formulas = new AMMFormulas();
  
  const pnl = new Decimal(0.05); // 5% PnL over the period
  const annualizationFactor = new Decimal(12); // Monthly periods (12 per year)
  
  const apr = formulas.calculateAPR(pnl, annualizationFactor);
  console.log(`Period PnL: ${pnl.mul(100).toString()}%`);
  console.log(`Annualization Factor: ${annualizationFactor.toString()}`);
  console.log(`APR: ${apr.mul(100).toString()}%`);
  // Output: APR: 60%
}

/**
 * Example 10: Calculate volatility metrics
 */
export function volatilityExample(): void {
  console.log('\n=== Volatility Example ===');
  
  const formulas = new AMMFormulas();
  
  const prices = [
    new Decimal(1.0),
    new Decimal(1.1),
    new Decimal(0.95),
    new Decimal(1.05),
    new Decimal(1.2)
  ];
  
  const volatilities: Decimal[] = [];
  for (let i = 1; i < prices.length; i++) {
    const vol = formulas.calculateInstantaneousVolatility(prices[i], prices[i - 1]);
    volatilities.push(vol);
  }
  
  const avgVolatility = formulas.calculateAverageVolatility(
    volatilities,
    new Decimal(volatilities.length)
  );
  
  console.log(`Average Volatility: ${avgVolatility.toString()}`);
}

/**
 * Run all examples
 */
export function runAllExamples(): void {
  spotPriceExample();
  normalizedTVLExample();
  averagePriceExample();
  normalizedVolumeExample();
  capturedFeesExample();
  profitExample();
  impermanentLossExample();
  pnlExample();
  aprExample();
  volatilityExample();
}

// If run directly
if (require.main === module) {
  runAllExamples();
}

