import { LobsterClient } from '../bindings/lobsterClient';
import { Keypair, rpc } from '@stellar/stellar-sdk';
import {
  addLiquiditySoroswapWithMultisig,
  addLiquidityPhoenixWithMultisig,
  addLiquidityAquariusWithMultisig,
  withdrawSoroswapWithMultisig,
  withdrawPhoenixWithMultisig,
  withdrawAquariusWithMultisig,
  type MultisigConfig as MultisigConfigType,
  type SignerConfig,
  type AddLiquiditySoroswapParams,
  type AddLiquidityPhoenixParams,
  type AddLiquidityAquariusParams,
  type WithdrawSoroswapParams,
  type WithdrawPhoenixParams,
  type WithdrawAquariusParams
} from './multisigPoolOperations';

// ============================================================================
// Unified Configuration Types
// ============================================================================

export type PoolOperationConfig = 
  | { mode: 'single'; secret: string }  // Scenario 1: Single signer
  | { mode: 'multisig-local'; secret: string; signerSecrets: string[] }  // Scenario 2: Multiple local signers
  | { mode: 'multisig-external'; secret: string; signers: SignerConfig[] }  // Scenario 3: Multiple signers with external APIs

type PoolAddresses = {
  soroswap: string;
  phoenix: string;
  aquarius: string;
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Gets the caller public key from config
 */
function getCallerPublicKey(config: PoolOperationConfig): string {
  const keypair = Keypair.fromSecret(config.secret);
  return keypair.publicKey();
}

/**
 * Creates multisig config from pool operation config
 */
async function createMultisigConfig(
  config: PoolOperationConfig,
  contractId: string,
  caller: string
):  Promise<MultisigConfigType | null> {
  if (config.mode === 'single') {
    return null; // Use direct signing
  }

  const signers: SignerConfig[] = [];
  
  if (config.mode === 'multisig-local') {
    // Convert secret keys to hex format
    signers.push(...config.signerSecrets.map(secret => {
      const keypair = Keypair.fromSecret(secret);
      const rawSecret = keypair.rawSecretKey();
      return { secretKeyHex: Buffer.from(rawSecret).toString('hex') };
    }));
  } else if (config.mode === 'multisig-external') {
    signers.push(...config.signers);
  }

  return {
    contractId,
    caller,
    signers,
    feepayerSecret: config.secret,
    signatureExpirationLedger: await getCurrentLedger() + 100, // You'll need to implement getCurrentLedger()
    networkPassphrase: process.env.NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015",
    rpcUrl: process.env.RPC_URL ?? "https://soroban-testnet.stellar.org"
  };
}

/**
 * Helper to get current ledger (you may need to implement this)
 */
async function getCurrentLedger(): Promise<number> {
    const rpcUrl = process.env.RPC_URL ?? "https://soroban-testnet.stellar.org";

    const server = new rpc.Server(rpcUrl, {
        allowHttp: rpcUrl.startsWith("http://"),
      });

    const currentLedger = await server.getLatestLedger();
    console.log('currentLedger =>', currentLedger.sequence.toString());

    return currentLedger.sequence;

}

/**
 * Executes add liquidity operation (handles all 3 scenarios)
 */
async function executeAddLiquidity(
  config: PoolOperationConfig,
  clientLobster: LobsterClient,
  contractId: string,
  poolIndex: number,
  amount0: bigint,
  amount1: bigint,
  poolAddresses: PoolAddresses
): Promise<void> {
  const caller = getCallerPublicKey(config);

  const multisigConfig = await createMultisigConfig(config, contractId, caller);

  if (multisigConfig) {
    // Use multisig
    let response;
    switch (poolIndex) {
      case 0: // Soroswap
        const soroswapParams: AddLiquiditySoroswapParams = {
          amount0: Number(amount0),
          amount1: Number(amount1),
          amount0Min: 0,
          amount1Min: 0,
          deadlineLedger: 99999999999,
          routerAddress: process.env.SOROSWAP_ROUTER ?? ''
        };
        response = await addLiquiditySoroswapWithMultisig(multisigConfig, soroswapParams);
        break;
      case 1: // Phoenix
        const phoenixParams: AddLiquidityPhoenixParams = {
          amount0: Number(amount0),
          amount1: Number(amount1),
          amount0Min: 0,
          amount1Min: 0,
          deadline: 99999999999,
          poolAddress: poolAddresses.phoenix,
          slippage: 500
        };
        response = await addLiquidityPhoenixWithMultisig(multisigConfig, phoenixParams);
        break;
      case 2: // Aquarius
        const aquariusParams: AddLiquidityAquariusParams = {
          amount0: Number(amount0),
          amount1: Number(amount1),
          poolAddress: poolAddresses.aquarius
        };
        response = await addLiquidityAquariusWithMultisig(multisigConfig, aquariusParams);
        break;
      default:
        throw new Error(`Invalid pool index: ${poolIndex}`);
    }
    console.log(`Add liquidity transaction sent! Hash: ${response.hash}`);
  } else {
    // Use direct signing (single signer)
    let tx;
    switch (poolIndex) {
      case 0: // Soroswap
        tx = await clientLobster.add_liquidity_soroswap({
          caller,
          amount0,
          amount1,
          amount0_min: BigInt(0),
          amount1_min: BigInt(0),
          deadline_ledger: BigInt(99999999999),
          router_address: process.env.SOROSWAP_ROUTER ?? '',
        });
        break;
      case 1: // Phoenix
        tx = await clientLobster.add_liquidity_phoenix({
          caller,
          amount0,
          amount1,
          amount0_min: BigInt(0),
          amount1_min: BigInt(0),
          pool_address: poolAddresses.phoenix,
          deadline: BigInt(99999999999),
          slippage: BigInt(500),
        });
        break;
      case 2: // Aquarius
        tx = await clientLobster.add_liquidity_aquarius({
          caller,
          amount0,
          amount1,
          pool_address: poolAddresses.aquarius,
        });
        break;
      default:
        throw new Error(`Invalid pool index: ${poolIndex}`);
    }
    console.log(`Sending add liquidity transaction...`);
    await tx?.signAndSend();
    console.log(`Add liquidity done!`);
  }
}

/**
 * Executes withdraw operation (handles all 3 scenarios)
 */
async function executeWithdraw(
  config: PoolOperationConfig,
  clientLobster: LobsterClient,
  contractId: string,
  poolIndex: number,
  poolAddresses: PoolAddresses
): Promise<void> {
  const caller = getCallerPublicKey(config);

  const multisigConfig = await createMultisigConfig(config, contractId, caller);

  if (multisigConfig) {
    // Use multisig
    let response;
    switch (poolIndex) {
      case 0: // Soroswap
        const soroswapParams: WithdrawSoroswapParams = {
          amount0Min: 0,
          amount1Min: 0,
          deadline: 99999999999,
          poolAddress: poolAddresses.soroswap,
          routerAddress: process.env.SOROSWAP_ROUTER ?? ''
        };
        response = await withdrawSoroswapWithMultisig(multisigConfig, soroswapParams);
        break;
      case 1: // Phoenix
        const phoenixParams: WithdrawPhoenixParams = {
          amount0Min: 0,
          amount1Min: 0,
          deadline: 99999999999,
          poolAddress: poolAddresses.phoenix
        };
        response = await withdrawPhoenixWithMultisig(multisigConfig, phoenixParams);
        break;
      case 2: // Aquarius
        const aquariusParams: WithdrawAquariusParams = {
          amount0Min: 0,
          amount1Min: 0,
          poolAddress: poolAddresses.aquarius
        };
        response = await withdrawAquariusWithMultisig(multisigConfig, aquariusParams);
        break;
      default:
        throw new Error(`Invalid pool index: ${poolIndex}`);
    }
    console.log(`Withdraw transaction sent! Hash: ${response.hash}`);
  } else {
    // Use direct signing (single signer)
    let tx;
    switch (poolIndex) {
      case 0: // Soroswap
        tx = await clientLobster.withdraw_soroswap({
          caller,
          amount0_min: BigInt(0),
          amount1_min: BigInt(0),
          deadline: BigInt(99999999999),
          pool_address: poolAddresses.soroswap,
          router_address: process.env.SOROSWAP_ROUTER ?? '',
        });
        break;
      case 1: // Phoenix
        tx = await clientLobster.withdraw_phoenix({
          caller,
          amount0_min: BigInt(0),
          amount1_min: BigInt(0),
          deadline: BigInt(99999999999),
          pool_address: poolAddresses.phoenix,
        });
        break;
      case 2: // Aquarius
        tx = await clientLobster.withdraw_aquarius({
          caller,
          amount0_min: BigInt(0),
          amount1_min: BigInt(0),
          pool_address: poolAddresses.aquarius,
        });
        break;
      default:
        throw new Error(`Invalid pool index: ${poolIndex}`);
    }
    console.log(`Sending withdraw transaction...`);
    await tx?.signAndSend();
    console.log(`Withdraw done!`);
  }
}

// ============================================================================
// Public Functions
// ============================================================================

/**
 * Deposits liquidity to the best pool (highest APR)
 * Handles all 3 signing scenarios
 */
export async function deposit(
  config: PoolOperationConfig,
  clientLobster: LobsterClient,
  contractId: string,
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

    const poolAddresses = {
      soroswap: dataSoroswap.pooladdress,
      phoenix: dataPhoenix.pooladdress,
      aquarius: dataAquarius.pooladdress
    };

    // Execute deposit using unified function
    await executeAddLiquidity(
      config,
      clientLobster,
      contractId,
      bestPool.pool,
      BigInt(balance0),
      BigInt(balance1),
      poolAddresses
    );

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

/**
 * Executes pool migration (withdraw from current, deposit to target)
 * Handles all 3 signing scenarios
 */
export async function executePoolMigration(
  config: PoolOperationConfig,
  clientLobster: LobsterClient,
  contractId: string,
  decision: { shouldChange: boolean; currentPool: number; targetPool: number | null },
  poolAddresses: PoolAddresses
): Promise<void> {
  if (!decision.shouldChange || decision.targetPool === null) {
    console.log('No pool change needed');
    return;
  }

  // 1. Withdraw from current pool
  console.log(`Withdrawing from pool ${decision.currentPool}...`);
  await executeWithdraw(config, clientLobster, contractId, decision.currentPool, poolAddresses);

  // Wait a bit for the transaction to settle
  await new Promise(resolve => setTimeout(resolve, 10000));

  // 2. Get new balances
  let balance = await clientLobster.get_amounts_tokens();
  let balance0 = balance._value[0]._value._attributes.lo._value.toString();
  let balance1 = balance._value[1]._value._attributes.lo._value.toString();

  // 3. Add liquidity to target pool
  console.log(`Adding liquidity to pool ${decision.targetPool}...`);
  await executeAddLiquidity(
    config,
    clientLobster,
    contractId,
    decision.targetPool,
    BigInt(balance0),
    BigInt(balance1),
    poolAddresses
  );

  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('Pool migration completed!');
}
