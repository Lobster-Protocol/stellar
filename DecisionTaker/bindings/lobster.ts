import { Buffer } from "buffer";
import { Address } from '@stellar/stellar-sdk';
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from '@stellar/stellar-sdk/contract';
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Typepoint,
  Duration,
} from '@stellar/stellar-sdk/contract';
export * from '@stellar/stellar-sdk'
export * as contract from '@stellar/stellar-sdk/contract'
export * as rpc from '@stellar/stellar-sdk/rpc'

if (typeof window !== 'undefined') {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CD7IQNLLEV2EN3JZ7SFC25RCPMETZWYGSBCJCSKQAD2XEKM56N332ZN2",
  }
} as const


export interface AutoUnstakeInfo {
  stake_amount: i128;
  stake_timestamp: u64;
}


/**
 * Contains all pool and router addresses for different protocols
 */
export interface PoolAddresses {
  /**
 * Aquarius pool address
 */
aquarius_pool: string;
  /**
 * Phoenix pool address
 */
phoenix_pool: string;
  /**
 * Soroswap pool address
 */
soroswap_pool: string;
  /**
 * Soroswap router address
 */
soroswap_router: string;
}


/**
 * Parameters for withdraw operations (different pools need different params)
 */
export interface WithdrawParams {
  /**
 * Minimum amount of token0 to receive (i128 for Soroswap/Phoenix, u128 for Aquarius)
 * For Aquarius, this will be cast from u128
 */
amount0_min: i128;
  /**
 * Minimum amount of token1 to receive (i128 for Soroswap/Phoenix, u128 for Aquarius)
 * For Aquarius, this will be cast from u128
 */
amount1_min: i128;
  /**
 * Amount LP for Phoenix (optional, usually not needed as we withdraw all)
 */
amount_lp: Option<i128>;
  /**
 * Auto-unstake flag for Phoenix (optional)
 */
auto_unstake: Option<boolean>;
  /**
 * Deadline for Soroswap/Phoenix (ledger number)
 */
deadline: Option<u64>;
}


/**
 * Parameters for add liquidity operations (different pools need different params)
 */
export interface AddLiquidityParams {
  /**
 * Amount of token0 to add (optional - if None, uses contract balance)
 */
amount0: Option<i128>;
  /**
 * Minimum amount of token0 to add (slippage protection)
 */
amount0_min: i128;
  /**
 * Amount of token1 to add (optional - if None, uses contract balance)
 */
amount1: Option<i128>;
  /**
 * Minimum amount of token1 to add (slippage protection)
 */
amount1_min: i128;
  /**
 * Deadline for Soroswap/Phoenix (ledger number)
 */
deadline: Option<u64>;
  /**
 * Slippage for Phoenix (optional, in basis points)
 */
slippage: Option<i64>;
}

export const ContractError = {
  401: {message:"NotAuthorized"},
  306: {message:"GetDepositAmountsMinABiggerThenDesiredA"},
  307: {message:"GetDepositAmountsMinBBiggerThenDesiredB"},
  308: {message:"GetDepositAmountsAmountABiggerThenDesiredA"},
  309: {message:"GetDepositAmountsAmountALessThenMinA"},
  310: {message:"GetDepositAmountsAmountBBiggerThenDesiredB"},
  311: {message:"GetDepositAmountsAmountBLessThenMinB"},
  313: {message:"DesiredAmountsBelowOrEqualZero"},
  314: {message:"MinAmountsBelowZero"},
  328: {message:"ContractMathError"},
  330: {message:"TokenTransferFailed"},
  /**
   * SoroswapRouter: insufficient a amount
   */
  405: {message:"InsufficientAAmount"},
  /**
   * SoroswapRouter: insufficient b amount
   */
  406: {message:"InsufficientBAmount"},
  407: {message:"RouterFactoryQueryFailed"},
  500: {message:"QueryPoolInfoFailed"},
  501: {message:"PoolInfoConversionError"},
  502: {message:"ProvideLiquidityFailed"},
  510: {message:"PoolToken0QueryFailed"},
  511: {message:"RouterGetReservesFailed"},
  512: {message:"RouterQuoteFailed"},
  513: {message:"RouterAddLiquidityFailed"},
  514: {message:"RouterRemoveLiquidityFailed"},
  520: {message:"AquariusGetTokensFailed"},
  521: {message:"AquariusDepositFailed"},
  522: {message:"AquariusWithdrawFailed"},
  523: {message:"AquariusShareIdQueryFailed"},
  530: {message:"PhoenixShareTokenQueryFailed"},
  531: {message:"PhoenixWithdrawLiquidityFailed"},
  540: {message:"LpTokenBalanceQueryFailed"},
  541: {message:"PoolLpBalanceQueryFailed"},
  542: {message:"RouterPairForFailed"},
  550: {message:"InvalidProtocol"},
  551: {message:"ZeroReserves"},
  552: {message:"ActivePositionExists"}
}

export interface Client {
  /**
   * Construct and simulate a init transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initialize the contract. Stores the pool `owner`, multisig `admin` (named `LOBSTER`), and the two token addresses.
   * Must only be called once during deployment.
   */
  init: ({owner, multisig, token0, token1, fee_cut_bps}: {owner: string, multisig: string, token0: string, token1: string, fee_cut_bps: u32}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a exit_reentrancy transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Reentrancy guard exit: clears the temporary flag.
   */
  exit_reentrancy: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_owner transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_owner: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a get_multisig transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_multisig: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a get_token0 transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_token0: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a get_token1 transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_token1: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a get_active_protocol transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_active_protocol: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_actual_pool transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_actual_pool: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a get_actual_router transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_actual_router: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a get_actual_share transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_actual_share: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a deposit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pull tokens from `caller` into this contract using `transfer_from`.
   * Access: only `owner` or multisig `admin`.
   */
  deposit: ({caller, amount0, amount1}: {caller: string, amount0: i128, amount1: i128}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a add_liquidity_phoenix transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  add_liquidity_phoenix: ({caller, amount0, amount1, amount0_min, amount1_min, pool_address, deadline, slippage}: {caller: string, amount0: i128, amount1: i128, amount0_min: i128, amount1_min: i128, pool_address: string, deadline: u64, slippage: i64}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_deposit_amounts transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_deposit_amounts: ({desired_a, min_a, desired_b, min_b, pool_balance_a, pool_balance_b, my_allowed_slippage}: {desired_a: i128, min_a: Option<i128>, desired_b: i128, min_b: Option<i128>, pool_balance_a: i128, pool_balance_b: i128, my_allowed_slippage: i64}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<readonly [i128, i128]>>

  /**
   * Construct and simulate a add_liquidity_soroswap transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  add_liquidity_soroswap: ({caller, amount0, amount1, amount0_min, amount1_min, deadline_ledger, router_address}: {caller: string, amount0: i128, amount1: i128, amount0_min: i128, amount1_min: i128, deadline_ledger: u64, router_address: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a add_liquidity_aquarius transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  add_liquidity_aquarius: ({caller, amount0, amount1, pool_address}: {caller: string, amount0: i128, amount1: i128, pool_address: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a withdraw_aquarius transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  withdraw_aquarius: ({caller, pool_address, amount0_min, amount1_min}: {caller: string, pool_address: string, amount0_min: u128, amount1_min: u128}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_lp_aquarius transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the current LP token balance and LP token address for an Aquarius pool.
   */
  get_lp_aquarius: ({pool_address}: {pool_address: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<readonly [i128, string]>>

  /**
   * Construct and simulate a withdraw_phoenix transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  withdraw_phoenix: ({caller, pool_address, amount0_min, amount1_min, deadline}: {caller: string, pool_address: string, amount0_min: i128, amount1_min: i128, deadline: u64}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_lp_phoenix transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the current LP token balance and LP token address for a Phoenix pool.
   */
  get_lp_phoenix: ({pool_address}: {pool_address: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<readonly [i128, string]>>

  /**
   * Construct and simulate a withdraw_soroswap transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  withdraw_soroswap: ({caller, amount0_min, amount1_min, pool_address, router_address, deadline}: {caller: string, amount0_min: i128, amount1_min: i128, pool_address: string, router_address: string, deadline: u64}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_lp_soroswap transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the current LP token balance for a Soroswap pool (LP token is the pool address).
   */
  get_lp_soroswap: ({pool_address}: {pool_address: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a migrate_pool transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  migrate_pool: ({caller, target_pool, pool_addresses, withdraw_params, add_liquidity_params}: {caller: string, target_pool: u32, pool_addresses: PoolAddresses, withdraw_params: WithdrawParams, add_liquidity_params: AddLiquidityParams}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a withdraw_contract transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  withdraw_contract: ({caller, amount0, amount1}: {caller: string, amount0: i128, amount1: i128}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a can_withdraw transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  can_withdraw: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a get_reserves transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_reserves: ({pool_address, protocol_tvl}: {pool_address: string, protocol_tvl: u32}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<readonly [i128, i128]>>

  /**
   * Construct and simulate a get_prices_from_reserves transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_prices_from_reserves: ({reserve0, reserve1}: {reserve0: i128, reserve1: i128}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<readonly [i128, i128]>>

  /**
   * Construct and simulate a get_token_tvl_from_reserves transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_token_tvl_from_reserves: ({amount0, amount1, price0_in_1, price1_in_0}: {amount0: i128, amount1: i128, price0_in_1: i128, price1_in_0: i128}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<readonly [i128, i128]>>

  /**
   * Construct and simulate a get_fee_cut transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_fee_cut: ({init_tvl0, init_tvl1, current_tvl0, current_tvl1, current_amount0, current_amount1}: {init_tvl0: i128, init_tvl1: i128, current_tvl0: i128, current_tvl1: i128, current_amount0: i128, current_amount1: i128}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<readonly [i128, i128]>>

  /**
   * Construct and simulate a transfer_fee_cut transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  transfer_fee_cut: ({correct_token, amount_fee_cut}: {correct_token: string, amount_fee_cut: i128}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_amounts_from_phoenix transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_amounts_from_phoenix: ({pool_address}: {pool_address: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<readonly [i128, i128]>>

  /**
   * Construct and simulate a get_amounts_from_soroswap transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_amounts_from_soroswap: ({pool_address}: {pool_address: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<readonly [i128, i128]>>

  /**
   * Construct and simulate a get_amounts_from_aquarius transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_amounts_from_aquarius: ({pool_address}: {pool_address: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<readonly [i128, i128]>>

  /**
   * Construct and simulate a get_amounts_tokens transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_amounts_tokens: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<readonly [i128, i128]>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAAAAAAAAAAAAAD0F1dG9VbnN0YWtlSW5mbwAAAAACAAAAAAAAAAxzdGFrZV9hbW91bnQAAAALAAAAAAAAAA9zdGFrZV90aW1lc3RhbXAAAAAABg==",
        "AAAAAQAAAD5Db250YWlucyBhbGwgcG9vbCBhbmQgcm91dGVyIGFkZHJlc3NlcyBmb3IgZGlmZmVyZW50IHByb3RvY29scwAAAAAAAAAAAA1Qb29sQWRkcmVzc2VzAAAAAAAABAAAABVBcXVhcml1cyBwb29sIGFkZHJlc3MAAAAAAAANYXF1YXJpdXNfcG9vbAAAAAAAABMAAAAUUGhvZW5peCBwb29sIGFkZHJlc3MAAAAMcGhvZW5peF9wb29sAAAAEwAAABVTb3Jvc3dhcCBwb29sIGFkZHJlc3MAAAAAAAANc29yb3N3YXBfcG9vbAAAAAAAABMAAAAXU29yb3N3YXAgcm91dGVyIGFkZHJlc3MAAAAAD3Nvcm9zd2FwX3JvdXRlcgAAAAAT",
        "AAAAAQAAAEpQYXJhbWV0ZXJzIGZvciB3aXRoZHJhdyBvcGVyYXRpb25zIChkaWZmZXJlbnQgcG9vbHMgbmVlZCBkaWZmZXJlbnQgcGFyYW1zKQAAAAAAAAAAAA5XaXRoZHJhd1BhcmFtcwAAAAAABQAAAHxNaW5pbXVtIGFtb3VudCBvZiB0b2tlbjAgdG8gcmVjZWl2ZSAoaTEyOCBmb3IgU29yb3N3YXAvUGhvZW5peCwgdTEyOCBmb3IgQXF1YXJpdXMpCkZvciBBcXVhcml1cywgdGhpcyB3aWxsIGJlIGNhc3QgZnJvbSB1MTI4AAAAC2Ftb3VudDBfbWluAAAAAAsAAAB8TWluaW11bSBhbW91bnQgb2YgdG9rZW4xIHRvIHJlY2VpdmUgKGkxMjggZm9yIFNvcm9zd2FwL1Bob2VuaXgsIHUxMjggZm9yIEFxdWFyaXVzKQpGb3IgQXF1YXJpdXMsIHRoaXMgd2lsbCBiZSBjYXN0IGZyb20gdTEyOAAAAAthbW91bnQxX21pbgAAAAALAAAAR0Ftb3VudCBMUCBmb3IgUGhvZW5peCAob3B0aW9uYWwsIHVzdWFsbHkgbm90IG5lZWRlZCBhcyB3ZSB3aXRoZHJhdyBhbGwpAAAAAAlhbW91bnRfbHAAAAAAAAPoAAAACwAAAChBdXRvLXVuc3Rha2UgZmxhZyBmb3IgUGhvZW5peCAob3B0aW9uYWwpAAAADGF1dG9fdW5zdGFrZQAAA+gAAAABAAAALURlYWRsaW5lIGZvciBTb3Jvc3dhcC9QaG9lbml4IChsZWRnZXIgbnVtYmVyKQAAAAAAAAhkZWFkbGluZQAAA+gAAAAG",
        "AAAAAQAAAE9QYXJhbWV0ZXJzIGZvciBhZGQgbGlxdWlkaXR5IG9wZXJhdGlvbnMgKGRpZmZlcmVudCBwb29scyBuZWVkIGRpZmZlcmVudCBwYXJhbXMpAAAAAAAAAAASQWRkTGlxdWlkaXR5UGFyYW1zAAAAAAAGAAAAQ0Ftb3VudCBvZiB0b2tlbjAgdG8gYWRkIChvcHRpb25hbCAtIGlmIE5vbmUsIHVzZXMgY29udHJhY3QgYmFsYW5jZSkAAAAAB2Ftb3VudDAAAAAD6AAAAAsAAAA1TWluaW11bSBhbW91bnQgb2YgdG9rZW4wIHRvIGFkZCAoc2xpcHBhZ2UgcHJvdGVjdGlvbikAAAAAAAALYW1vdW50MF9taW4AAAAACwAAAENBbW91bnQgb2YgdG9rZW4xIHRvIGFkZCAob3B0aW9uYWwgLSBpZiBOb25lLCB1c2VzIGNvbnRyYWN0IGJhbGFuY2UpAAAAAAdhbW91bnQxAAAAA+gAAAALAAAANU1pbmltdW0gYW1vdW50IG9mIHRva2VuMSB0byBhZGQgKHNsaXBwYWdlIHByb3RlY3Rpb24pAAAAAAAAC2Ftb3VudDFfbWluAAAAAAsAAAAtRGVhZGxpbmUgZm9yIFNvcm9zd2FwL1Bob2VuaXggKGxlZGdlciBudW1iZXIpAAAAAAAACGRlYWRsaW5lAAAD6AAAAAYAAAAwU2xpcHBhZ2UgZm9yIFBob2VuaXggKG9wdGlvbmFsLCBpbiBiYXNpcyBwb2ludHMpAAAACHNsaXBwYWdlAAAD6AAAAAc=",
        "AAAAAAAAAJ5Jbml0aWFsaXplIHRoZSBjb250cmFjdC4gU3RvcmVzIHRoZSBwb29sIGBvd25lcmAsIG11bHRpc2lnIGBhZG1pbmAgKG5hbWVkIGBMT0JTVEVSYCksIGFuZCB0aGUgdHdvIHRva2VuIGFkZHJlc3Nlcy4KTXVzdCBvbmx5IGJlIGNhbGxlZCBvbmNlIGR1cmluZyBkZXBsb3ltZW50LgAAAAAABGluaXQAAAAFAAAAAAAAAAVvd25lcgAAAAAAABMAAAAAAAAACG11bHRpc2lnAAAAEwAAAAAAAAAGdG9rZW4wAAAAAAATAAAAAAAAAAZ0b2tlbjEAAAAAABMAAAAAAAAAC2ZlZV9jdXRfYnBzAAAAAAQAAAAA",
        "AAAAAAAAADFSZWVudHJhbmN5IGd1YXJkIGV4aXQ6IGNsZWFycyB0aGUgdGVtcG9yYXJ5IGZsYWcuAAAAAAAAD2V4aXRfcmVlbnRyYW5jeQAAAAAAAAAAAA==",
        "AAAAAAAAAAAAAAAJZ2V0X293bmVyAAAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAAAAAAAMZ2V0X211bHRpc2lnAAAAAAAAAAEAAAAT",
        "AAAAAAAAAAAAAAAKZ2V0X3Rva2VuMAAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAAAAAAAKZ2V0X3Rva2VuMQAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAAAAAAATZ2V0X2FjdGl2ZV9wcm90b2NvbAAAAAAAAAAAAQAAAAQ=",
        "AAAAAAAAAAAAAAAPZ2V0X2FjdHVhbF9wb29sAAAAAAAAAAABAAAAEw==",
        "AAAAAAAAAAAAAAARZ2V0X2FjdHVhbF9yb3V0ZXIAAAAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAAAAAAAQZ2V0X2FjdHVhbF9zaGFyZQAAAAAAAAABAAAAEw==",
        "AAAAAAAAAG1QdWxsIHRva2VucyBmcm9tIGBjYWxsZXJgIGludG8gdGhpcyBjb250cmFjdCB1c2luZyBgdHJhbnNmZXJfZnJvbWAuCkFjY2Vzczogb25seSBgb3duZXJgIG9yIG11bHRpc2lnIGBhZG1pbmAuAAAAAAAAB2RlcG9zaXQAAAAAAwAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAdhbW91bnQwAAAAAAsAAAAAAAAAB2Ftb3VudDEAAAAACwAAAAA=",
        "AAAAAAAAAAAAAAAVYWRkX2xpcXVpZGl0eV9waG9lbml4AAAAAAAACAAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAdhbW91bnQwAAAAAAsAAAAAAAAAB2Ftb3VudDEAAAAACwAAAAAAAAALYW1vdW50MF9taW4AAAAACwAAAAAAAAALYW1vdW50MV9taW4AAAAACwAAAAAAAAAMcG9vbF9hZGRyZXNzAAAAEwAAAAAAAAAIZGVhZGxpbmUAAAAGAAAAAAAAAAhzbGlwcGFnZQAAAAcAAAAA",
        "AAAAAAAAAAAAAAATZ2V0X2RlcG9zaXRfYW1vdW50cwAAAAAHAAAAAAAAAAlkZXNpcmVkX2EAAAAAAAALAAAAAAAAAAVtaW5fYQAAAAAAA+gAAAALAAAAAAAAAAlkZXNpcmVkX2IAAAAAAAALAAAAAAAAAAVtaW5fYgAAAAAAA+gAAAALAAAAAAAAAA5wb29sX2JhbGFuY2VfYQAAAAAACwAAAAAAAAAOcG9vbF9iYWxhbmNlX2IAAAAAAAsAAAAAAAAAE215X2FsbG93ZWRfc2xpcHBhZ2UAAAAABwAAAAEAAAPtAAAAAgAAAAsAAAAL",
        "AAAAAAAAAAAAAAAWYWRkX2xpcXVpZGl0eV9zb3Jvc3dhcAAAAAAABwAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAdhbW91bnQwAAAAAAsAAAAAAAAAB2Ftb3VudDEAAAAACwAAAAAAAAALYW1vdW50MF9taW4AAAAACwAAAAAAAAALYW1vdW50MV9taW4AAAAACwAAAAAAAAAPZGVhZGxpbmVfbGVkZ2VyAAAAAAYAAAAAAAAADnJvdXRlcl9hZGRyZXNzAAAAAAATAAAAAA==",
        "AAAAAAAAAAAAAAAWYWRkX2xpcXVpZGl0eV9hcXVhcml1cwAAAAAABAAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAdhbW91bnQwAAAAAAsAAAAAAAAAB2Ftb3VudDEAAAAACwAAAAAAAAAMcG9vbF9hZGRyZXNzAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAARd2l0aGRyYXdfYXF1YXJpdXMAAAAAAAAEAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAADHBvb2xfYWRkcmVzcwAAABMAAAAAAAAAC2Ftb3VudDBfbWluAAAAAAoAAAAAAAAAC2Ftb3VudDFfbWluAAAAAAoAAAAA",
        "AAAAAAAAAE9SZXR1cm5zIHRoZSBjdXJyZW50IExQIHRva2VuIGJhbGFuY2UgYW5kIExQIHRva2VuIGFkZHJlc3MgZm9yIGFuIEFxdWFyaXVzIHBvb2wuAAAAAA9nZXRfbHBfYXF1YXJpdXMAAAAAAQAAAAAAAAAMcG9vbF9hZGRyZXNzAAAAEwAAAAEAAAPtAAAAAgAAAAsAAAAT",
        "AAAAAAAAAAAAAAAQd2l0aGRyYXdfcGhvZW5peAAAAAUAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAMcG9vbF9hZGRyZXNzAAAAEwAAAAAAAAALYW1vdW50MF9taW4AAAAACwAAAAAAAAALYW1vdW50MV9taW4AAAAACwAAAAAAAAAIZGVhZGxpbmUAAAAGAAAAAA==",
        "AAAAAAAAAE1SZXR1cm5zIHRoZSBjdXJyZW50IExQIHRva2VuIGJhbGFuY2UgYW5kIExQIHRva2VuIGFkZHJlc3MgZm9yIGEgUGhvZW5peCBwb29sLgAAAAAAAA5nZXRfbHBfcGhvZW5peAAAAAAAAQAAAAAAAAAMcG9vbF9hZGRyZXNzAAAAEwAAAAEAAAPtAAAAAgAAAAsAAAAT",
        "AAAAAAAAAAAAAAARd2l0aGRyYXdfc29yb3N3YXAAAAAAAAAGAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAAC2Ftb3VudDBfbWluAAAAAAsAAAAAAAAAC2Ftb3VudDFfbWluAAAAAAsAAAAAAAAADHBvb2xfYWRkcmVzcwAAABMAAAAAAAAADnJvdXRlcl9hZGRyZXNzAAAAAAATAAAAAAAAAAhkZWFkbGluZQAAAAYAAAAA",
        "AAAAAAAAAFhSZXR1cm5zIHRoZSBjdXJyZW50IExQIHRva2VuIGJhbGFuY2UgZm9yIGEgU29yb3N3YXAgcG9vbCAoTFAgdG9rZW4gaXMgdGhlIHBvb2wgYWRkcmVzcykuAAAAD2dldF9scF9zb3Jvc3dhcAAAAAABAAAAAAAAAAxwb29sX2FkZHJlc3MAAAATAAAAAQAAAAs=",
        "AAAAAAAAAAAAAAAMbWlncmF0ZV9wb29sAAAABQAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAt0YXJnZXRfcG9vbAAAAAAEAAAAAAAAAA5wb29sX2FkZHJlc3NlcwAAAAAH0AAAAA1Qb29sQWRkcmVzc2VzAAAAAAAAAAAAAA93aXRoZHJhd19wYXJhbXMAAAAH0AAAAA5XaXRoZHJhd1BhcmFtcwAAAAAAAAAAABRhZGRfbGlxdWlkaXR5X3BhcmFtcwAAB9AAAAASQWRkTGlxdWlkaXR5UGFyYW1zAAAAAAAA",
        "AAAAAAAAAAAAAAARd2l0aGRyYXdfY29udHJhY3QAAAAAAAADAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAAB2Ftb3VudDAAAAAACwAAAAAAAAAHYW1vdW50MQAAAAALAAAAAA==",
        "AAAAAAAAAAAAAAAMY2FuX3dpdGhkcmF3AAAAAAAAAAEAAAAB",
        "AAAAAAAAAAAAAAAMZ2V0X3Jlc2VydmVzAAAAAgAAAAAAAAAMcG9vbF9hZGRyZXNzAAAAEwAAAAAAAAAMcHJvdG9jb2xfdHZsAAAABAAAAAEAAAPtAAAAAgAAAAsAAAAL",
        "AAAAAAAAAAAAAAAYZ2V0X3ByaWNlc19mcm9tX3Jlc2VydmVzAAAAAgAAAAAAAAAIcmVzZXJ2ZTAAAAALAAAAAAAAAAhyZXNlcnZlMQAAAAsAAAABAAAD7QAAAAIAAAALAAAACw==",
        "AAAAAAAAAAAAAAAbZ2V0X3Rva2VuX3R2bF9mcm9tX3Jlc2VydmVzAAAAAAQAAAAAAAAAB2Ftb3VudDAAAAAACwAAAAAAAAAHYW1vdW50MQAAAAALAAAAAAAAAAtwcmljZTBfaW5fMQAAAAALAAAAAAAAAAtwcmljZTFfaW5fMAAAAAALAAAAAQAAA+0AAAACAAAACwAAAAs=",
        "AAAAAAAAAAAAAAALZ2V0X2ZlZV9jdXQAAAAABgAAAAAAAAAJaW5pdF90dmwwAAAAAAAACwAAAAAAAAAJaW5pdF90dmwxAAAAAAAACwAAAAAAAAAMY3VycmVudF90dmwwAAAACwAAAAAAAAAMY3VycmVudF90dmwxAAAACwAAAAAAAAAPY3VycmVudF9hbW91bnQwAAAAAAsAAAAAAAAAD2N1cnJlbnRfYW1vdW50MQAAAAALAAAAAQAAA+0AAAACAAAACwAAAAs=",
        "AAAAAAAAAAAAAAAQdHJhbnNmZXJfZmVlX2N1dAAAAAIAAAAAAAAADWNvcnJlY3RfdG9rZW4AAAAAAAATAAAAAAAAAA5hbW91bnRfZmVlX2N1dAAAAAAACwAAAAA=",
        "AAAAAAAAAAAAAAAYZ2V0X2Ftb3VudHNfZnJvbV9waG9lbml4AAAAAQAAAAAAAAAMcG9vbF9hZGRyZXNzAAAAEwAAAAEAAAPtAAAAAgAAAAsAAAAL",
        "AAAAAAAAAAAAAAAZZ2V0X2Ftb3VudHNfZnJvbV9zb3Jvc3dhcAAAAAAAAAEAAAAAAAAADHBvb2xfYWRkcmVzcwAAABMAAAABAAAD7QAAAAIAAAALAAAACw==",
        "AAAAAAAAAAAAAAAZZ2V0X2Ftb3VudHNfZnJvbV9hcXVhcml1cwAAAAAAAAEAAAAAAAAADHBvb2xfYWRkcmVzcwAAABMAAAABAAAD7QAAAAIAAAALAAAACw==",
        "AAAAAAAAAAAAAAASZ2V0X2Ftb3VudHNfdG9rZW5zAAAAAAAAAAAAAQAAA+0AAAACAAAACwAAAAs=",
        "AAAABAAAAAAAAAAAAAAADUNvbnRyYWN0RXJyb3IAAAAAAAAiAAAAAAAAAA1Ob3RBdXRob3JpemVkAAAAAAABkQAAAAAAAAAnR2V0RGVwb3NpdEFtb3VudHNNaW5BQmlnZ2VyVGhlbkRlc2lyZWRBAAAAATIAAAAAAAAAJ0dldERlcG9zaXRBbW91bnRzTWluQkJpZ2dlclRoZW5EZXNpcmVkQgAAAAEzAAAAAAAAACpHZXREZXBvc2l0QW1vdW50c0Ftb3VudEFCaWdnZXJUaGVuRGVzaXJlZEEAAAAAATQAAAAAAAAAJEdldERlcG9zaXRBbW91bnRzQW1vdW50QUxlc3NUaGVuTWluQQAAATUAAAAAAAAAKkdldERlcG9zaXRBbW91bnRzQW1vdW50QkJpZ2dlclRoZW5EZXNpcmVkQgAAAAABNgAAAAAAAAAkR2V0RGVwb3NpdEFtb3VudHNBbW91bnRCTGVzc1RoZW5NaW5CAAABNwAAAAAAAAAeRGVzaXJlZEFtb3VudHNCZWxvd09yRXF1YWxaZXJvAAAAAAE5AAAAAAAAABNNaW5BbW91bnRzQmVsb3daZXJvAAAAAToAAAAAAAAAEUNvbnRyYWN0TWF0aEVycm9yAAAAAAABSAAAAAAAAAATVG9rZW5UcmFuc2ZlckZhaWxlZAAAAAFKAAAAJVNvcm9zd2FwUm91dGVyOiBpbnN1ZmZpY2llbnQgYSBhbW91bnQAAAAAAAATSW5zdWZmaWNpZW50QUFtb3VudAAAAAGVAAAAJVNvcm9zd2FwUm91dGVyOiBpbnN1ZmZpY2llbnQgYiBhbW91bnQAAAAAAAATSW5zdWZmaWNpZW50QkFtb3VudAAAAAGWAAAAAAAAABhSb3V0ZXJGYWN0b3J5UXVlcnlGYWlsZWQAAAGXAAAAAAAAABNRdWVyeVBvb2xJbmZvRmFpbGVkAAAAAfQAAAAAAAAAF1Bvb2xJbmZvQ29udmVyc2lvbkVycm9yAAAAAfUAAAAAAAAAFlByb3ZpZGVMaXF1aWRpdHlGYWlsZWQAAAAAAfYAAAAAAAAAFVBvb2xUb2tlbjBRdWVyeUZhaWxlZAAAAAAAAf4AAAAAAAAAF1JvdXRlckdldFJlc2VydmVzRmFpbGVkAAAAAf8AAAAAAAAAEVJvdXRlclF1b3RlRmFpbGVkAAAAAAACAAAAAAAAAAAYUm91dGVyQWRkTGlxdWlkaXR5RmFpbGVkAAACAQAAAAAAAAAbUm91dGVyUmVtb3ZlTGlxdWlkaXR5RmFpbGVkAAAAAgIAAAAAAAAAF0FxdWFyaXVzR2V0VG9rZW5zRmFpbGVkAAAAAggAAAAAAAAAFUFxdWFyaXVzRGVwb3NpdEZhaWxlZAAAAAAAAgkAAAAAAAAAFkFxdWFyaXVzV2l0aGRyYXdGYWlsZWQAAAAAAgoAAAAAAAAAGkFxdWFyaXVzU2hhcmVJZFF1ZXJ5RmFpbGVkAAAAAAILAAAAAAAAABxQaG9lbml4U2hhcmVUb2tlblF1ZXJ5RmFpbGVkAAACEgAAAAAAAAAeUGhvZW5peFdpdGhkcmF3TGlxdWlkaXR5RmFpbGVkAAAAAAITAAAAAAAAABlMcFRva2VuQmFsYW5jZVF1ZXJ5RmFpbGVkAAAAAAACHAAAAAAAAAAYUG9vbExwQmFsYW5jZVF1ZXJ5RmFpbGVkAAACHQAAAAAAAAATUm91dGVyUGFpckZvckZhaWxlZAAAAAIeAAAAAAAAAA9JbnZhbGlkUHJvdG9jb2wAAAACJgAAAAAAAAAMWmVyb1Jlc2VydmVzAAACJwAAAAAAAAAUQWN0aXZlUG9zaXRpb25FeGlzdHMAAAIo" ]),
      options
    )
  }
  public readonly fromJSON = {
    init: this.txFromJSON<null>,
        exit_reentrancy: this.txFromJSON<null>,
        get_owner: this.txFromJSON<string>,
        get_multisig: this.txFromJSON<string>,
        get_token0: this.txFromJSON<string>,
        get_token1: this.txFromJSON<string>,
        get_active_protocol: this.txFromJSON<u32>,
        get_actual_pool: this.txFromJSON<string>,
        get_actual_router: this.txFromJSON<string>,
        get_actual_share: this.txFromJSON<string>,
        deposit: this.txFromJSON<null>,
        add_liquidity_phoenix: this.txFromJSON<null>,
        get_deposit_amounts: this.txFromJSON<readonly [i128, i128]>,
        add_liquidity_soroswap: this.txFromJSON<null>,
        add_liquidity_aquarius: this.txFromJSON<null>,
        withdraw_aquarius: this.txFromJSON<null>,
        get_lp_aquarius: this.txFromJSON<readonly [i128, string]>,
        withdraw_phoenix: this.txFromJSON<null>,
        get_lp_phoenix: this.txFromJSON<readonly [i128, string]>,
        withdraw_soroswap: this.txFromJSON<null>,
        get_lp_soroswap: this.txFromJSON<i128>,
        migrate_pool: this.txFromJSON<null>,
        withdraw_contract: this.txFromJSON<null>,
        can_withdraw: this.txFromJSON<boolean>,
        get_reserves: this.txFromJSON<readonly [i128, i128]>,
        get_prices_from_reserves: this.txFromJSON<readonly [i128, i128]>,
        get_token_tvl_from_reserves: this.txFromJSON<readonly [i128, i128]>,
        get_fee_cut: this.txFromJSON<readonly [i128, i128]>,
        transfer_fee_cut: this.txFromJSON<null>,
        get_amounts_from_phoenix: this.txFromJSON<readonly [i128, i128]>,
        get_amounts_from_soroswap: this.txFromJSON<readonly [i128, i128]>,
        get_amounts_from_aquarius: this.txFromJSON<readonly [i128, i128]>,
        get_amounts_tokens: this.txFromJSON<readonly [i128, i128]>
  }
}