import { FactoryClient } from '../bindings/factoryClient';
import { LobsterClient } from '../bindings/lobsterClient';
import { TokenClient } from '../bindings/tokenClient';
import { compareAndDecidePool, executePoolMigration } from './testFactory';

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
  balanceInToken0: string;
  balanceInToken1: string;
  valuePositionToken0: number;
  aprSoroswap: number;
  aprPhoenix: number;
  aprAquarius: number;
  decision: {
    shouldChange: boolean;
    currentPool: number;
    targetPool: number | null;
  };
  poolAddresses: {
    soroswap: string;
    phoenix: string;
    aquarius: string;
  };
  error?: string;
  execution?: {
    executed: boolean;
    success?: boolean;
    error?: string;
  };
};

async function getTokenPriceUSD(
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

async function getDataLast(token0: string, token1: string, protocol: string): Promise<any> {
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

async function analyzeSinglePool(
  pool: any,
  poolId?: number,
  execute: boolean = false
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

    const result: PoolAnalysisResult = {
      poolId,
      lobsterAddress: pool.lobster_address,
      token0: pool.token0,
      token1: pool.token1,
      user: pool.user,
      currentPool: actualPool,
      balanceInToken0,
      balanceInToken1,
      valuePositionToken0: value_position_token0,
      aprSoroswap: dataSoroswap.last.aprList,
      aprPhoenix: dataPhoenix.last.aprList,
      aprAquarius: dataAquarius.last.aprList,
      decision,
      poolAddresses
    };

    // Execute migration if requested and decision says to change
    if (execute && decision.shouldChange) {
      try {
        await executePoolMigration(
          clientLobster,
          decision,
          actualPool,
          poolAddresses
        );
        result.execution = {
          executed: true,
          success: true
        };
      } catch (error: any) {
        console.error('Error executing pool migration:', error);
        result.execution = {
          executed: true,
          success: false,
          error: error.message || 'Unknown error during migration'
        };
      }
    } else if (execute) {
      result.execution = {
        executed: false,
        success: true
      };
    }

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
      balanceInToken0: '0',
      balanceInToken1: '0',
      valuePositionToken0: 0,
      aprSoroswap: 0,
      aprPhoenix: 0,
      aprAquarius: 0,
      decision: {
        shouldChange: false,
        currentPool: -1,
        targetPool: null
      },
      poolAddresses: {
        soroswap: '',
        phoenix: '',
        aquarius: ''
      },
      error: error.message || 'Unknown error'
    };
  }
}

export async function analyzePool(
  params: AnalyzePoolParams,
  execute: boolean = false
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
    const result = await analyzeSinglePool(pool, pool.poolId, execute);
    if (result) {
      results.push(result);
    }
  }

  return results;
}
