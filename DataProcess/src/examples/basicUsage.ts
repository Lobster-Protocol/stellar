import { Decimal } from 'decimal.js';
import { 
  LobsterCalculator, 
  createLobsterCalculator,
  PoolReserves,
  SwapParams,
  LiquidityParams,
  AMMConfig,
  CurveParams,
  FeeTier
} from '../index';

const ONE = new Decimal(1);

/**
 * Basic usage examples for Lobster Protocol Analytical Formulas
 */

// Example 1: Basic AMM swap calculation
export function basicAMMSwapExample(): void {
  console.log('=== Basic AMM Swap Example ===');
  
  // Create calculator with default config
  const calculator = createLobsterCalculator();
  const ammFormulas = calculator.getAMMFormulas();
  
  // Define pool reserves (USDC/USDT pool)
  const reserves: PoolReserves = {
    reserveA: new Decimal(1000000), // 1M USDC
    reserveB: new Decimal(1000000), // 1M USDT
    totalSupply: new Decimal(1000000), // 1M LP tokens
  };
  
  // Define swap parameters
  const swapParams: SwapParams = {
    amountIn: new Decimal(1000), // 1000 USDC
    tokenIn: 'A',
    tokenOut: 'B',
    slippageTolerance: new Decimal(0.5), // 0.5% slippage
  };
  
  try {
    // Calculate swap output
    const result = ammFormulas.calculateSwapOutput(reserves, swapParams);
    
    console.log(`Input: ${swapParams.amountIn} USDC`);
    console.log(`Output: ${result.amountOut} USDT`);
    console.log(`Price Impact: ${result.priceImpact.mul(100)}%`);
    console.log(`Effective Price: ${result.effectivePrice} USDT/USDC`);
    console.log(`Fee: ${result.fee} USDC`);
  } catch (error) {
    console.error('Error calculating swap:', error);
  }
}

// Example 2: Liquidity provision
export function liquidityProvisionExample(): void {
  console.log('\n=== Liquidity Provision Example ===');
  
  const calculator = createLobsterCalculator();
  const ammFormulas = calculator.getAMMFormulas();
  
  const reserves: PoolReserves = {
    reserveA: new Decimal(500000), // 500K USDC
    reserveB: new Decimal(500000), // 500K USDT
    totalSupply: new Decimal(500000), // 500K LP tokens
  };
  
  const liquidityParams: LiquidityParams = {
    amountA: new Decimal(10000), // 10K USDC
    amountB: new Decimal(10000), // 10K USDT
  };
  
  try {
    const result = ammFormulas.calculateLiquidity(reserves, liquidityParams);
    
    console.log(`Adding: ${liquidityParams.amountA} USDC + ${liquidityParams.amountB} USDT`);
    console.log(`Liquidity: ${result.liquidity}`);
    console.log(`Share: ${result.share.mul(100)}%`);
    console.log(`Price Ratio: ${result.priceRatio} USDT/USDC`);
  } catch (error) {
    console.error('Error calculating liquidity:', error);
  }
}

// Example 3: Stable swap calculation
export function stableSwapExample(): void {
  console.log('\n=== Stable Swap Example ===');
  
  const curveParams: CurveParams = {
    amplification: new Decimal(100),
    gamma: new Decimal(0.000145),
    alpha: new Decimal(0.4),
  };
  
  const calculator = createLobsterCalculator(
    undefined, // Use default AMM config
    curveParams,
    undefined // Use default fee tier
  );
  
  const stableFormulas = calculator.getStableSwapFormulas();
  
  const reserves: PoolReserves = {
    reserveA: new Decimal(2000000), // 2M USDC
    reserveB: new Decimal(2000000), // 2M USDT
    totalSupply: new Decimal(2000000),
  };
  
  const swapParams: SwapParams = {
    amountIn: new Decimal(50000), // 50K USDC
    tokenIn: 'A',
    tokenOut: 'B',
  };
  
  try {
    const result = stableFormulas.calculateSwapOutput(reserves, swapParams);
    
    console.log(`Input: ${swapParams.amountIn} USDC`);
    console.log(`Output: ${result.amountOut} USDT`);
    console.log(`Price Impact: ${result.priceImpact.mul(100)}%`);
    console.log(`Effective Price: ${result.effectivePrice} USDT/USDC`);
  } catch (error) {
    console.error('Error calculating stable swap:', error);
  }
}

// Example 4: Price impact analysis
export function priceImpactAnalysisExample(): void {
  console.log('\n=== Price Impact Analysis Example ===');
  
  const calculator = createLobsterCalculator();
  const ammFormulas = calculator.getAMMFormulas();
  
  const reserves: PoolReserves = {
    reserveA: new Decimal(1000000),
    reserveB: new Decimal(1000000),
    totalSupply: new Decimal(1000000),
  };
  
  const tradeSizes = [
    new Decimal(1000),    // 0.1%
    new Decimal(10000),   // 1%
    new Decimal(50000),   // 5%
    new Decimal(100000),  // 10%
  ];
  
  console.log('Trade Size | Price Impact | Effective Price');
  console.log('-----------|--------------|----------------');
  
  tradeSizes.forEach(size => {
    try {
      const impact = ammFormulas.calculatePriceImpact(reserves, size, 'A');
      const spotPrice = ammFormulas.calculateSpotPrice(reserves);
      const effectivePrice = spotPrice.mul(ONE.sub(impact));
      
      console.log(`${size.toString().padStart(10)} | ${impact.mul(100).toFixed(4).padStart(12)}% | ${effectivePrice.toFixed(6).padStart(14)}`);
    } catch (error) {
      console.log(`${size.toString().padStart(10)} | Error: ${error.message}`);
    }
  });
}

// Example 5: Impermanent loss calculation
export function impermanentLossExample(): void {
  console.log('\n=== Impermanent Loss Example ===');
  
  const calculator = createLobsterCalculator();
  const ammFormulas = calculator.getAMMFormulas();
  
  const initialPrice = new Decimal(1.0); // 1 USDT per USDC
  const priceChanges = [
    new Decimal(0.5),   // -50%
    new Decimal(0.8),   // -20%
    new Decimal(1.0),   // 0%
    new Decimal(1.2),   // +20%
    new Decimal(1.5),   // +50%
    new Decimal(2.0),   // +100%
  ];
  
  console.log('Price Change | Impermanent Loss');
  console.log('-------------|-----------------');
  
  priceChanges.forEach(price => {
    try {
      const il = ammFormulas.calculateImpermanentLoss(initialPrice, price);
      const priceChangePercent = price.sub(initialPrice).div(initialPrice).mul(100);
      
      console.log(`${priceChangePercent.toFixed(1).padStart(11)}% | ${il.mul(100).toFixed(4).padStart(15)}%`);
    } catch (error) {
      console.log(`Error: ${error.message}`);
    }
  });
}

// Example 6: Custom configuration
export function customConfigurationExample(): void {
  console.log('\n=== Custom Configuration Example ===');
  
  const customAMMConfig: AMMConfig = {
    feeRate: new Decimal(50), // 0.5% fee
    protocolFeeRate: new Decimal(10), // 0.1% protocol fee
    maxSlippage: new Decimal(2), // 2% max slippage
    minLiquidity: new Decimal(5000),
  };
  
  const customCurveParams: CurveParams = {
    amplification: new Decimal(200),
    gamma: new Decimal(0.0001),
    alpha: new Decimal(0.5),
  };
  
  const customFeeTier: FeeTier = {
    fee: new Decimal(5000), // 0.5% fee
    tickSpacing: 10,
  };
  
  const calculator = new LobsterCalculator(customAMMConfig, customCurveParams, customFeeTier);
  
  console.log('Custom AMM Config:');
  console.log(`  Fee Rate: ${customAMMConfig.feeRate.div(100)}%`);
  console.log(`  Protocol Fee Rate: ${customAMMConfig.protocolFeeRate.div(100)}%`);
  console.log(`  Max Slippage: ${customAMMConfig.maxSlippage}%`);
  
  console.log('\nCustom Curve Params:');
  console.log(`  Amplification: ${customCurveParams.amplification}`);
  console.log(`  Gamma: ${customCurveParams.gamma}`);
  console.log(`  Alpha: ${customCurveParams.alpha}`);
  
  console.log('\nCustom Fee Tier:');
  console.log(`  Fee: ${customFeeTier.fee.div(100)}%`);
  console.log(`  Tick Spacing: ${customFeeTier.tickSpacing}`);
}

// Run all examples
export function runAllExamples(): void {
  basicAMMSwapExample();
  liquidityProvisionExample();
  stableSwapExample();
  priceImpactAnalysisExample();
  impermanentLossExample();
  customConfigurationExample();
}

// Export for use in other files
export {
  basicAMMSwapExample,
  liquidityProvisionExample,
  stableSwapExample,
  priceImpactAnalysisExample,
  impermanentLossExample,
  customConfigurationExample,
};