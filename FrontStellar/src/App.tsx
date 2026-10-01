import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import './App.css';
import logoWithText from './assets/Logo lobster noir + police.png';
import { fetchUserPools } from './services/poolData';
import type { PoolData } from './services/poolData';
import type { Pool, Protocol, Strategy } from './types/pool';
import { WalletButton } from './components/WalletButton';
import { TokenSelector } from './components/TokenSelector';
import { useWallet } from './contexts/WalletContext';
import { Client as FactoryContract, networks as factoryNetworks } from '../bindings/factory';
import { Client as LobsterContract } from '../bindings/lobster';
import { Client as TokenContract } from '../bindings/token';

type Toast = { message: string; tone: 'success' | 'error' };

const protocolLabels: Record<Protocol, string> = {
  soroswap: 'Soroswap',
  phoenix: 'Phoenix',
  aquarius: 'Aquarius',
};

const getProtocolColor = (protocol: Protocol | null): string => {
  if (!protocol) return '#10b981'; // Green for scanning
  switch (protocol) {
    case 'aquarius':
      return '#9333ea'; // Purple
    case 'phoenix':
      return '#f97316'; // Orange
    case 'soroswap':
      return '#3b82f6'; // Blue
    default:
      return 'var(--color-text-primary)';
  }
};

const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(Math.round(value));
const formatTokenAddress = (address: string): string => {
  if (!address || address.length < 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};
const formatTokenAmountDisplay = (value: number) => {
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 6,
    useGrouping: true,
  }).format(value);
  // Replace thousand separators (commas) with spaces, keep dot as decimal separator
  return formatted.replace(/,/g, ' ');
};

const DEFAULT_TOKEN_DECIMALS = 7;

const scaleAmountByDecimals = (
  rawValue: string | number | bigint | null | undefined,
  decimals: number = DEFAULT_TOKEN_DECIMALS,
): number => {
  if (rawValue === null || rawValue === undefined) return 0;
  try {
    const rawBig = typeof rawValue === 'bigint' ? rawValue : BigInt(rawValue.toString());
    if (decimals <= 0) {
      return Number(rawBig);
    }
    const divisor = BigInt(10) ** BigInt(decimals);
    const integerPart = rawBig / divisor;
    const fractionPart = rawBig % divisor;
    const integerNumber = Number(integerPart);
    const fractionNumber = Number(fractionPart) / Number(divisor);
    return integerNumber + fractionNumber;
  } catch (error) {
    console.error('Failed to scale token amount', error);
    const fallback = Number(rawValue);
    return Number.isFinite(fallback) ? fallback : 0;
  }
};

const scaleAmountToRaw = (humanValue: number, decimals: number = DEFAULT_TOKEN_DECIMALS): bigint => {
  if (humanValue === 0 || !Number.isFinite(humanValue)) return 0n;
  try {
    const multiplier = BigInt(10) ** BigInt(decimals);
    // Convert to string to preserve precision, then multiply
    const valueStr = humanValue.toString();
    const [integerPart, fractionPart = ''] = valueStr.split('.');
    const fractionPadded = fractionPart.padEnd(decimals, '0').slice(0, decimals);
    const fullInteger = BigInt(integerPart) * multiplier + BigInt(fractionPadded || '0');
    return fullInteger;
  } catch (error) {
    console.error('Failed to scale amount to raw', error);
    return 0n;
  }
};

const toRawAmount = (humanAmount: number, decimals: number = DEFAULT_TOKEN_DECIMALS): bigint => {
  if (!Number.isFinite(humanAmount) || humanAmount <= 0) return BigInt(0);
  const scaled = BigInt(Math.round(humanAmount * 10 ** Math.min(decimals, 9)));
  const factor = BigInt(10 ** Math.min(decimals, 9));
  const multiplier = BigInt(10) ** BigInt(decimals) / factor;
  return scaled * multiplier;
};

const isNativeToken = (tokenAddress: string | undefined | null) =>
  !tokenAddress || tokenAddress.toLowerCase() === 'native';

async function fetchWalletTokenBalance(
  tokenAddress: string,
  accountAddress: string,
  decimals: number,
): Promise<number> {
  if (isNativeToken(tokenAddress)) {
    return 0;
  }

  try {
    console.log('[walletBalance] Fetching balance', {
      tokenAddress,
      accountAddress,
      decimals,
      rpcUrl: FACTORY_RPC_URL,
      networkPassphrase: FACTORY_NETWORK_PASSPHRASE,
    });
    const client = getTokenReadClient(tokenAddress, accountAddress);
    const balanceTx = await client.balance({ id: accountAddress });
    console.log('[walletBalance] Simulating balance transaction', { tokenAddress, accountAddress });
    const balanceSim = await balanceTx.simulate();
    const rawBalance = balanceSim.result as any;
    const rawString =
      typeof rawBalance === 'object' && rawBalance !== null && 'toString' in rawBalance
        ? (rawBalance as any).toString()
        : rawBalance?.toString?.() ?? '0';
    const scaled = scaleAmountByDecimals(rawString, decimals);
    console.log('[walletBalance] Balance result', {
      tokenAddress,
      accountAddress,
      rawBalance: rawString,
      scaled,
    });
    return scaled;
  } catch (error) {
    console.error(`Failed to fetch wallet balance for token ${tokenAddress}`, error);
    return 0;
  }
}

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
const DECISION_TAKER_URL = (runtimeEnv.VITE_DECISION_TAKER_URL ?? 'http://localhost:3334').replace(/\/+$/, '');

const tokenClientCache = new Map<string, TokenContract>();
function getTokenReadClient(contractId: string, sourceAddress: string): TokenContract {
  const cacheKey = `${contractId}:${sourceAddress}`;
  if (tokenClientCache.has(cacheKey)) {
    return tokenClientCache.get(cacheKey)!;
  }
  const client = new TokenContract({
    contractId,
    rpcUrl: FACTORY_RPC_URL,
    networkPassphrase: FACTORY_NETWORK_PASSPHRASE,
    publicKey: sourceAddress,
    signTransaction: async (txXdr: string) => ({
      signedTxXdr: txXdr,
      signerAddress: sourceAddress,
    }),
  });
  tokenClientCache.set(cacheKey, client);
  return client;
}

interface Token {
  contract: string;
  code: string;
  name: string;
}

function App() {
  const { address: walletAddress, kit, signTransaction, isConnected } = useWallet();

  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [withdrawingFromDexId, setWithdrawingFromDexId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [availableTokens, setAvailableTokens] = useState<Token[]>([]);
  const createSectionRef = useRef<HTMLDivElement>(null);
  const addLiquiditySectionRef = useRef<HTMLDivElement>(null);
  const [isAddLiquidityGlowing, setIsAddLiquidityGlowing] = useState(false);

  const [createForm, setCreateForm] = useState({
    name: '',
    protocol: 'soroswap' as Protocol,
    strategy: 'balanced' as Strategy,
    depositUsd: '',
    tokens: [
      { symbol: '', address: '' },
      { symbol: '', address: '' },
    ],
  });

  const [addForm, setAddForm] = useState({
    poolId: '',
    amounts: ['', ''],
  });
  const [walletTokenBalances, setWalletTokenBalances] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!isConnected || !walletAddress || !signTransaction) {
      setPools([]);
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        console.log('Fetching user pools from on-chain...');
        const onChainPools = await fetchUserPools(walletAddress, signTransaction);
        console.log('Fetched pools:', onChainPools);

        const convertedPools: Pool[] = onChainPools.map(transformPoolData);

        // The chain is the source of truth, so replace the list instead of merging.
        setPools(convertedPools);
        setAddForm((prev) => ({ ...prev, poolId: prev.poolId || convertedPools[0]?.id || '' }));
      } catch (error) {
        console.error('Error fetching on-chain pools:', error);
        setPools([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [isConnected, walletAddress, signTransaction, availableTokens.length]);

  useEffect(() => {
    (async () => {
      try {
        const tokenListFile = isMainnet ? '/tokens_mainnet.json' : '/tokens_testnet.json';
        const response = await fetch(tokenListFile);
        if (!response.ok) throw new Error(`Unable to load tokens from ${tokenListFile}`);
        const tokens = await response.json();
        setAvailableTokens(tokens);
      } catch (error) {
        console.warn(`Failed to load ${isMainnet ? 'mainnet' : 'testnet'} tokens, using fallback`, error);
        setAvailableTokens([
          { contract: 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA', code: 'native', name: 'Stellar Lumens' },
          { contract: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75', code: 'USDC', name: 'USDCoin' },
        ]);
      }
    })();
  }, [isMainnet]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const validCreateTokens = createForm.tokens.filter((token) => token.address);
  const tokenAddresses = validCreateTokens.map((token) => token.address);
  const hasDuplicateTokens = tokenAddresses.length !== new Set(tokenAddresses).size;
  const hasRequiredTokens = validCreateTokens.length === 2;
  const canCreate = hasRequiredTokens && !hasDuplicateTokens;

  const selectedPool = pools.find((p) => p.id === addForm.poolId);
  const validAddAmounts = addForm.amounts
    .map((amount) => Number(amount))
    .filter((amount) => amount > 0);

  const showToast = (message: string, tone: 'success' | 'error' = 'success') => setToast({ message, tone });

  const transformPoolData = (poolData: PoolData): Pool => {
    const token0Info = availableTokens.find((t) => t.contract === poolData.token0);
    const token1Info = availableTokens.find((t) => t.contract === poolData.token1);

    const token0Decimals = poolData.token0Decimals ?? DEFAULT_TOKEN_DECIMALS;
    const token1Decimals = poolData.token1Decimals ?? DEFAULT_TOKEN_DECIMALS;

    const locked0 = poolData.amounts ? scaleAmountByDecimals(poolData.amounts[0], token0Decimals) : 0;
    const locked1 = poolData.amounts ? scaleAmountByDecimals(poolData.amounts[1], token1Decimals) : 0;
    const available0 = poolData.amountsTokens
      ? scaleAmountByDecimals(poolData.amountsTokens[0], token0Decimals)
      : 0;
    const available1 = poolData.amountsTokens
      ? scaleAmountByDecimals(poolData.amountsTokens[1], token1Decimals)
      : 0;

    return {
      id: poolData.lobsterAddress,
      name: `${token0Info?.code || 'TOKEN0'}-${token1Info?.code || 'TOKEN1'} Pool`,
      protocol: poolData.protocol ?? null,
      strategy: 'balanced' as Strategy,
      status: 'active',
      apy: 0,
      lpTokens: poolData.lpAmount ? Number(poolData.lpAmount) : 0,
      tvl: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pendingRewards: 0,
      actualPool: poolData.actualPool,
      tokens: [
        {
          symbol: token0Info?.code || 'TOKEN0',
          name: token0Info?.name || 'Token 0',
          address: poolData.token0,
          amount: locked0,
          availableAmount: available0,
          usdValue: 0,
          decimals: token0Decimals,
        },
        {
          symbol: token1Info?.code || 'TOKEN1',
          name: token1Info?.name || 'Token 1',
          address: poolData.token1,
          amount: locked1,
          availableAmount: available1,
          usdValue: 0,
          decimals: token1Decimals,
        },
      ],
    };
  };

  useEffect(() => {
    if (!walletAddress || !isConnected || !selectedPool || selectedPool.tokens.length === 0) {
      setWalletTokenBalances({});
      return;
    }

    let isCancelled = false;
    (async () => {
      try {
        const balanceEntries = await Promise.all(
          selectedPool.tokens.map(async (token) => {
            if (isNativeToken(token.address)) {
              return [token.address, 0] as const;
            }
            const decimals = token.decimals ?? DEFAULT_TOKEN_DECIMALS;
            const balance = await fetchWalletTokenBalance(token.address, walletAddress, decimals);
            return [token.address, balance] as const;
          }),
        );
        if (!isCancelled) {
          const mapped: Record<string, number> = {};
          for (const [address, balance] of balanceEntries) {
            if (address) {
              mapped[address] = balance;
            }
          }
          setWalletTokenBalances(mapped);
        }
      } catch (error) {
        console.error('Failed to fetch wallet token balances', error);
        if (!isCancelled) {
          setWalletTokenBalances({});
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [walletAddress, isConnected, selectedPool]);

  const handleCreatePool = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasRequiredTokens) {
      showToast('Select two tokens to deploy a pool', 'error');
      return;
    }
    if (hasDuplicateTokens) {
      showToast('Tokens must be different', 'error');
      return;
    }
    if (!walletAddress || !kit) {
      showToast('Connect your wallet to deploy a pool', 'error');
      return;
    }

    setCreating(true);
    let pollInterval: NodeJS.Timeout | null = null;
    
    try {
      try {
        await kit.getAddress({ skipRequestAccess: false });
      } catch (authError) {
        console.warn('Wallet access request failed', authError);
        showToast('Authorize this site in your wallet (Freighter) and try again', 'error');
        setCreating(false);
        return;
      }

      const factoryClient = new FactoryContract({
        contractId: FACTORY_CONTRACT_ID,
        networkPassphrase: FACTORY_NETWORK_PASSPHRASE,
        rpcUrl: FACTORY_RPC_URL,
        publicKey: walletAddress,
        signTransaction: async (txXdr: string) => {
          const { signedTxXdr } = await kit.signTransaction(txXdr, {
            networkPassphrase: FACTORY_NETWORK_PASSPHRASE,
            address: walletAddress,
          });
          return {
            signedTxXdr,
            signerAddress: walletAddress,
          };
        },
      });

      const tx = await factoryClient.create_pool({
        user: walletAddress,
        token0: validCreateTokens[0].address,
        token1: validCreateTokens[1].address,
      });
      const onChainResult = await tx.signAndSend();
      console.log('On-chain deployment result:', onChainResult);

      const initialPoolCount = pools.length;
      let pollCount = 0;
      const maxPolls = 20; // 30 seconds at one poll every 1.5 s
      
      pollInterval = setInterval(async () => {
        pollCount++;
        try {
          const onChainPools = await fetchUserPools(walletAddress, signTransaction);
          
          if (onChainPools.length > initialPoolCount) {
            if (pollInterval) {
              clearInterval(pollInterval);
              pollInterval = null;
            }
            
            // Assumes the factory lists the newest pool first.
            const newPoolData = onChainPools[0];
            const convertedPool = transformPoolData(newPoolData);

            setPools((prev) => {
              const filtered = prev.filter((p) => 
                p.id !== `temp-${walletAddress}` && p.id !== convertedPool.id
              );
              const alreadyExists = filtered.some((p) => p.id === convertedPool.id);
              if (alreadyExists) {
                return filtered;
              }
              return [convertedPool, ...filtered];
            });
            
      setCreateForm({
        name: '',
              protocol: convertedPool.protocol ?? 'soroswap',
              strategy: convertedPool.strategy,
        depositUsd: '',
        tokens: [
                { symbol: '', address: '' },
                { symbol: '', address: '' },
        ],
      });
            showToast(`Pool "${convertedPool.name}" created and detected`);
          } else if (pollCount >= maxPolls) {
            if (pollInterval) {
              clearInterval(pollInterval);
              pollInterval = null;
            }
            console.warn('Polling timeout: New pool not detected after 30 seconds');
            showToast('Pool creation transaction submitted. It may take a moment to appear.');
          }
        } catch (error) {
          console.error('Error polling for new pool:', error);
          if (pollCount >= maxPolls) {
            if (pollInterval) {
              clearInterval(pollInterval);
              pollInterval = null;
            }
          }
        }
      }, 1500);

      showToast('Pool creation transaction submitted. Waiting for confirmation...');
    } catch (error) {
      console.error(error);
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      showToast('Unable to create pool right now', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleAddLiquidity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!addForm.poolId || !selectedPool || validAddAmounts.length !== 2 || !walletAddress || !kit) {
      showToast('Select a pool, enter both amounts, and connect your wallet', 'error');
      return;
    }
    setAddLoading(true);
    try {
      console.log('[lobster-deposit] Starting deposit flow', {
        poolId: addForm.poolId,
        walletAddress,
        amounts: addForm.amounts,
      });

      const token0 = selectedPool.tokens[0];
      const token1 = selectedPool.tokens[1];
      const amount0Human = Number(addForm.amounts[0] || 0);
      const amount1Human = Number(addForm.amounts[1] || 0);
      const amount0Raw = toRawAmount(amount0Human, token0.decimals ?? DEFAULT_TOKEN_DECIMALS);
      const amount1Raw = toRawAmount(amount1Human, token1.decimals ?? DEFAULT_TOKEN_DECIMALS);

      console.log('[lobster-deposit] Scaled amounts', {
        token0: token0.symbol,
        token1: token1.symbol,
        amount0Human,
        amount1Human,
        amount0Raw: amount0Raw.toString(),
        amount1Raw: amount1Raw.toString(),
      });

      const lobsterClient = new LobsterContract({
        contractId: selectedPool.id,
        networkPassphrase: FACTORY_NETWORK_PASSPHRASE,
        rpcUrl: FACTORY_RPC_URL,
        publicKey: walletAddress,
        signTransaction: async (txXdr: string) => {
          const { signedTxXdr } = await kit.signTransaction(txXdr, {
            networkPassphrase: FACTORY_NETWORK_PASSPHRASE,
            address: walletAddress,
          });
          return {
            signedTxXdr,
            signerAddress: walletAddress,
          };
        },
      });

      console.log('[lobster-deposit] Calling deposit', {
        contractId: selectedPool.id,
        caller: walletAddress,
      });
      const tx = await lobsterClient.deposit({
        caller: walletAddress,
        amount0: amount0Raw as any,
        amount1: amount1Raw as any,
      });
      const poolBefore = selectedPool;
      const availableBefore0 = poolBefore.tokens[0].availableAmount || 0;
      const availableBefore1 = poolBefore.tokens[1].availableAmount || 0;

      let txResult = null;
      try {
        txResult = await tx.signAndSend();
        console.log('[lobster-deposit] Deposit transaction result', txResult);
      } catch (error: any) {
        // Network error but transaction might have gone through
        const isNetworkError = error?.code === 'ERR_NETWORK' || error?.message?.includes('NETWORK') || error?.message?.includes('Network');
        if (isNetworkError) {
          console.warn('[lobster-deposit] Network error, but transaction may have succeeded. Will verify by refreshing pool data.', error);
        } else {
          throw error;
        }
      }

      let pollCount = 0;
      const maxPolls = 10;
      let depositDetected = false;

      while (pollCount < maxPolls && !depositDetected) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        pollCount++;

        try {
          const onChainPools = await fetchUserPools(walletAddress, signTransaction);
          const convertedPools: Pool[] = onChainPools.map(transformPoolData);
          const updatedPool = convertedPools.find((p) => p.id === selectedPool.id);

          if (updatedPool) {
            const availableAfter0 = updatedPool.tokens[0].availableAmount || 0;
            const availableAfter1 = updatedPool.tokens[1].availableAmount || 0;

            console.log('[lobster-deposit] Polling check', {
              pollCount,
              poolId: selectedPool.id,
              availableBefore0,
              availableBefore1,
              availableAfter0,
              availableAfter1,
              increased0: availableAfter0 > availableBefore0,
              increased1: availableAfter1 > availableBefore1,
              depositDetected: availableAfter0 > availableBefore0 || availableAfter1 > availableBefore1,
            });
            
            if (availableAfter0 > availableBefore0 || availableAfter1 > availableBefore1) {
              depositDetected = true;
              console.log('[lobster-deposit] Deposit detected');
              setPools(convertedPools);
      setAddForm((prev) => ({
        ...prev,
                amounts: ['', ''],
              }));
              showToast('Deposit successful!', 'success');
              
              // No protocol yet means the pool is still scanning, so DecisionTaker has to pick a DEX.
              if (selectedPool.protocol === null || selectedPool.protocol === undefined) {
                try {
                  const apiUrl = `${DECISION_TAKER_URL}/api/run/pool/${selectedPool.id}`;
                  console.log('[lobster-deposit] Triggering DecisionTaker API for scanning pool', {
                    poolAddress: selectedPool.id,
                    apiUrl,
                    timestamp: new Date().toISOString(),
                  });
                  
                  const decisionTakerResponse = await fetch(apiUrl, {
                    method: 'GET',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                  });
                  
                  console.log('[lobster-deposit] DecisionTaker API response status', {
                    status: decisionTakerResponse.status,
                    statusText: decisionTakerResponse.statusText,
                    ok: decisionTakerResponse.ok,
                  });
                  
                  if (decisionTakerResponse.ok) {
                    const result = await decisionTakerResponse.json();
                    console.log('[lobster-deposit] DecisionTaker API response', result);
                    
                    setTimeout(async () => {
                      console.log('[lobster-deposit] Starting to poll for DEX selection...');
                      let pollCount = 0;
                      const maxDexPolls = 20; // 30 seconds at one poll every 1.5 s
                      let dexDetected = false;
                      
                      while (pollCount < maxDexPolls && !dexDetected) {
                        await new Promise((resolve) => setTimeout(resolve, 1500));
                        pollCount++;
                        
                        try {
                          const onChainPools = await fetchUserPools(walletAddress, signTransaction);
                          const convertedPools: Pool[] = onChainPools.map(transformPoolData);
                          const updatedPool = convertedPools.find((p) => p.id === selectedPool.id);
                          
                          if (updatedPool) {
                            const hadProtocol = updatedPool.protocol !== null && updatedPool.protocol !== undefined;
                            const hasActualPool = updatedPool.actualPool !== null && updatedPool.actualPool !== undefined;
                            
                            if (hadProtocol || hasActualPool) {
                              dexDetected = true;
                              setPools(convertedPools);
                              showToast('Deposited on DEX', 'success');
                              console.log('[lobster-deposit] DEX detected!', {
                                protocol: updatedPool.protocol,
                                actualPool: updatedPool.actualPool,
                              });
                              break;
                            }
                          }
                        } catch (dexPollError) {
                          console.error('[lobster-deposit] Error polling for DEX selection', dexPollError);
                        }
                      }
                      
                      if (!dexDetected) {
                        console.log('[lobster-deposit] DEX selection polling timeout - pool may still be scanning');
                      }
                    }, 4500);
                  } else {
                    const errorText = await decisionTakerResponse.text().catch(() => 'Could not read error response');
                    console.warn('[lobster-deposit] DecisionTaker API returned error', {
                      status: decisionTakerResponse.status,
                      statusText: decisionTakerResponse.statusText,
                      errorBody: errorText,
                    });
                  }
                } catch (apiError) {
                  // Don't fail the deposit if API call fails, just log it
                  console.error('[lobster-deposit] Error calling DecisionTaker API', {
                    error: apiError,
                    message: apiError instanceof Error ? apiError.message : String(apiError),
                    stack: apiError instanceof Error ? apiError.stack : undefined,
                    poolId: selectedPool.id,
                    apiUrl: `${DECISION_TAKER_URL}/api/run/pool/${selectedPool.id}`,
                  });
                }
              } else {
                console.log('[lobster-deposit] DecisionTaker API not triggered, pool already has a protocol', {
                  poolId: selectedPool.id,
                  protocol: selectedPool.protocol,
                  reason: 'Pool already has a protocol assigned, no need to scan',
                });
              }
              
              break;
            }
          }
        } catch (refreshError) {
          console.error('[lobster-deposit] Error refreshing pool data', refreshError);
        }
      }

      if (!depositDetected) {
        try {
          const onChainPools = await fetchUserPools(walletAddress, signTransaction);
          const convertedPools: Pool[] = onChainPools.map(transformPoolData);
          setPools(convertedPools);
          setAddForm((prev) => ({
            ...prev,
            amounts: ['', ''],
          }));
        } catch (finalError) {
          console.error('[lobster-deposit] Final refresh failed', finalError);
        }

        if (txResult) {
          showToast('Deposit transaction submitted', 'success');
          
          // No protocol yet means the pool is still scanning, so DecisionTaker has to pick a DEX.
          if (selectedPool.protocol === null || selectedPool.protocol === undefined) {
            try {
              console.log('[lobster-deposit] Triggering DecisionTaker API for scanning pool', {
                poolAddress: selectedPool.id,
              });
              const decisionTakerResponse = await fetch(
                `${DECISION_TAKER_URL}/api/run/pool/${selectedPool.id}`,
                {
                  method: 'GET',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                }
              );
              
              if (decisionTakerResponse.ok) {
                const result = await decisionTakerResponse.json();
                console.log('[lobster-deposit] DecisionTaker API response', result);
                
                setTimeout(async () => {
                  console.log('[lobster-deposit] Starting to poll for DEX selection...');
                  let pollCount = 0;
                  const maxDexPolls = 20; // 30 seconds at one poll every 1.5 s
                  let dexDetected = false;
                  
                  while (pollCount < maxDexPolls && !dexDetected) {
                    await new Promise((resolve) => setTimeout(resolve, 1500));
                    pollCount++;
                    
                    try {
                      const onChainPools = await fetchUserPools(walletAddress, signTransaction);
                      const convertedPools: Pool[] = onChainPools.map(transformPoolData);
                      const updatedPool = convertedPools.find((p) => p.id === selectedPool.id);
                      
                      if (updatedPool) {
                        const hadProtocol = updatedPool.protocol !== null && updatedPool.protocol !== undefined;
                        const hasActualPool = updatedPool.actualPool !== null && updatedPool.actualPool !== undefined;
                        
                        if (hadProtocol || hasActualPool) {
                          dexDetected = true;
                          setPools(convertedPools);
                          showToast('Deposited on DEX', 'success');
                          console.log('[lobster-deposit] DEX detected!', {
                            protocol: updatedPool.protocol,
                            actualPool: updatedPool.actualPool,
                          });
                          break;
                        }
                      }
                    } catch (dexPollError) {
                      console.error('[lobster-deposit] Error polling for DEX selection', dexPollError);
                    }
                  }
                  
                  if (!dexDetected) {
                    console.log('[lobster-deposit] DEX selection polling timeout - pool may still be scanning');
                  }
                }, 4500);
              } else {
                console.warn('[lobster-deposit] DecisionTaker API returned error', decisionTakerResponse.status);
              }
            } catch (apiError) {
              // Don't fail the deposit if API call fails, just log it
              console.error('[lobster-deposit] Error calling DecisionTaker API', apiError);
            }
          }
        } else {
          showToast('Deposit may have succeeded. Please refresh to verify.', 'success');
        }
      }
    } catch (error) {
      console.error('[lobster-deposit] Error', error);
      showToast('Unable to deposit liquidity on-chain', 'error');
    } finally {
      setAddLoading(false);
    }
  };

  const handleWithdraw = async (poolId: string) => {
    if (!walletAddress || !kit || !signTransaction) {
      showToast('Connect your wallet to withdraw', 'error');
      return;
    }

    const pool = pools.find((p) => p.id === poolId);
    if (!pool || !pool.tokens || pool.tokens.length < 2) {
      showToast('Pool not found', 'error');
      return;
    }

    setWithdrawingId(poolId);
    try {
      try {
        await kit.getAddress({ skipRequestAccess: false });
      } catch (authError) {
        console.warn('Wallet access request failed', authError);
        showToast('Authorize this site in your wallet (Freighter) and try again', 'error');
        setWithdrawingId(null);
        return;
      }

      const token0 = pool.tokens[0];
      const token1 = pool.tokens[1];

      // Only what the vault holds itself; DEX positions come out through handleWithdrawFromDex.
      const amount0Raw = scaleAmountToRaw(token0.availableAmount || 0, token0.decimals || DEFAULT_TOKEN_DECIMALS);
      const amount1Raw = scaleAmountToRaw(token1.availableAmount || 0, token1.decimals || DEFAULT_TOKEN_DECIMALS);

      if (amount0Raw === 0n && amount1Raw === 0n) {
        showToast('No tokens available to withdraw from contract', 'error');
        setWithdrawingId(null);
        return;
      }

      console.log('[lobster-withdraw] Starting withdrawal', {
        poolId,
        poolName: pool.name,
        walletAddress,
        token0: { symbol: token0.symbol, available: token0.availableAmount, raw: amount0Raw.toString() },
        token1: { symbol: token1.symbol, available: token1.availableAmount, raw: amount1Raw.toString() },
      });

      const lobsterClient = new LobsterContract({
        contractId: poolId,
        networkPassphrase: FACTORY_NETWORK_PASSPHRASE,
        rpcUrl: FACTORY_RPC_URL,
        publicKey: walletAddress,
        signTransaction: async (txXdr: string) => {
          const { signedTxXdr } = await kit.signTransaction(txXdr, {
            networkPassphrase: FACTORY_NETWORK_PASSPHRASE,
            address: walletAddress,
          });
          return {
            signedTxXdr,
            signerAddress: walletAddress,
          };
        },
      });

      console.log('[lobster-withdraw] Calling withdraw_contract', {
        caller: walletAddress,
        amount0: amount0Raw.toString(),
        amount1: amount1Raw.toString(),
      });

      const availableBefore0 = token0.availableAmount || 0;
      const availableBefore1 = token1.availableAmount || 0;

      const tx = await lobsterClient.withdraw_contract({
        caller: walletAddress,
        amount0: amount0Raw,
        amount1: amount1Raw,
      });

      let txResult = null;
      try {
        txResult = await tx.signAndSend();
        console.log('[lobster-withdraw] Withdrawal result', txResult);
      } catch (error: any) {
        // Network error but transaction might have gone through
        const isNetworkError = error?.code === 'ERR_NETWORK' || error?.message?.includes('NETWORK') || error?.message?.includes('Network');
        if (isNetworkError) {
          console.warn('[lobster-withdraw] Network error, but transaction may have succeeded. Will verify by refreshing pool data.', error);
        } else {
          throw error;
        }
      }

      let pollCount = 0;
      const maxPolls = 10;
      let withdrawDetected = false;

      while (pollCount < maxPolls && !withdrawDetected) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        pollCount++;

        try {
          const onChainPools = await fetchUserPools(walletAddress, signTransaction);
          const convertedPools: Pool[] = onChainPools.map(transformPoolData);
          const updatedPool = convertedPools.find((p) => p.id === poolId);

          if (updatedPool) {
            const availableAfter0 = updatedPool.tokens[0].availableAmount || 0;
            const availableAfter1 = updatedPool.tokens[1].availableAmount || 0;

            if (availableAfter0 < availableBefore0 || availableAfter1 < availableBefore1) {
              withdrawDetected = true;
              setPools(convertedPools);
              showToast('Withdrawal successful!', 'success');
              break;
            }
          }
        } catch (refreshError) {
          console.error('[lobster-withdraw] Error refreshing pool data', refreshError);
        }
      }

      if (!withdrawDetected) {
        try {
          const onChainPools = await fetchUserPools(walletAddress, signTransaction);
          const convertedPools: Pool[] = onChainPools.map(transformPoolData);
          setPools(convertedPools);
        } catch (finalError) {
          console.error('[lobster-withdraw] Final refresh failed', finalError);
        }

        if (txResult) {
          showToast('Withdrawal transaction submitted', 'success');
        } else {
          showToast('Withdrawal may have succeeded. Please refresh to verify.', 'success');
        }
      }
    } catch (error) {
      console.error('[lobster-withdraw] Error', error);
      showToast('Withdraw failed', 'error');
    } finally {
      setWithdrawingId(null);
    }
  };

  const scrollToCreate = () => createSectionRef.current?.scrollIntoView({ behavior: 'smooth' });

  const handleWithdrawFromDex = async (poolId: string) => {
    if (!walletAddress || !kit || !signTransaction) {
      showToast('Connect your wallet to withdraw from DEX', 'error');
      return;
    }

    const pool = pools.find((p) => p.id === poolId);
    if (!pool || !pool.protocol || !pool.actualPool) {
      showToast('Pool must have an active protocol and DEX pool address', 'error');
      return;
    }

    setWithdrawingFromDexId(poolId);
    try {
      try {
        await kit.getAddress({ skipRequestAccess: false });
      } catch (authError) {
        console.warn('Wallet access request failed', authError);
        showToast('Authorize this site in your wallet (Freighter) and try again', 'error');
        setWithdrawingFromDexId(null);
        return;
      }

      const lobsterClient = new LobsterContract({
        contractId: poolId,
        networkPassphrase: FACTORY_NETWORK_PASSPHRASE,
        rpcUrl: FACTORY_RPC_URL,
        publicKey: walletAddress,
        signTransaction: async (txXdr: string) => {
          const { signedTxXdr } = await kit.signTransaction(txXdr, {
            networkPassphrase: FACTORY_NETWORK_PASSPHRASE,
            address: walletAddress,
          });
          return {
            signedTxXdr,
            signerAddress: walletAddress,
          };
        },
      });

      const lockedBefore0 = pool.tokens[0].amount || 0;
      const lockedBefore1 = pool.tokens[1].amount || 0;

      const deadline = BigInt(99999999999);

      let txResult = null;

      console.log('[lobster-withdraw-dex] Starting withdrawal from DEX', {
        poolId,
        poolName: pool.name,
        protocol: pool.protocol,
        actualPool: pool.actualPool,
        walletAddress,
      });

      try {
        if (pool.protocol === 'soroswap') {
          const routerTx = await lobsterClient.get_actual_router();
          const routerSim = await routerTx.simulate();
          const routerAddress = (routerSim.result as any)?.toString() || '';
          
          if (!routerAddress) {
            throw new Error('Router address not found for Soroswap pool');
          }

          console.log('[lobster-withdraw-dex] Calling withdraw_soroswap', {
            caller: walletAddress,
            pool_address: pool.actualPool,
            router_address: routerAddress,
            amount0_min: 0,
            amount1_min: 0,
            deadline: deadline.toString(),
          });

          const tx = await lobsterClient.withdraw_soroswap({
            caller: walletAddress,
            pool_address: pool.actualPool,
            router_address: routerAddress,
            amount0_min: 0n,
            amount1_min: 0n,
            deadline,
          });
          txResult = await tx.signAndSend();
        } else if (pool.protocol === 'phoenix') {
          console.log('[lobster-withdraw-dex] Calling withdraw_phoenix', {
            caller: walletAddress,
            pool_address: pool.actualPool,
            amount0_min: 0,
            amount1_min: 0,
            deadline: deadline.toString(),
          });

          const tx = await lobsterClient.withdraw_phoenix({
            caller: walletAddress,
            pool_address: pool.actualPool,
            amount0_min: 0n,
            amount1_min: 0n,
            deadline,
          });
          txResult = await tx.signAndSend();
        } else if (pool.protocol === 'aquarius') {
          console.log('[lobster-withdraw-dex] Calling withdraw_aquarius', {
            caller: walletAddress,
            pool_address: pool.actualPool,
            amount0_min: 0,
            amount1_min: 0,
          });

          const tx = await lobsterClient.withdraw_aquarius({
            caller: walletAddress,
            pool_address: pool.actualPool,
            amount0_min: 0n as any, // u128 for aquarius
            amount1_min: 0n as any, // u128 for aquarius
          });
          txResult = await tx.signAndSend();
        } else {
          throw new Error(`Unsupported protocol: ${pool.protocol}`);
        }

        console.log('[lobster-withdraw-dex] Withdrawal result', txResult);
      } catch (error: any) {
        // Network error but transaction might have gone through
        const isNetworkError = error?.code === 'ERR_NETWORK' || error?.message?.includes('NETWORK') || error?.message?.includes('Network');
        if (isNetworkError) {
          console.warn('[lobster-withdraw-dex] Network error, but transaction may have succeeded. Will verify by refreshing pool data.', error);
        } else {
          throw error;
        }
      }

      let pollCount = 0;
      const maxPolls = 10;
      let withdrawDetected = false;

      while (pollCount < maxPolls && !withdrawDetected) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        pollCount++;

        try {
          const onChainPools = await fetchUserPools(walletAddress, signTransaction);
          const convertedPools: Pool[] = onChainPools.map(transformPoolData);
          const updatedPool = convertedPools.find((p) => p.id === poolId);

          if (updatedPool) {
            const lockedAfter0 = updatedPool.tokens[0].amount || 0;
            const lockedAfter1 = updatedPool.tokens[1].amount || 0;

            if (lockedAfter0 < lockedBefore0 || lockedAfter1 < lockedBefore1) {
              withdrawDetected = true;
              setPools(convertedPools);
              showToast('Withdrawal from DEX successful!', 'success');
              break;
            }
          }
        } catch (refreshError) {
          console.error('[lobster-withdraw-dex] Error refreshing pool data', refreshError);
        }
      }

      if (!withdrawDetected) {
        try {
          const onChainPools = await fetchUserPools(walletAddress, signTransaction);
          const convertedPools: Pool[] = onChainPools.map(transformPoolData);
          setPools(convertedPools);
        } catch (finalError) {
          console.error('[lobster-withdraw-dex] Final refresh failed', finalError);
        }

        if (txResult) {
          showToast('Withdrawal from DEX transaction submitted', 'success');
        } else {
          showToast('Withdrawal from DEX may have succeeded. Please refresh to verify.', 'success');
        }
      }
    } catch (error) {
      console.error('[lobster-withdraw-dex] Error', error);
      showToast('Withdraw from DEX failed', 'error');
    } finally {
      setWithdrawingFromDexId(null);
    }
  };

  const scrollToAddLiquidity = (poolId: string) => {
    setAddForm((prev) => ({ ...prev, poolId }));
    // Small delay to ensure state is updated
    setTimeout(() => {
      setIsAddLiquidityGlowing(true);
      setTimeout(() => setIsAddLiquidityGlowing(false), 1000);
      
      addLiquiditySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // The smooth scroll takes about 800 ms; blink twice more once it ends.
      setTimeout(() => {
        setIsAddLiquidityGlowing(true);
        setTimeout(() => {
          setIsAddLiquidityGlowing(false);
          setTimeout(() => {
            setIsAddLiquidityGlowing(true);
            setTimeout(() => setIsAddLiquidityGlowing(false), 1000);
          }, 200);
        }, 1000);
      }, 800);
    }, 100);
  };

  return (
    <main className="app-shell">
      <header className="card hero-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
          <div style={{ flex: 1 }}>
            <img
              src={logoWithText}
              alt="Lobster"
              style={{ height: '40px', marginBottom: '0.5rem' }}
            />
          <h1 style={{ marginTop: '0.5rem', fontSize: '2.5rem' }}>Command center for your liquidity</h1>
            <p style={{ marginTop: '0.5rem', maxWidth: 550 }}>
            Spin up new Lobster pools, monitor balances across Soroswap, Phoenix and Aquarius, and pull capital back
            whenever you need it.
          </p>
          <div className="actions hero-actions">
            <button className="btn btn-primary" onClick={scrollToCreate}>
              Create pool
            </button>
            <button className="btn btn-ghost" onClick={() => window.open('https://lobster.finance', '_blank')}>
              Docs
            </button>
            </div>
          </div>
          <div style={{ marginLeft: '1rem' }}>
            <WalletButton />
          </div>
        </div>
      </header>

      <section style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ flex: 1, maxWidth: 500 }} ref={createSectionRef}>
          <article className="card">
            <div className="section-heading">
              <div>
                <h2>Create Lobster pool</h2>
                <p>Define your token mix and deployment protocol.</p>
              </div>
            </div>
            <form className="form-grid" onSubmit={handleCreatePool}>
              <p style={{ fontWeight: 600 }}>Tokens</p>
              {createForm.tokens.map((token, index) => (
                <div key={index} className="input-field">
                  <label>Token {index + 1}</label>
                  <TokenSelector
                      value={token.address}
                    onChange={(address, symbol) => {
                        const next = [...createForm.tokens];
                      next[index].address = address;
                      next[index].symbol = symbol;
                        setCreateForm({ ...createForm, tokens: next });
                      }}
                    tokens={availableTokens}
                  />
                </div>
              ))}
              {hasDuplicateTokens && hasRequiredTokens && (
                <small style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>Cannot use the same token twice</small>
              )}
              <button type="submit" className="btn btn-primary" disabled={!canCreate || creating}>
                {creating ? 'Deploying...' : 'Deploy pool'}
              </button>
            </form>
          </article>
        </div>

        <div style={{ flex: 1, maxWidth: 500 }} ref={addLiquiditySectionRef}>
          <article
            className="card"
            style={{
              position: 'relative',
              transition: 'box-shadow 0.3s ease-in-out',
              boxShadow: isAddLiquidityGlowing
                ? '0 0 15px rgba(147, 197, 253, 0.5), 0 0 30px rgba(147, 197, 253, 0.3), 0 0 45px rgba(147, 197, 253, 0.2)'
                : 'var(--shadow-soft)',
              animation: isAddLiquidityGlowing ? 'glowPulse 1s ease-in-out' : 'none',
            }}
          >
            <div className="section-heading">
              <div>
                <h3>Add liquidity</h3>
                <p>Top up an existing Lobster pool with fresh tokens.</p>
              </div>
            </div>
            {!isConnected ? (
              <div className="empty-state" style={{ padding: '1.5rem 1rem' }}>
                <p style={{ fontSize: '0.95rem', marginBottom: '0.25rem' }}>Connect your wallet to add liquidity.</p>
              </div>
            ) : pools.length === 0 ? (
              <div className="empty-state" style={{ padding: '1.5rem 1rem' }}>
                <p style={{ fontSize: '0.95rem', marginBottom: '0.25rem' }}>No Lobster pools found.</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                  Create a pool first, then you can add liquidity here.
                </p>
              </div>
            ) : (
            <form className="form-grid" onSubmit={handleAddLiquidity}>
              <div className="input-field">
                <label>Pool</label>
                <select
                  value={addForm.poolId}
                    onChange={(event) => setAddForm({ poolId: event.target.value, amounts: ['', ''] })}
                >
                  <option value="">Select pool</option>
                  {pools.map((pool) => (
                    <option key={pool.id} value={pool.id}>
                      {pool.name}
                    </option>
                  ))}
                </select>
              </div>
                {selectedPool && selectedPool.tokens.length >= 2 ? (
                  selectedPool.tokens.slice(0, 2).map((token, index) => (
                    <div key={token.symbol} className="input-field">
                      <label
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.875rem',
                          gap: '0.5rem',
                        }}
                      >
                        <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600 }}>{token.symbol}</span>
                          <span style={{ color: 'var(--color-text-secondary)' }}>{formatTokenAddress(token.address)}</span>
                        </span>
                        {walletAddress && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                            Balance:{' '}
                            {token.address && walletTokenBalances[token.address] !== undefined
                              ? formatTokenAmountDisplay(walletTokenBalances[token.address])
                              : '-'}
                          </span>
                        )}
                      </label>
                    <input
                      type="number"
                      min="0"
                        step="any"
                        placeholder="0"
                        value={addForm.amounts[index] || ''}
                      onChange={(event) => {
                          const next = [...addForm.amounts];
                          next[index] = event.target.value;
                          setAddForm({ ...addForm, amounts: next });
                      }}
                    />
                  </div>
                  ))
                ) : (
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>Select a pool to add liquidity</p>
                )}
              <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!addForm.poolId || !selectedPool || validAddAmounts.length !== 2 || addLoading}
                >
                {addLoading ? 'Adding...' : 'Add liquidity'}
              </button>
            </form>
            )}
          </article>
        </div>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>My pools</h2>
            <p>Your deployed liquidity positions.</p>
          </div>
        </div>
        {loading ? (
          <div className="empty-state">Loading pools...</div>
        ) : !isConnected ? (
          <div className="empty-state">
            <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem', fontWeight: 600 }}>Connect your wallet</p>
            <p style={{ color: 'var(--color-text-secondary)' }}>Connect your Stellar wallet to view and manage your pools.</p>
          </div>
        ) : pools.length === 0 ? (
          <div className="empty-state">No Lobster pools yet. Create one to get started.</div>
        ) : (
          <div className="pools-grid">
            {pools.map((pool) => (
              <article key={pool.id} className="card pool-card">
                <div className="section-heading">
                  <div>
                    <h3>{pool.name}</h3>
                    <div className="token-stack">
                      {pool.protocol ? (
                        <span
                          className="pill pill--protocol"
                          style={{ background: getProtocolColor(pool.protocol), color: 'white' }}
                        >
                          {protocolLabels[pool.protocol]}
                        </span>
                      ) : (
                        <span className="pill pill--protocol" style={{ background: '#10b981', color: 'white' }}>
                          Scanning Best pool
                        </span>
                      )}
                      <span className="pill pill--status">{pool.status}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                    <strong style={{ fontSize: '1.1rem' }}>{pool.apy}% APY</strong>
                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                      {formatNumber(pool.lpTokens)} LP
                    </span>
                </div>
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                    Token Holdings
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {pool.tokens.map((token) => (
                      <div key={token.symbol} style={{ padding: '1rem', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(168, 85, 247, 0.05) 100%)', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '0.75rem' }}>
                              {token.symbol.slice(0, 2)}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{token.symbol}</div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>{formatTokenAddress(token.address)}</div>
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {token.amount > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '6px' }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <span style={{ color: 'var(--color-primary)' }}>●</span>
                                Locked in DEX
                      </span>
                              <strong style={{ fontSize: '0.9rem', fontFamily: 'monospace' }}>
                                {formatTokenAmountDisplay(token.amount)}
                              </strong>
                  </div>
                          )}
                          {token.availableAmount !== undefined && token.availableAmount > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '6px' }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <span style={{ color: '#22c55e' }}>●</span>
                                Available in contract
                              </span>
                              <strong style={{ fontSize: '0.9rem', fontFamily: 'monospace' }}>
                                {formatTokenAmountDisplay(token.availableAmount)}
                              </strong>
                </div>
                          )}
                  </div>
                  </div>
                    ))}
                  </div>
                </div>
                <div className="actions" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleWithdraw(pool.id)}
                    disabled={withdrawingId === pool.id || withdrawingFromDexId === pool.id}
                  >
                    {withdrawingId === pool.id ? 'Processing...' : 'Withdraw'}
                  </button>
                  {pool.protocol && pool.actualPool && (
                  <button
                      className="btn btn-primary"
                      onClick={() => handleWithdrawFromDex(pool.id)}
                      disabled={withdrawingId === pool.id || withdrawingFromDexId === pool.id}
                      style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)' }}
                    >
                      {withdrawingFromDexId === pool.id ? 'Processing...' : 'Withdraw from Dex'}
                    </button>
                  )}
                  <button className="btn btn-ghost" onClick={() => scrollToAddLiquidity(pool.id)}>
                    Add tokens
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card table-card">
        <div className="section-heading">
          <div>
            <h2>Pool ledger</h2>
            <p>Detailed breakdown by protocol and token exposure.</p>
          </div>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Pool</th>
                <th>Protocol</th>
                <th>Tokens</th>
                <th>LP tokens</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pools.map((pool) => (
                <tr key={pool.id}>
                  <td>
                    <strong>{pool.name}</strong>
                  </td>
                  <td>
                    {pool.protocol ? (
                      <span style={{ color: getProtocolColor(pool.protocol), fontWeight: 600 }}>
                        {protocolLabels[pool.protocol]}
                      </span>
                    ) : (
                      <span style={{ color: '#10b981', fontWeight: 600 }}>Scanning Best pool</span>
                    )}
                  </td>
                  <td>{pool.tokens.map((token) => token.symbol).join(' / ')}</td>
                  <td>{formatNumber(pool.lpTokens)}</td>
                  <td style={{ textTransform: 'capitalize' }}>{pool.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {toast && (
        <div className="toast" style={{ background: toast.tone === 'success' ? '#22c55e' : 'var(--color-error)' }}>
          {toast.message}
        </div>
      )}
    </main>
  );
}

export default App;
