import { FactoryClient } from '../bindings/factoryClient';
import { LobsterClient } from '../bindings/lobsterClient';
import { TokenClient } from '../bindings/tokenClient';
import {
  Keypair,
} from '@stellar/stellar-sdk';

type AnalyzePoolParams =
  | { type: 'all' }
  | { type: 'user'; userAddress: string }
  | { type: 'poolId'; poolId: number };

type PoolAnalysisResult = {
  poolId?: number;
  lobsterAddress: string;
  token0: string;
  token1: string;
  user?: string;
  currentPool: number;
  newPool: number | null;
  error?: string;
};

export type PoolDecision = {
  shouldChange: boolean;
  currentPool: number; // 0: Soroswap, 1: Phoenix, 2: Aquarius
  targetPool: number | null; // 0: Soroswap, 1: Phoenix, 2: Aquarius, null if no change
};


type PoolChangeConditionParams = {
  arbitrageFee: number;          // annual arbitrage fee (e.g., 0.02 for 2%)
  userPositionToken0: number;    // user's position amount in token0
  APR_poolTarget: number;        // target pool APR (e.g., 0.15 for 15%)
  APR_poolActuelle: number;      // current pool APR (e.g., 0.10 for 10%)
  recoveryDay: number;           // threshold day to trigger change
};
/**
 * Determines whether the pool change condition is met.
 * Returns `true` if the calculated value exceeds the recoveryDay.
 */
export function shouldChangePool(params: PoolChangeConditionParams): boolean {
  const {
    arbitrageFee,
    userPositionToken0,
    APR_poolTarget,
    APR_poolActuelle,
    recoveryDay,
  } = params;

  // Prevent division by zero
  const aprDifference = APR_poolTarget - APR_poolActuelle;
  if (aprDifference <= 0 || userPositionToken0 === 0) return false;

  const result =
    (365 * arbitrageFee) / (userPositionToken0 * aprDifference);

  return result > recoveryDay;
}

/*
 * Get token price in USD from Soroswap API
 * @param asset - Token contract address
 * @param network - Network ('mainnet' or 'testnet'), defaults to 'mainnet'
 * @returns Price of token in USD, or null if error
 */
export async function getTokenPriceUSD(
  asset: string,
  network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<number | null> {
  const apiKey = process.env.API_KEY ?? 'sk_062e947839d9f172572b34c6eb6a9798f3babbb053cdae85cd8550ea2225c92d';
  const baseUrl = 'https://api.soroswap.finance/price';
  const params = new URLSearchParams({
    network: network,
    asset: asset,
    referenceCurrency: 'USD'
  });
  const url = `${baseUrl}?${params.toString()}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching token price:', error);
    return null;
  }
}

export async function getDataLast(token0: string, token1: string, protocol: string): Promise<any> {
  const baseUrl = process.env.PROCESS_URL ?? 'http://localhost:8085/data/last';
  const params = new URLSearchParams({
    token0: token0,
    token1: token1,
    protocol: protocol
  });
  const url = `${baseUrl}?${params.toString()}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {}
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error making API call:', error);
    return [];
  }
}


export async function executePoolMigration(
  clientLobster: LobsterClient,
  decision: PoolDecision,
  currentPool: number,
  poolAddresses: {
    soroswap: string;
    phoenix: string;
    aquarius: string;
  },
  // ... other params needed for withdraw/add_liquidity
): Promise<void> {
  if (!decision.shouldChange || decision.targetPool === null) {
    console.log('No pool change needed');
    return;
  }

  const keypair = Keypair.fromSecret(process.env.SECRET ?? '');
  const publicKey = keypair.publicKey();

  let tx;
  // 1. Withdraw from current pool
  switch (currentPool) {
    case 0: // Soroswap
      tx = await clientLobster.withdraw_soroswap({
        caller: publicKey,
        amount0_min: BigInt(0),
        amount1_min: BigInt(0),
        deadline: BigInt(99999999999),
        pool_address: poolAddresses.soroswap,
        router_address: process.env.SOROSWAP_ROUTER ?? '',
      });
      break;
    case 1: // Phoenix
      tx = await clientLobster.withdraw_phoenix({
        caller: publicKey,
        amount0_min: BigInt(0),
        amount1_min: BigInt(0),
        deadline: BigInt(99999999999),
        pool_address: poolAddresses.phoenix,
      });
      break;
    case 2: // Aquarius
      tx = await clientLobster.withdraw_aquarius({
        caller: publicKey,
        amount0_min: BigInt(0),
        amount1_min: BigInt(0),
        pool_address: poolAddresses.aquarius,
      });
      break;
  }

  console.log('Sending the withdraw transaction...');
  let result = await tx?.signAndSend();
  //console.log('result =>', JSON.stringify(result, null, 2));
  console.log('Withdraw done !');

  await new Promise(resolve => setTimeout(resolve, 10000));

  let balance = await clientLobster.get_amounts_tokens();
  let balance0 = balance._value[0]._value._attributes.lo._value.toString();
  let balance1 = balance._value[1]._value._attributes.lo._value.toString();

  let tx2;
  // 2. Add liquidity to target pool
  switch (decision.targetPool) {
    case 0: // Soroswap
      tx2 = await clientLobster.add_liquidity_soroswap({
        caller: publicKey,
        amount0: BigInt(balance0),
        amount1: BigInt(balance1),
        amount0_min: BigInt(0),
        amount1_min: BigInt(0),
        deadline_ledger: BigInt(99999999999),
        router_address: process.env.SOROSWAP_ROUTER ?? '',
      });
      break;
    case 1: // Phoenix
      tx2 = await clientLobster.add_liquidity_phoenix({
        caller: publicKey,
        amount0: BigInt(balance0),
        amount1: BigInt(balance1),
        amount0_min: BigInt(0),
        amount1_min: BigInt(0),
        pool_address: poolAddresses.phoenix,
        deadline: BigInt(99999999999),
        slippage: BigInt(500),
      });
      break;
    case 2: // Aquarius
      tx2 = await clientLobster.add_liquidity_aquarius({
        caller: publicKey,
        amount0: BigInt(balance0),
        amount1: BigInt(balance1),
        pool_address: poolAddresses.aquarius,
      });
      break;
  }

  console.log('Sending the add liquidity transaction...');
  let result2 = await tx2?.signAndSend();
  //console.log('result2 =>', JSON.stringify(result2, null, 2));
  console.log('Add liquidity done !');
  await new Promise(resolve => setTimeout(resolve, 1000));
}

async function deposit(
  clientLobster: LobsterClient,
  pool: any,
  dataSoroswap: any,
  dataPhoenix: any,
  dataAquarius: any,
): Promise<{ success: boolean; targetPool: number | null; error?: string }> {
  try {
    // Get APRs from all three DEX
    const aprSoroswap = dataSoroswap.last?.aprList ?? 0;
    const aprPhoenix = dataPhoenix.last?.aprList ?? 0;
    const aprAquarius = dataAquarius.last?.aprList ?? 0;

    // Find the DEX with the highest APR
    const aprs = [
      { pool: 0, apr: aprSoroswap, name: 'Soroswap' },
      { pool: 1, apr: aprPhoenix, name: 'Phoenix' },
      { pool: 2, apr: aprAquarius, name: 'Aquarius' }
    ];

    const bestPool = aprs.reduce((max, current) =>
      current.apr > max.apr ? current : max
    );

    console.log(`No active pool found. Best APR is ${bestPool.name} with ${bestPool.apr}%`);


    // Get token balances
    const balance = await clientLobster.get_amounts_tokens();
    const balance0 = balance._value[0]._value._attributes.lo._value.toString();
    const balance1 = balance._value[1]._value._attributes.lo._value.toString();

    // Check if we have balances to deposit
    if (BigInt(balance0) === 0n && BigInt(balance1) === 0n) {
      return {
        success: false,
        targetPool: bestPool.pool,
        error: 'No token balances available for deposit'
      };
    }

    const secret = process.env.SECRET ?? '';
    const keypair = Keypair.fromSecret(secret);
    const publicKey = keypair.publicKey();

    const poolAddresses = {
      soroswap: dataSoroswap.pooladdress,
      phoenix: dataPhoenix.pooladdress,
      aquarius: dataAquarius.pooladdress
    };
    let tx;
    // Add liquidity to the best pool
    switch (bestPool.pool) {
      case 0: // Soroswap
        tx = await clientLobster.add_liquidity_soroswap({
          caller: publicKey,
          amount0: BigInt(balance0),
          amount1: BigInt(balance1),
          amount0_min: BigInt(0),
          amount1_min: BigInt(0),
          deadline_ledger: BigInt(99999999999),
          router_address: process.env.SOROSWAP_ROUTER ?? '',
        });
        break;
      case 1: // Phoenix
        tx = await clientLobster.add_liquidity_phoenix({
          caller: publicKey,
          amount0: BigInt(balance0),
          amount1: BigInt(balance1),
          amount0_min: BigInt(0),
          amount1_min: BigInt(0),
          pool_address: poolAddresses.phoenix,
          deadline: BigInt(99999999999),
          slippage: BigInt(500),
        });
        break;
      case 2: // Aquarius
        tx = await clientLobster.add_liquidity_aquarius({
          caller: publicKey,
          amount0: BigInt(balance0),
          amount1: BigInt(balance1),
          pool_address: poolAddresses.aquarius,
        });
        break;
      default:
        return {
          success: false,
          targetPool: null,
          error: 'Invalid pool selection'
        };
    }

    console.log(`Sending initial deposit transaction to ${bestPool.name}...`);
    await tx?.signAndSend();
    console.log(`Initial deposit to ${bestPool.name} completed!`);

    return {
      success: true,
      targetPool: bestPool.pool
    };
  } catch (error: any) {
    console.error('Error making initial deposit:', error);
    return {
      success: false,
      targetPool: null,
      error: error.message || 'Unknown error during initial deposit'
    };
  }
}

export async function compareAndDecidePool(
  aprSoroswap: number,
  aprPhoenix: number,
  aprAquarius: number,
  actualPool: number,
  arbitrageFee: number,
  userPositionToken0: number,
  recoveryDay: number
): Promise<PoolDecision> {

  const baseDecision: PoolDecision = {
    shouldChange: false,
    currentPool: actualPool,
    targetPool: null,
  };

  switch (actualPool) {
    case 0: // Current pool is Soroswap
      console.log('Current pool: Soroswap, comparing with Phoenix and Aquarius');

      // Compare Soroswap vs Phoenix
      const shouldChangeToPhoenix = shouldChangePool({
        arbitrageFee,
        userPositionToken0,
        APR_poolTarget: aprPhoenix,
        APR_poolActuelle: aprSoroswap,
        recoveryDay
      });

      // Compare Soroswap vs Aquarius
      const shouldChangeToAquarius = shouldChangePool({
        arbitrageFee,
        userPositionToken0,
        APR_poolTarget: aprAquarius,
        APR_poolActuelle: aprSoroswap,
        recoveryDay
      });

      console.log('Should change to Phoenix?', shouldChangeToPhoenix);
      console.log('Should change to Aquarius?', shouldChangeToAquarius);

      // Determine best option
      if (shouldChangeToPhoenix && shouldChangeToAquarius) {
        const bestPool = aprPhoenix > aprAquarius ? 1 : 2;
        const bestPoolName = aprPhoenix > aprAquarius ? 'Phoenix' : 'Aquarius';
        baseDecision.shouldChange = true;
        baseDecision.targetPool = bestPool;
        console.log('Both options viable, choose higher APR:', bestPoolName);
      } else if (shouldChangeToPhoenix) {
        baseDecision.shouldChange = true;
        baseDecision.targetPool = 1;
        console.log('Recommend changing to Phoenix');
      } else if (shouldChangeToAquarius) {
        baseDecision.shouldChange = true;
        baseDecision.targetPool = 2;
        console.log('Recommend changing to Aquarius');
      } else {
        console.log('Stay with Soroswap');
      }
      break;

    case 1: // Current pool is Phoenix
      console.log('Current pool: Phoenix, comparing with Soroswap and Aquarius');

      // Compare Phoenix vs Soroswap
      const shouldChangeToSoroswapFromPhoenix = shouldChangePool({
        arbitrageFee,
        userPositionToken0,
        APR_poolTarget: aprSoroswap,
        APR_poolActuelle: aprPhoenix,
        recoveryDay
      });

      // Compare Phoenix vs Aquarius
      const shouldChangeToAquariusFromPhoenix = shouldChangePool({
        arbitrageFee,
        userPositionToken0,
        APR_poolTarget: aprAquarius,
        APR_poolActuelle: aprPhoenix,
        recoveryDay
      });

      console.log('Should change to Soroswap?', shouldChangeToSoroswapFromPhoenix);
      console.log('Should change to Aquarius?', shouldChangeToAquariusFromPhoenix);

      if (shouldChangeToSoroswapFromPhoenix && shouldChangeToAquariusFromPhoenix) {
        const bestPool = aprSoroswap > aprAquarius ? 0 : 2;
        const bestPoolName = aprSoroswap > aprAquarius ? 'Soroswap' : 'Aquarius';
        baseDecision.shouldChange = true;
        baseDecision.targetPool = bestPool;
        console.log('Both options viable, choose higher APR:', bestPoolName);
      } else if (shouldChangeToSoroswapFromPhoenix) {
        baseDecision.shouldChange = true;
        baseDecision.targetPool = 0;
        console.log('Recommend changing to Soroswap');
      } else if (shouldChangeToAquariusFromPhoenix) {
        baseDecision.shouldChange = true;
        baseDecision.targetPool = 2;
        console.log('Recommend changing to Aquarius');
      } else {
        console.log('Stay with Phoenix');
      }
      break;

    case 2: // Current pool is Aquarius
      console.log('Current pool: Aquarius, comparing with Soroswap and Phoenix');

      // Compare Aquarius vs Soroswap
      const shouldChangeToSoroswapFromAquarius = shouldChangePool({
        arbitrageFee,
        userPositionToken0,
        APR_poolTarget: aprSoroswap,
        APR_poolActuelle: aprAquarius,
        recoveryDay
      });

      // Compare Aquarius vs Phoenix
      const shouldChangeToPhoenixFromAquarius = shouldChangePool({
        arbitrageFee,
        userPositionToken0,
        APR_poolTarget: aprPhoenix,
        APR_poolActuelle: aprAquarius,
        recoveryDay
      });

      console.log('Should change to Soroswap?', shouldChangeToSoroswapFromAquarius);
      console.log('Should change to Phoenix?', shouldChangeToPhoenixFromAquarius);

      if (shouldChangeToSoroswapFromAquarius && shouldChangeToPhoenixFromAquarius) {
        const bestPool = aprSoroswap > aprPhoenix ? 0 : 1;
        const bestPoolName = aprSoroswap > aprPhoenix ? 'Soroswap' : 'Phoenix';
        baseDecision.shouldChange = true;
        baseDecision.targetPool = bestPool;
        console.log('Both options viable, choose higher APR:', bestPoolName);
      } else if (shouldChangeToSoroswapFromAquarius) {
        baseDecision.shouldChange = true;
        baseDecision.targetPool = 0;
        console.log('Recommend changing to Soroswap');
      } else if (shouldChangeToPhoenixFromAquarius) {
        baseDecision.shouldChange = true;
        baseDecision.targetPool = 1;
        console.log('Recommend changing to Phoenix');
      } else {
        console.log('Stay with Aquarius');
      }
      break;

    default:
      console.log('Unknown actualPool value:', actualPool);
  }

  return baseDecision;
}


async function analyzeSinglePool(
  pool: any,
  poolId?: number,
): Promise<PoolAnalysisResult | null> {
  const secret = process.env.SECRET ?? '';
  if (!secret) {
    throw new Error('SECRET is required in environment');
  }

  try {
    const clientLobster = new LobsterClient(secret, pool.lobster_address);
    const actualPool = await clientLobster.get_active_protocol();


    const dataSoroswap = await getDataLast(pool.token0, pool.token1, "soroswap");
    const dataPhoenix = await getDataLast(pool.token0, pool.token1, "phoenix");
    const dataAquarius = await getDataLast(pool.token0, pool.token1, "aquarius");


    // If the pool is not active, deposit the tokens into the pool
    if (actualPool == 5) {
      const depositResult = await deposit(
        clientLobster,
        pool,
        dataSoroswap,
        dataPhoenix,
        dataAquarius,
      );

      const result: PoolAnalysisResult = {
        poolId,
        lobsterAddress: pool.lobster_address,
        token0: pool.token0,
        token1: pool.token1,
        user: pool.user,
        currentPool: actualPool,
        newPool: depositResult.targetPool,
        error: depositResult.success ? "null" : depositResult.error || "null",
      };

      return result;
    }

    const poolAddresses = {
      soroswap: dataSoroswap.pooladdress,
      phoenix: dataPhoenix.pooladdress,
      aquarius: dataAquarius.pooladdress
    };

    let balanceResult;
    let balanceInToken0;
    let balanceInToken1;

    switch (actualPool) {
      case 0:
        balanceResult = await clientLobster.get_amounts_from_soroswap({
          pool_address: dataSoroswap.pooladdress
        });
        balanceInToken0 = balanceResult._value[0]._value._attributes.lo._value.toString();
        balanceInToken1 = balanceResult._value[1]._value._attributes.lo._value.toString();
        break;
      case 1:
        balanceResult = await clientLobster.get_amounts_from_phoenix({
          pool_address: dataPhoenix.pooladdress
        });
        balanceInToken0 = balanceResult._value[0]._value._attributes.lo._value.toString();
        balanceInToken1 = balanceResult._value[1]._value._attributes.lo._value.toString();
        break;
      case 2:
        balanceResult = await clientLobster.get_amounts_from_aquarius({
          pool_address: dataAquarius.pooladdress
        });
        balanceInToken0 = balanceResult._value[0]._value._attributes.lo._value.toString();
        balanceInToken1 = balanceResult._value[1]._value._attributes.lo._value.toString();
        break;
      default:
        console.error('Unknown actualPool value:', actualPool);
        return null;
    }

    let get_price_token0: any = await getTokenPriceUSD(
      pool.token0,
      (process.env.NETWORK as 'mainnet' | 'testnet') ?? "mainnet"
    );
    let priceToken0 = get_price_token0[0]?.price ?? 0;

    let clientTokens = new TokenClient(secret, pool.token0);
    let query_decimals = await clientTokens.decimals();
    let decimal = query_decimals._value;

    if (priceToken0 == null) {
      get_price_token0 = await getTokenPriceUSD(
        pool.token0,
        (process.env.NETWORK as 'mainnet' | 'testnet') ?? "mainnet"
      );
      priceToken0 = get_price_token0[0]?.price ?? 0;
      clientTokens = new TokenClient(secret, pool.token0);
      query_decimals = await clientTokens.decimals();
      decimal = query_decimals._value;
    }

    const value_position_token0 = priceToken0 * (parseFloat(balanceInToken0) / 10 ** decimal) * 2;

    const decision = await compareAndDecidePool(
      dataSoroswap.last.aprList,
      dataPhoenix.last.aprList,
      dataAquarius.last.aprList,
      actualPool,
      0.1, // arbitrageFee
      value_position_token0,
      1 // recoveryDay
    );

    // Execute migration if requested and decision says to change
    if (decision.shouldChange) {
      try {
        await executePoolMigration(
          clientLobster,
          decision,
          actualPool,
          poolAddresses
        );

      } catch (error: any) {
        console.error('Error executing pool migration:', error);

      }
    }

    const result: PoolAnalysisResult = {
      poolId,
      lobsterAddress: pool.lobster_address,
      token0: pool.token0,
      token1: pool.token1,
      user: pool.user,
      currentPool: actualPool,
      newPool: decision.targetPool,
      error: "null",
    };

    return result;
  } catch (error: any) {
    console.error(`Error analyzing pool ${pool.lobster_address}:`, error);
    return {
      poolId,
      lobsterAddress: pool.lobster_address,
      token0: pool.token0,
      token1: pool.token1,
      user: pool.user,
      currentPool: -1,
      newPool: -1,
      error: error.message || 'Unknown error'
    };
  }
}

export async function analyzePool(
  params: AnalyzePoolParams,
): Promise<PoolAnalysisResult[]> {
  const secret = process.env.SECRET ?? '';
  if (!secret) {
    throw new Error('SECRET is required in environment');
  }

  const client = new FactoryClient(secret);
  let pools: any[] = [];

  if (params.type === 'all') {
    const poolCount = await client.get_pool_count();
    for (let i = 1n; i <= poolCount; i++) {
      const pool = await client.get_pool_by_id(BigInt(i));
      pools.push({ ...pool, poolId: Number(i) });
    }
  } else if (params.type === 'user') {
    const userPools = await client.get_pools_by_user(params.userAddress);
    pools = Array.isArray(userPools) ? userPools : [];
  } else if (params.type === 'poolId') {
    const pool = await client.get_pool_by_id(BigInt(params.poolId));
    pools = [{ ...pool, poolId: params.poolId }];
  }

  const results: PoolAnalysisResult[] = [];
  for (const pool of pools) {
    const result = await analyzeSinglePool(pool, pool.poolId);
    if (result) {
      results.push(result);
    }
  }

  return results;
}
