import { LobsterClient } from '../../../bindings/lobsterClient.js';
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
} from './multisigPoolOperations.js';

export type { SignerConfig } from './multisigPoolOperations.js';

export type PoolOperationConfig =
  | { mode: 'single'; secret: string }
  | { mode: 'multisig-local'; secret: string; signerSecrets: string[] }
  | { mode: 'multisig-external'; secret: string; signers: SignerConfig[] }  // signers may mix local keys and signer services

type PoolAddresses = {
  soroswap: string;
  phoenix: string;
  aquarius: string;
};

// CALLER_ADDRESS is set to the multisig account in multisig setups; otherwise the signing key is the caller
function getCallerPublicKey(config: PoolOperationConfig): string {
  const callerAddress = process.env.CALLER_ADDRESS;
  if (callerAddress) {
    return callerAddress;
  }
  const keypair = Keypair.fromSecret(config.secret);
  return keypair.publicKey();
}

async function createMultisigConfig(
  config: PoolOperationConfig,
  contractId: string,
  caller: string
): Promise<MultisigConfigType | null> {
  if (config.mode === 'single') {
    return null; // Use direct signing
  }

  const signers: SignerConfig[] = [];

  if (config.mode === 'multisig-local') {
    signers.push(...config.signerSecrets.map(secret => {
      const keypair = Keypair.fromSecret(secret);
      const rawSecret = keypair.rawSecretKey();
      return { secretKeyHex: Buffer.from(rawSecret).toString('hex') };
    }));
  } else if (config.mode === 'multisig-external') {
    signers.push(...config.signers);
  }

  const multisigType = (process.env.MULTISIG_TYPE ?? 'n-of-n') as '1-of-n' | 'n-of-n';

  return {
    contractId,
    caller,
    signers,
    feepayerSecret: config.secret,
    signatureExpirationLedger: await getCurrentLedger() + 100,
    networkPassphrase: process.env.NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015",
    rpcUrl: process.env.RPC_URL ?? "https://soroban-testnet.stellar.org",
    multisigType
  };
}

async function getCurrentLedger(): Promise<number> {
  const rpcUrl = process.env.RPC_URL ?? "https://soroban-testnet.stellar.org";

  const server = new rpc.Server(rpcUrl, {
    allowHttp: rpcUrl.startsWith("http://"),
  });

  const currentLedger = await server.getLatestLedger();
  console.log('currentLedger =>', currentLedger.sequence.toString());

  return currentLedger.sequence;

}


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
    let response;
    switch (poolIndex) {
      case 0: // Soroswap
        const soroswapParams: AddLiquiditySoroswapParams = {
          amount0: Number(amount0),
          amount1: Number(amount1),
          amount0Min: 5,
          amount1Min: 5,
          deadlineLedger: 99999999999,
          routerAddress: process.env.SOROSWAP_ROUTER ?? ''
        };
        response = await addLiquiditySoroswapWithMultisig(multisigConfig, soroswapParams);
        break;
      case 1: // Phoenix
        const phoenixParams: AddLiquidityPhoenixParams = {
          amount0: Number(amount0),
          amount1: Number(amount1),
          amount0Min: 5,
          amount1Min: 5,
          deadline: 99999999999,
          poolAddress: poolAddresses.phoenix,
          slippage: 0
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

// deposits the vault's idle balances into the DEX with the highest APR
export async function deposit(
  config: PoolOperationConfig,
  clientLobster: LobsterClient,
  contractId: string,
  dataSoroswap: any,
  dataPhoenix: any,
  dataAquarius: any,
): Promise<{ success: boolean; targetPool: number | null; error?: string }> {
  try {
    const aprSoroswap = dataSoroswap.last?.aprList ?? 0;
    const aprPhoenix = dataPhoenix.last?.aprList ?? 0;
    const aprAquarius = dataAquarius.last?.aprList ?? 0;

    const aprs = [
      { pool: 0, apr: aprSoroswap, name: 'Soroswap' },
      { pool: 1, apr: aprPhoenix, name: 'Phoenix' },
      { pool: 2, apr: aprAquarius, name: 'Aquarius' }
    ];

    const bestPool = aprs.reduce((max, current) =>
      current.apr > max.apr ? current : max
    );

    console.log(`No active pool found. Best APR is ${bestPool.name} with ${bestPool.apr}%`);

    const balance = await clientLobster.get_amounts_tokens();
    let balance0 = BigInt(balance._value[0]._value._attributes.lo._value.toString());
    let balance1 = BigInt(balance._value[1]._value._attributes.lo._value.toString());

    if (balance0 === 0n && balance1 === 0n) {
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


    console.log('balance0 =>', balance0.toString());
    console.log('balance1 =>', balance1.toString());

    await executeAddLiquidity(
      config,
      clientLobster,
      contractId,
      bestPool.pool,
      balance0,
      balance1,
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

// withdraws from the current DEX, then deposits everything the vault holds into the target one
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

  console.log(`Withdrawing from pool ${decision.currentPool}...`);
  await executeWithdraw(config, clientLobster, contractId, decision.currentPool, poolAddresses);

  // a multisig send returns before the ledger closes, so give the withdraw time to land before reading balances
  await new Promise(resolve => setTimeout(resolve, 10000));

  let balance = await clientLobster.get_amounts_tokens();
  let balance0 = BigInt(balance._value[0]._value._attributes.lo._value.toString());
  let balance1 = BigInt(balance._value[1]._value._attributes.lo._value.toString());


  console.log(`Adding liquidity to pool ${decision.targetPool}...`);
  await executeAddLiquidity(
    config,
    clientLobster,
    contractId,
    decision.targetPool,
    balance0,
    balance1,
    poolAddresses
  );

  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('Pool migration completed!');
}
