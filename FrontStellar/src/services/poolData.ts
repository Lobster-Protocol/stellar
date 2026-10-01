import { Client as LobsterContract, networks as lobsterNetworks } from '../../bindings/lobster';
import { Client as FactoryContract, networks as factoryNetworks } from '../../bindings/factory';
import { Client as TokenContract } from '../../bindings/token';
import { Keypair } from '@stellar/stellar-sdk';

const runtimeEnv = (import.meta as { env?: Record<string, string> }).env ?? {};
const NETWORK = (runtimeEnv.VITE_NETWORK ?? 'testnet') as 'mainnet' | 'testnet';

const isMainnet = NETWORK === 'mainnet';
const FACTORY_CONTRACT_ID = runtimeEnv.VITE_FACTORY_CONTRACT ?? (
  isMainnet ? factoryNetworks.public.contractId : factoryNetworks.testnet.contractId
);
const FACTORY_NETWORK_PASSPHRASE = runtimeEnv.VITE_FACTORY_NETWORK ?? (
  isMainnet ? factoryNetworks.public.networkPassphrase : factoryNetworks.testnet.networkPassphrase
);
const FACTORY_RPC_URL = runtimeEnv.VITE_FACTORY_RPC ?? (
  isMainnet ? 'https://soroban-rpc.creit.tech' : 'https://soroban-testnet.stellar.org'
);

const LOBSTER_NETWORK_PASSPHRASE = runtimeEnv.VITE_FACTORY_NETWORK ?? (
  isMainnet ? lobsterNetworks.public.networkPassphrase : lobsterNetworks.testnet.networkPassphrase
);
const LOBSTER_RPC_URL = runtimeEnv.VITE_FACTORY_RPC ?? (
  isMainnet ? 'https://soroban-rpc.creit.tech' : 'https://soroban-testnet.stellar.org'
);

const DEFAULT_TOKEN_DECIMALS = 7;
const tokenDecimalsCache = new Map<string, number>();

async function fetchTokenDecimals(tokenAddress: string): Promise<number> {
  if (!tokenAddress || tokenAddress.toLowerCase() === 'native') {
    return DEFAULT_TOKEN_DECIMALS;
  }

  if (tokenDecimalsCache.has(tokenAddress)) {
    return tokenDecimalsCache.get(tokenAddress)!;
  }

  try {
    const dummyKeypair = Keypair.random();
    const client = new TokenContract({
      contractId: tokenAddress,
      rpcUrl: LOBSTER_RPC_URL,
      networkPassphrase: LOBSTER_NETWORK_PASSPHRASE,
      publicKey: dummyKeypair.publicKey(),
      signTransaction: async (txXdr: string) => ({
        signedTxXdr: txXdr,
        signerAddress: dummyKeypair.publicKey(),
      }),
    });

    const decimalsTx = await client.decimals({ simulate: true });
    const decimalsResult = decimalsTx.result;
    const decimalsValue = Number(
      typeof decimalsResult === 'object' && decimalsResult !== null && 'toString' in decimalsResult
        ? (decimalsResult as any).toString()
        : decimalsResult ?? DEFAULT_TOKEN_DECIMALS,
    );
    const normalized = Number.isFinite(decimalsValue) ? decimalsValue : DEFAULT_TOKEN_DECIMALS;
    tokenDecimalsCache.set(tokenAddress, normalized);
    return normalized;
  } catch (error) {
    console.error(`Failed to fetch decimals for token ${tokenAddress}:`, error);
    tokenDecimalsCache.set(tokenAddress, DEFAULT_TOKEN_DECIMALS);
    return DEFAULT_TOKEN_DECIMALS;
  }
}

type Protocol = 'soroswap' | 'phoenix' | 'aquarius';

export interface PoolData {
  lobsterAddress: string;
  owner: string;
  token0: string;
  token1: string;
  token0Decimals: number;
  token1Decimals: number;
  protocol: Protocol | null;
  actualPool: string | null;
  lpAmount: string | null;
  amounts: [string, string] | null; // [amount0, amount1] - locked in DEX pool
  amountsTokens: [string, string] | null; // [amount0, amount1] - available in contract (not in DEX)
}

function createFactoryClient(
  walletAddress: string,
  signTransaction: (txXdr: string, networkPassphrase: string) => Promise<string>
): FactoryContract {
  return new FactoryContract({
    contractId: FACTORY_CONTRACT_ID,
    networkPassphrase: FACTORY_NETWORK_PASSPHRASE,
    rpcUrl: FACTORY_RPC_URL,
    publicKey: walletAddress,
    signTransaction: async (txXdr: string) => {
      const signed = await signTransaction(txXdr, FACTORY_NETWORK_PASSPHRASE);
      return {
        signedTxXdr: signed,
        signerAddress: walletAddress,
      };
    },
  });
}

function createLobsterClient(
  lobsterAddress: string,
  walletAddress: string,
  signTransaction: (txXdr: string, networkPassphrase: string) => Promise<string>
): LobsterContract {
  return new LobsterContract({
    contractId: lobsterAddress,
    networkPassphrase: LOBSTER_NETWORK_PASSPHRASE,
    rpcUrl: LOBSTER_RPC_URL,
    publicKey: walletAddress,
    signTransaction: async (txXdr: string) => {
      const signed = await signTransaction(txXdr, LOBSTER_NETWORK_PASSPHRASE);
      return {
        signedTxXdr: signed,
        signerAddress: walletAddress,
      };
    },
  });
}

function protocolFromNumber(protocolNum: bigint | number | string | null | undefined): Protocol | null {
  if (protocolNum === null || protocolNum === undefined) return null;
  const num = typeof protocolNum === 'bigint' ? Number(protocolNum) : Number(protocolNum);
  if (num === 0) return 'soroswap';
  if (num === 1) return 'phoenix';
  if (num === 2) return 'aquarius';
  if (num === 5) return null; // Protocol 5 = No active position (scanning for best pool)
  return null;
}

export async function fetchUserPools(
  userAddress: string,
  signTransaction: (txXdr: string, networkPassphrase: string) => Promise<string>
): Promise<PoolData[]> {
  const factoryClient = createFactoryClient(userAddress, signTransaction);

  console.log('[factory] get_pools_by_user', {
    userAddress,
    contractId: FACTORY_CONTRACT_ID,
    rpcUrl: FACTORY_RPC_URL,
    networkPassphrase: FACTORY_NETWORK_PASSPHRASE,
  });
  const poolsTx = await factoryClient.get_pools_by_user({ user: userAddress });
  const poolsSim = await poolsTx.simulate();
  const pools = (poolsSim.result as any) || [];
  console.log('[factory] get_pools_by_user result', { count: Array.isArray(pools) ? pools.length : 0, raw: poolsSim });

  if (!Array.isArray(pools) || pools.length === 0) {
    return [];
  }

  async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 500
  ): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxRetries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt)));
      }
    }
    throw new Error('Max retries exceeded');
  }

  const poolDataPromises = pools.map(async (pool: any) => {
    const lobsterAddress = pool.lobster_address;
    const lobsterClient = createLobsterClient(lobsterAddress, userAddress, signTransaction);
    console.log('[lobster] Start pool scan', { lobsterAddress, owner: pool.owner });

    try {
      const [token0, token1, protocolNum, actualPool] = await retryWithBackoff(async () => {
        console.log('[lobster] get_token0/get_token1/get_active_protocol/get_actual_pool', { lobsterAddress });
        const [token0Tx, token1Tx, protocolTx, actualPoolTx] = await Promise.all([
          lobsterClient.get_token0(),
          lobsterClient.get_token1(),
          lobsterClient.get_active_protocol(),
          lobsterClient.get_actual_pool(),
        ]);

        const [token0Sim, token1Sim, protocolSim, actualPoolSim] = await Promise.all([
          token0Tx.simulate(),
          token1Tx.simulate(),
          protocolTx.simulate(),
          actualPoolTx.simulate(),
        ]);

        return [
          (token0Sim.result as any)?.toString() || '',
          (token1Sim.result as any)?.toString() || '',
          protocolSim.result as any,
          (actualPoolSim.result as any)?.toString() || null,
        ];
      });

      const protocol = protocolFromNumber(protocolNum);
      console.log('[lobster] basic info', {
        lobsterAddress,
        token0,
        token1,
        protocolNum,
        protocol,
        actualPool,
      });
      const [token0Decimals, token1Decimals] = await Promise.all([
        fetchTokenDecimals(token0),
        fetchTokenDecimals(token1),
      ]);

      let lpAmount: string | null = null;
      let amounts: [string, string] | null = null; // Locked in DEX
      let amountsTokens: [string, string] | null = null; // Available in contract

      try {
        amountsTokens = await retryWithBackoff(async () => {
          console.log('[lobster] get_amounts_tokens', { lobsterAddress });
          const amountsTokensTx = await lobsterClient.get_amounts_tokens();
          const amountsTokensSim = await amountsTokensTx.simulate();
          const amountsTokensResult = amountsTokensSim.result as any;
          if (amountsTokensResult && Array.isArray(amountsTokensResult) && amountsTokensResult.length >= 2) {
            return [amountsTokensResult[0]?.toString() || '0', amountsTokensResult[1]?.toString() || '0'];
          }
          return ['0', '0'];
        });
      } catch (error) {
        console.error(`Error fetching amounts_tokens for pool ${lobsterAddress}:`, error);
        amountsTokens = ['0', '0'];
      }

      if (protocol && actualPool) {
        try {
          if (protocol === 'soroswap') {
            const [lp, dexAmounts] = await Promise.all([
              retryWithBackoff(async () => {
                console.log('[lobster] get_lp_soroswap', { lobsterAddress, pool: actualPool });
                const lpTx = await lobsterClient.get_lp_soroswap({ pool_address: actualPool });
                const lpSim = await lpTx.simulate();
                return (lpSim.result as any)?.toString() || null;
              }).catch(() => null),
              retryWithBackoff(async () => {
                console.log('[lobster] get_amounts_from_soroswap', { lobsterAddress, pool: actualPool });
                const amountsTx = await lobsterClient.get_amounts_from_soroswap({ pool_address: actualPool });
                const amountsSim = await amountsTx.simulate();
                const amountsResult = amountsSim.result as any;
                if (amountsResult && Array.isArray(amountsResult) && amountsResult.length >= 2) {
                  return [amountsResult[0]?.toString() || '0', amountsResult[1]?.toString() || '0'];
                }
                return ['0', '0'];
              }).catch(() => ['0', '0']),
            ]);
            lpAmount = lp;
            amounts = dexAmounts as [string, string];
          } else if (protocol === 'phoenix') {
            const [lp, dexAmounts] = await Promise.all([
              retryWithBackoff(async () => {
                console.log('[lobster] get_lp_phoenix', { lobsterAddress, pool: actualPool });
                const lpTx = await lobsterClient.get_lp_phoenix({ pool_address: actualPool });
                const lpSim = await lpTx.simulate();
                const lpResult = lpSim.result as any;
                if (lpResult && Array.isArray(lpResult) && lpResult.length >= 1) {
                  return lpResult[0]?.toString() || null;
                }
                return null;
              }).catch(() => null),
              retryWithBackoff(async () => {
                console.log('[lobster] get_amounts_from_phoenix', { lobsterAddress, pool: actualPool });
                const amountsTx = await lobsterClient.get_amounts_from_phoenix({ pool_address: actualPool });
                const amountsSim = await amountsTx.simulate();
                const amountsResult = amountsSim.result as any;
                if (amountsResult && Array.isArray(amountsResult) && amountsResult.length >= 2) {
                  return [amountsResult[0]?.toString() || '0', amountsResult[1]?.toString() || '0'];
                }
                return ['0', '0'];
              }).catch(() => ['0', '0']),
            ]);
            lpAmount = lp;
            amounts = dexAmounts as [string, string];
          } else if (protocol === 'aquarius') {
            const [lp, dexAmounts] = await Promise.all([
              retryWithBackoff(async () => {
                console.log('[lobster] get_lp_aquarius', { lobsterAddress, pool: actualPool });
                const lpTx = await lobsterClient.get_lp_aquarius({ pool_address: actualPool });
                const lpSim = await lpTx.simulate();
                const lpResult = lpSim.result as any;
                if (lpResult && Array.isArray(lpResult) && lpResult.length >= 1) {
                  return lpResult[0]?.toString() || null;
                }
                return null;
              }).catch(() => null),
              retryWithBackoff(async () => {
                console.log('[lobster] get_amounts_from_aquarius', { lobsterAddress, pool: actualPool });
                const amountsTx = await lobsterClient.get_amounts_from_aquarius({ pool_address: actualPool });
                const amountsSim = await amountsTx.simulate();
                const amountsResult = amountsSim.result as any;
                if (amountsResult && Array.isArray(amountsResult) && amountsResult.length >= 2) {
                  return [amountsResult[0]?.toString() || '0', amountsResult[1]?.toString() || '0'];
                }
                return ['0', '0'];
              }).catch(() => ['0', '0']),
            ]);
            lpAmount = lp;
            amounts = dexAmounts as [string, string];
          }
        } catch (error) {
          console.error(`Error fetching LP/amounts for pool ${lobsterAddress}:`, error);
        }
      }

      return {
        lobsterAddress,
        owner: pool.owner || userAddress,
        token0,
        token1,
        protocol,
        actualPool,
        lpAmount,
        amounts,
        amountsTokens,
        token0Decimals,
        token1Decimals,
      } as PoolData;
    } catch (error) {
      console.error(`Error fetching data for pool ${lobsterAddress}:`, error);
      // Return basic data even if detailed fetch fails
      return {
        lobsterAddress,
        owner: pool.owner || userAddress,
        token0: pool.token0 || '',
        token1: pool.token1 || '',
        protocol: null,
        actualPool: null,
        lpAmount: null,
        amounts: null,
        amountsTokens: null,
        token0Decimals: DEFAULT_TOKEN_DECIMALS,
        token1Decimals: DEFAULT_TOKEN_DECIMALS,
      } as PoolData;
    }
  });

  return Promise.all(poolDataPromises);
}

