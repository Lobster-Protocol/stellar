import { FactoryClient } from '../../../bindings/factoryClient.js';
import { LobsterClient } from '../../../bindings/lobsterClient.js';
import { TokenClient } from '../../../bindings/tokenClient.js';
import { Keypair } from '@stellar/stellar-sdk';

import {
  deposit as multisigDeposit,
  executePoolMigration as multisigExecutePoolMigration,
  type PoolOperationConfig,
  type SignerConfig,
} from '../operations/poolOperations.js';



import {
  getTokenPriceUSD,
  getDataLast,
  compareAndDecidePool,
  type PoolDecision,
} from './poolAnalyzer.js';

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

function secretToHex(secret: string): string {
  const isHexSeed = /^[0-9a-fA-F]{64}$/;
  if (isHexSeed.test(secret)) {
    return secret.toLowerCase();
  }
  if (secret.startsWith('S')) {
    return Buffer.from(Keypair.fromSecret(secret).rawSecretKey()).toString('hex');
  }
  throw new Error(
    'Signer secrets must be 32-byte hex or a Stellar secret starting with "S"'
  );
}

function resolvePoolOperationConfigFromEnv(): PoolOperationConfig {
  const feepayerSecret =
    process.env.FEEPAYER_SECRET ?? process.env.SECRET ?? '';

  if (!feepayerSecret) {
    throw new Error(
      'Set FEEPAYER_SECRET (or SECRET) before using the multisig analyzer'
    );
  }

  const mode = (process.env.MULTISIG_MODE ?? 'single').toLowerCase();
  const localSecrets = (process.env.MULTISIG_SIGNER_SECRETS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const apiUrls = (process.env.MULTISIG_SIGNER_APIS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (mode === 'multisig-external' || mode === 'external') {
    const signers: SignerConfig[] = [];

    for (const rawSecret of localSecrets) {
      signers.push({ secretKeyHex: secretToHex(rawSecret) });
    }
    for (const apiUrl of apiUrls) {
      signers.push({ apiUrl });
    }

    if (!signers.length) {
      throw new Error(
        'MULTISIG_MODE=external requires MULTISIG_SIGNER_SECRETS and/or MULTISIG_SIGNER_APIS'
      );
    }

    return {
      mode: 'multisig-external',
      secret: feepayerSecret,
      signers,
    };
  }

  if (mode === 'multisig-local' || mode === 'local') {
    if (!localSecrets.length) {
      throw new Error(
        'MULTISIG_MODE=local requires MULTISIG_SIGNER_SECRETS (comma-separated S-keys or hex seeds)'
      );
    }
    return {
      mode: 'multisig-local',
      secret: feepayerSecret,
      signerSecrets: localSecrets,
    };
  }

  return { mode: 'single', secret: feepayerSecret };
}

async function analyzeSinglePoolWithMultisig(
  pool: any,
  poolId: number | undefined,
  opConfig: PoolOperationConfig
): Promise<PoolAnalysisResult | null> {
  const clientLobster = new LobsterClient(opConfig.secret, pool.lobster_address);
  const actualPoolBigInt = await clientLobster.get_active_protocol();
  const actualPool = Number(actualPoolBigInt);
  const dataSoroswap = await getDataLast(pool.token0, pool.token1, 'soroswap');
  const dataPhoenix = await getDataLast(pool.token0, pool.token1, 'phoenix');
  const dataAquarius = await getDataLast(pool.token0, pool.token1, 'aquarius');
  
  console.log('Lobster ID =>', pool.lobster_address);


  const poolAddresses = {
    soroswap: dataSoroswap.pooladdress,
    phoenix: dataPhoenix.pooladdress,
    aquarius: dataAquarius.pooladdress,
  };

  if (actualPool === 5) {
    const depositResult = await multisigDeposit(
      opConfig,
      clientLobster,
      pool.lobster_address,
      dataSoroswap,
      dataPhoenix,
      dataAquarius
    );

    return {
      poolId,
      lobsterAddress: pool.lobster_address,
      token0: pool.token0,
      token1: pool.token1,
      user: pool.user,
      currentPool: actualPool,
      newPool: depositResult.targetPool,
      error: depositResult.success ? 'null' : depositResult.error ?? 'null',
    };
  }

  let balanceResult;
  let balanceInToken0: string;
  let balanceInToken1: string;


  switch (actualPool) {
    case 0:
      balanceResult = await clientLobster.get_amounts_from_soroswap({
        pool_address: dataSoroswap.pooladdress,
      });
      break;
    case 1:
      balanceResult = await clientLobster.get_amounts_from_phoenix({
        pool_address: dataPhoenix.pooladdress,
      });
      break;
    case 2:
      balanceResult = await clientLobster.get_amounts_from_aquarius({
        pool_address: dataAquarius.pooladdress,
      });
      break;
    default:
      console.error('Unknown actualPool value:', actualPool);
      return null;
  }
  

  balanceInToken0 =
    balanceResult._value[0]._value._attributes.lo._value.toString();
  balanceInToken1 =
    balanceResult._value[1]._value._attributes.lo._value.toString();



  const tokenPriceData =
    (await getTokenPriceUSD(
      pool.token0,
      (process.env.NETWORK as 'mainnet' | 'testnet') ?? 'mainnet'
    )) as any;

  let priceToken0 = tokenPriceData[0]?.price ?? 0;

  let clientTokens = new TokenClient(opConfig.secret, pool.token0);
  let queryDecimals = await clientTokens.decimals();
  let decimals = queryDecimals._value;

  if (priceToken0 == null) {
    const fallback = await getTokenPriceUSD(
      pool.token0,
      (process.env.NETWORK as 'mainnet' | 'testnet') ?? 'mainnet'
    ) as any;
    priceToken0 = Array.isArray(fallback) ? fallback[0]?.price ?? 0 : 0;
    clientTokens = new TokenClient(opConfig.secret, pool.token0);
    queryDecimals = await clientTokens.decimals();
    decimals = queryDecimals._value;
  }

  const valuePositionToken0 =
    priceToken0 * (parseFloat(balanceInToken0) / 10 ** decimals) * 2;

  const decision: PoolDecision = await compareAndDecidePool(
    dataSoroswap.last.aprList,
    dataPhoenix.last.aprList,
    dataAquarius.last.aprList,
    actualPool,
    0.1,
    valuePositionToken0,
    1
  );

  if (decision.shouldChange && decision.targetPool !== null) {
    try {
      await multisigExecutePoolMigration(
        opConfig,
        clientLobster,
        pool.lobster_address,
        decision,
        poolAddresses
      );
    } catch (error) {
      console.error('Error executing multisig pool migration:', error);
    }
  }

  return {
    poolId,
    lobsterAddress: pool.lobster_address,
    token0: pool.token0,
    token1: pool.token1,
    user: pool.user,
    currentPool: actualPool,
    newPool: decision.targetPool,
    error: 'null',
  };
}

export async function analyzePoolWithMultisig(
  params: AnalyzePoolParams,
  overrideConfig?: PoolOperationConfig
): Promise<PoolAnalysisResult[]> {
  const opConfig = overrideConfig ?? resolvePoolOperationConfigFromEnv();
  const client = new FactoryClient(opConfig.secret, process.env.FACTORY_ID ?? '');

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
    try {        
      const result = await analyzeSinglePoolWithMultisig(
        pool,
        pool.poolId,
        opConfig
      );
      if (result) {
        results.push(result);
      }
    } catch (error) {
      console.error(`Error analyzing pool ${pool.lobster_address}:`, error);
      results.push({
        poolId: pool.poolId,
        lobsterAddress: pool.lobster_address,
        token0: pool.token0,
        token1: pool.token1,
        user: pool.user,
        currentPool: -1,
        newPool: null,
        error:
          error instanceof Error ? error.message : 'Unknown error during multisig analysis',
      });
    }
  }

  return results;
}