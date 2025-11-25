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
  unknown: {
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    contractId: "CCEAT4ZVH7NF6CQEC4BVP4SBPWKSKN4JFL7OGPXNLAXKHTZ5MH4GJXTV",
  }, 
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CBTEWEPH5QHIDR4NNA3HJ2H2CSGCKG6MYOPR7DQUVEKCUKSI75ZJ3C3B",
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
  524: {message:"AquariusReserveTooLarge"},
  530: {message:"PhoenixShareTokenQueryFailed"},
  531: {message:"PhoenixWithdrawLiquidityFailed"},
  540: {message:"LpTokenBalanceQueryFailed"},
  541: {message:"PoolLpBalanceQueryFailed"},
  542: {message:"RouterPairForFailed"},
  550: {message:"InvalidProtocol"},
  551: {message:"ZeroReserves"},
  552: {message:"ActivePositionExists"},
  560: {message:"AlreadyInitialized"},
  561: {message:"InvalidFeeValue"},
  562: {message:"InvalidAmount"},
  563: {message:"NotInitialized"},
  564: {message:"ReentrancyDetected"}
}

export interface Client {
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
   * Construct and simulate a reset_reentrancy transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Emergency function to reset reentrancy flag if it gets stuck.
   * This can happen if a panic occurs after `enter_reentrancy` but before `exit_reentrancy`.
   * The flag will eventually expire with temporary storage TTL, but this provides immediate recovery.
   * 
   * # Parameters
   * - `caller`: The address calling this function (must be owner or admin)
   * 
   * # Access
   * Only owner or multisig admin
   * 
   * # Panics
   * - If caller is not owner or admin
   */
  reset_reentrancy: ({caller}: {caller: string}, options?: {
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
   * Returns the address of the contract owner.
   * 
   * # Returns
   * The owner address stored during initialization
   * 
   * # Panics
   * If contract is not initialized
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
   * Returns the address of the multisig admin (LOBSTER).
   * 
   * # Returns
   * The multisig admin address stored during initialization
   * 
   * # Panics
   * If contract is not initialized
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
   * Construct and simulate a set_multisig transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Updates the multisig admin (LOBSTER) address.
   * 
   * # Parameters
   * - `caller`: Must be either the pool owner or current multisig admin
   * - `new_multisig`: The new multisig admin address to store
   * 
   * # Access
   * Only owner or multisig admin
   * 
   * # Panics
   * - If contract is not initialized
   * - If caller is not authorized
   */
  set_multisig: ({caller, new_multisig}: {caller: string, new_multisig: string}, options?: {
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
   * Construct and simulate a get_token0 transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the address of the first token (token0) in the pair.
   * 
   * # Returns
   * The token0 address stored during initialization
   * 
   * # Panics
   * If contract is not initialized
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
   * Returns the address of the second token (token1) in the pair.
   * 
   * # Returns
   * The token1 address stored during initialization
   * 
   * # Panics
   * If contract is not initialized
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
   * Returns the currently active DEX protocol identifier.
   * 
   * # Returns
   * Protocol identifier: 0 = Soroswap, 1 = Phoenix, 2 = Aquarius, 5 = No active position
   * 
   * # Panics
   * If contract is not initialized
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
  }) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_actual_pool transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the address of the currently active liquidity pool.
   * 
   * # Returns
   * The pool address where liquidity is currently deployed
   * 
   * # Panics
   * If contract is not initialized or no active pool exists
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
   * Returns the address of the currently active router (for Soroswap).
   * 
   * # Returns
   * The router address used for Soroswap operations
   * 
   * # Panics
   * If contract is not initialized or no active router exists
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
   * Returns the address of the LP token/share token for the active position.
   * 
   * # Returns
   * The LP token address representing the current liquidity position
   * 
   * # Panics
   * If contract is not initialized or no active position exists
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
   * Public entry point for adding liquidity to a Phoenix pool.
   * Validates access and delegates to internal implementation.
   * 
   * # Parameters
   * - `caller`: Address of the caller (must be owner or multisig admin)
   * - `amount0`: Desired amount of token0 to add
   * - `amount1`: Desired amount of token1 to add
   * - `amount0_min`: Minimum amount of token0 to accept (slippage protection)
   * - `amount1_min`: Minimum amount of token1 to accept (slippage protection)
   * - `pool_address`: Address of the Phoenix pool
   * - `deadline`: Ledger number deadline for the transaction
   * - `slippage`: Allowed slippage in basis points
   * 
   * # Access
   * Only owner or multisig admin
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
   * Calculates optimal deposit amounts for adding liquidity while maintaining pool ratio.
   * Ensures amounts respect minimum requirements and allowed slippage.
   * 
   * # Parameters
   * - `desired_a`: Desired amount of token A to deposit
   * - `min_a`: Optional minimum amount of token A (slippage protection)
   * - `desired_b`: Desired amount of token B to deposit
   * - `min_b`: Optional minimum amount of token B (slippage protection)
   * - `pool_balance_a`: Current balance of token A in the pool
   * - `pool_balance_b`: Current balance of token B in the pool
   * - `my_allowed_slippage`: Allowed slippage in basis points
   * 
   * # Returns
   * Tuple of (optimal_amount_a, optimal_amount_b) that maintains pool ratio
   * 
   * # Panics
   * - If desired amounts are <= 0
   * - If min amounts are negative
   * - If calculated amounts exceed allowed slippage
   * - If calculated amounts are below minimum requirements
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
   * Public entry point for adding liquidity to a Soroswap pool via router.
   * Validates access and delegates to internal implementation.
   * 
   * # Parameters
   * - `caller`: Address of the caller (must be owner or multisig admin)
   * - `amount0`: Desired amount of token0 to add
   * - `amount1`: Desired amount of token1 to add
   * - `amount0_min`: Minimum amount of token0 to accept (slippage protection)
   * - `amount1_min`: Minimum amount of token1 to accept (slippage protection)
   * - `deadline_ledger`: Ledger number deadline for the transaction
   * - `router_address`: Address of the Soroswap router
   * 
   * # Access
   * Only owner or multisig admin
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
   * Public entry point for adding liquidity to an Aquarius pool.
   * Validates access and delegates to internal implementation.
   * 
   * # Parameters
   * - `caller`: Address of the caller (must be owner or multisig admin)
   * - `amount0`: Amount of token0 to add
   * - `amount1`: Amount of token1 to add
   * - `pool_address`: Address of the Aquarius pool
   * 
   * # Access
   * Only owner or multisig admin
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
   * Public entry point for withdrawing all liquidity from an Aquarius pool.
   * Validates access and delegates to internal implementation.
   * 
   * # Parameters
   * - `caller`: Address of the caller (must be owner or multisig admin)
   * - `pool_address`: Address of the Aquarius pool to withdraw from
   * - `amount0_min`: Minimum amount of token0 to receive (slippage protection)
   * - `amount1_min`: Minimum amount of token1 to receive (slippage protection)
   * 
   * # Access
   * Only owner or multisig admin
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
   * 
   * # Parameters
   * - `pool_address`: Address of the Aquarius pool
   * 
   * # Returns
   * Tuple of (lp_balance, lp_token_address) - current LP balance and LP token contract address
   * 
   * # Panics
   * If pool queries fail
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
   * Public entry point for withdrawing all liquidity from a Phoenix pool.
   * Validates access and delegates to internal implementation.
   * 
   * # Parameters
   * - `caller`: Address of the caller (must be owner or multisig admin)
   * - `pool_address`: Address of the Phoenix pool to withdraw from
   * - `amount0_min`: Minimum amount of token0 to receive (slippage protection)
   * - `amount1_min`: Minimum amount of token1 to receive (slippage protection)
   * - `deadline`: Ledger number deadline for the transaction
   * 
   * # Access
   * Only owner or multisig admin
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
   * 
   * # Parameters
   * - `pool_address`: Address of the Phoenix pool
   * 
   * # Returns
   * Tuple of (lp_balance, lp_token_address) - current LP balance and LP token contract address
   * 
   * # Panics
   * If pool queries fail
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
   * Public entry point for withdrawing all liquidity from a Soroswap pool via router.
   * Validates access and delegates to internal implementation.
   * 
   * # Parameters
   * - `caller`: Address of the caller (must be owner or multisig admin)
   * - `amount0_min`: Minimum amount of token0 to receive (slippage protection)
   * - `amount1_min`: Minimum amount of token1 to receive (slippage protection)
   * - `pool_address`: Address of the Soroswap pool to withdraw from
   * - `router_address`: Address of the Soroswap router
   * - `deadline`: Ledger number deadline for the transaction
   * 
   * # Access
   * Only owner or multisig admin
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
   * Returns the current LP token balance for a Soroswap pool.
   * In Soroswap, the LP token is the pool address itself.
   * 
   * # Parameters
   * - `pool_address`: Address of the Soroswap pool (also the LP token address)
   * 
   * # Returns
   * Current LP token balance held by this contract
   * 
   * # Panics
   * If balance query fails
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
   * Construct and simulate a withdraw_contract transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Public entry point for withdrawing tokens directly from the contract balance.
   * Transfers tokens from contract to owner without interacting with pools.
   * 
   * # Parameters
   * - `caller`: Address of the caller (must be owner or multisig admin)
   * - `amount0`: Amount of token0 to withdraw
   * - `amount1`: Amount of token1 to withdraw
   * 
   * # Access
   * Only owner or multisig admin
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
   * Construct and simulate a get_reserves transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Retrieves token reserves from a pool, handling different DEX protocols.
   * Returns reserves in pool order (not contract order) to maintain consistency
   * with amounts from correct_token_order and TVL calculations.
   * 
   * # Parameters
   * - `pool_address`: Address of the liquidity pool
   * - `protocol_tvl`: Protocol identifier (0 = Soroswap, 1 = Phoenix, 2 = Aquarius)
   * 
   * # Returns
   * Tuple of (reserve0, reserve1) in pool order (pool's token0, pool's token1)
   * 
   * # Panics
   * - If protocol is invalid
   * - If reserves are zero
   * - If pool query fails
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
   * Calculates token prices from pool reserves.
   * 
   * # Parameters
   * - `reserve0`: Reserve amount of token0 in the pool
   * - `reserve1`: Reserve amount of token1 in the pool
   * 
   * # Returns
   * Tuple of (price_0_in_1, price_1_in_0) where:
   * - price_0_in_1: Price of token0 denominated in token1
   * - price_1_in_0: Price of token1 denominated in token0
   * 
   * # Panics
   * - If reserves are zero (division by zero)
   * - On arithmetic overflow
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
   * Calculates Total Value Locked (TVL) for both tokens in the position.
   * TVL represents the total value of tokens, accounting for their relative prices.
   * 
   * # Parameters
   * - `amount0`: Amount of token0
   * - `amount1`: Amount of token1
   * - `price0_in_1`: Price of token0 in terms of token1
   * - `price1_in_0`: Price of token1 in terms of token0
   * 
   * # Returns
   * Tuple of (token0_tvl, token1_tvl) where:
   * - token0_tvl: Total value of position in token0 terms
   * - token1_tvl: Total value of position in token1 terms
   * 
   * # Panics
   * On arithmetic overflow
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
   * Calculates the fee amount to be deducted from profits on each token.
   * Fee is calculated as a percentage of total profit, distributed proportionally.
   * 
   * # Parameters
   * - `init_tvl0`: Initial TVL in token0 terms when position was opened
   * - `init_tvl1`: Initial TVL in token1 terms when position was opened
   * - `current_tvl0`: Current TVL in token0 terms
   * - `current_tvl1`: Current TVL in token1 terms
   * - `current_amount0`: Current amount of token0
   * - `current_amount1`: Current amount of token1
   * 
   * # Returns
   * Tuple of (fee_token0, fee_token1) - fee amounts in each token
   * Returns (0, 0) if there's no profit or total TVL is zero
   * 
   * # Panics
   * On arithmetic overflow
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
   * Construct and simulate a get_amounts_from_phoenix transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Retrieves the underlying token amounts represented by LP position in a Phoenix pool.
   * 
   * # Parameters
   * - `pool_address`: Address of the Phoenix pool
   * 
   * # Returns
   * Tuple of (amount_a, amount_b) ordered to match contract's token0/token1
   * 
   * # Panics
   * If pool query fails or LP balance cannot be determined
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
   * Retrieves the underlying token amounts represented by LP position in a Soroswap pool.
   * Calculates amounts proportionally based on LP share of total supply.
   * 
   * # Parameters
   * - `pool_address`: Address of the Soroswap pool
   * 
   * # Returns
   * Tuple of (amount_a, amount_b) ordered to match contract's token0/token1
   * 
   * # Panics
   * If pool query fails or calculation overflows
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
   * Retrieves the underlying token amounts represented by LP position in an Aquarius pool.
   * Calculates amounts proportionally based on LP share of total supply.
   * 
   * # Parameters
   * - `pool_address`: Address of the Aquarius pool
   * 
   * # Returns
   * Tuple of (amount_a, amount_b) ordered to match contract's token0/token1
   * 
   * # Panics
   * If pool query fails or calculation overflows
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
   * Returns the current token balances held directly by this contract (not in pools).
   * 
   * # Returns
   * Tuple of (amount0, amount1) - current balances of token0 and token1 in contract
   * 
   * # Panics
   * If token balance queries fail
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
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {owner, multisig, token0, token1, fee_cut_bps}: {owner: string, multisig: string, token0: string, token1: string, fee_cut_bps: u32},
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
    return ContractClient.deploy({owner, multisig, token0, token1, fee_cut_bps}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAAAAAAAAAAAAAD0F1dG9VbnN0YWtlSW5mbwAAAAACAAAAAAAAAAxzdGFrZV9hbW91bnQAAAALAAAAAAAAAA9zdGFrZV90aW1lc3RhbXAAAAAABg==",
        "AAAAAQAAAD5Db250YWlucyBhbGwgcG9vbCBhbmQgcm91dGVyIGFkZHJlc3NlcyBmb3IgZGlmZmVyZW50IHByb3RvY29scwAAAAAAAAAAAA1Qb29sQWRkcmVzc2VzAAAAAAAABAAAABVBcXVhcml1cyBwb29sIGFkZHJlc3MAAAAAAAANYXF1YXJpdXNfcG9vbAAAAAAAABMAAAAUUGhvZW5peCBwb29sIGFkZHJlc3MAAAAMcGhvZW5peF9wb29sAAAAEwAAABVTb3Jvc3dhcCBwb29sIGFkZHJlc3MAAAAAAAANc29yb3N3YXBfcG9vbAAAAAAAABMAAAAXU29yb3N3YXAgcm91dGVyIGFkZHJlc3MAAAAAD3Nvcm9zd2FwX3JvdXRlcgAAAAAT",
        "AAAAAQAAAEpQYXJhbWV0ZXJzIGZvciB3aXRoZHJhdyBvcGVyYXRpb25zIChkaWZmZXJlbnQgcG9vbHMgbmVlZCBkaWZmZXJlbnQgcGFyYW1zKQAAAAAAAAAAAA5XaXRoZHJhd1BhcmFtcwAAAAAABQAAAHxNaW5pbXVtIGFtb3VudCBvZiB0b2tlbjAgdG8gcmVjZWl2ZSAoaTEyOCBmb3IgU29yb3N3YXAvUGhvZW5peCwgdTEyOCBmb3IgQXF1YXJpdXMpCkZvciBBcXVhcml1cywgdGhpcyB3aWxsIGJlIGNhc3QgZnJvbSB1MTI4AAAAC2Ftb3VudDBfbWluAAAAAAsAAAB8TWluaW11bSBhbW91bnQgb2YgdG9rZW4xIHRvIHJlY2VpdmUgKGkxMjggZm9yIFNvcm9zd2FwL1Bob2VuaXgsIHUxMjggZm9yIEFxdWFyaXVzKQpGb3IgQXF1YXJpdXMsIHRoaXMgd2lsbCBiZSBjYXN0IGZyb20gdTEyOAAAAAthbW91bnQxX21pbgAAAAALAAAAR0Ftb3VudCBMUCBmb3IgUGhvZW5peCAob3B0aW9uYWwsIHVzdWFsbHkgbm90IG5lZWRlZCBhcyB3ZSB3aXRoZHJhdyBhbGwpAAAAAAlhbW91bnRfbHAAAAAAAAPoAAAACwAAAChBdXRvLXVuc3Rha2UgZmxhZyBmb3IgUGhvZW5peCAob3B0aW9uYWwpAAAADGF1dG9fdW5zdGFrZQAAA+gAAAABAAAALURlYWRsaW5lIGZvciBTb3Jvc3dhcC9QaG9lbml4IChsZWRnZXIgbnVtYmVyKQAAAAAAAAhkZWFkbGluZQAAA+gAAAAG",
        "AAAAAQAAAE9QYXJhbWV0ZXJzIGZvciBhZGQgbGlxdWlkaXR5IG9wZXJhdGlvbnMgKGRpZmZlcmVudCBwb29scyBuZWVkIGRpZmZlcmVudCBwYXJhbXMpAAAAAAAAAAASQWRkTGlxdWlkaXR5UGFyYW1zAAAAAAAGAAAAQ0Ftb3VudCBvZiB0b2tlbjAgdG8gYWRkIChvcHRpb25hbCAtIGlmIE5vbmUsIHVzZXMgY29udHJhY3QgYmFsYW5jZSkAAAAAB2Ftb3VudDAAAAAD6AAAAAsAAAA1TWluaW11bSBhbW91bnQgb2YgdG9rZW4wIHRvIGFkZCAoc2xpcHBhZ2UgcHJvdGVjdGlvbikAAAAAAAALYW1vdW50MF9taW4AAAAACwAAAENBbW91bnQgb2YgdG9rZW4xIHRvIGFkZCAob3B0aW9uYWwgLSBpZiBOb25lLCB1c2VzIGNvbnRyYWN0IGJhbGFuY2UpAAAAAAdhbW91bnQxAAAAA+gAAAALAAAANU1pbmltdW0gYW1vdW50IG9mIHRva2VuMSB0byBhZGQgKHNsaXBwYWdlIHByb3RlY3Rpb24pAAAAAAAAC2Ftb3VudDFfbWluAAAAAAsAAAAtRGVhZGxpbmUgZm9yIFNvcm9zd2FwL1Bob2VuaXggKGxlZGdlciBudW1iZXIpAAAAAAAACGRlYWRsaW5lAAAD6AAAAAYAAAAwU2xpcHBhZ2UgZm9yIFBob2VuaXggKG9wdGlvbmFsLCBpbiBiYXNpcyBwb2ludHMpAAAACHNsaXBwYWdlAAAD6AAAAAc=",
        "AAAAAAAAAgtJbml0aWFsaXplcyB0aGUgTG9ic3RlciBjb250cmFjdCB3aXRoIG93bmVyLCBtdWx0aXNpZyBhZG1pbiwgdG9rZW4gcGFpciwgYW5kIGZlZSBjb25maWd1cmF0aW9uLgoKIyBQYXJhbWV0ZXJzCi0gYG93bmVyYDogVGhlIGFkZHJlc3Mgb2YgdGhlIHBvb2wgb3duZXIgd2hvIGNhbiBtYW5hZ2UgcG9zaXRpb25zCi0gYG11bHRpc2lnYDogVGhlIGFkZHJlc3Mgb2YgdGhlIG11bHRpc2lnIGFkbWluIChMT0JTVEVSKSB0aGF0IGNhbiBhbHNvIG1hbmFnZSBwb3NpdGlvbnMKLSBgdG9rZW4wYDogQWRkcmVzcyBvZiB0aGUgZmlyc3QgdG9rZW4gaW4gdGhlIHBhaXIKLSBgdG9rZW4xYDogQWRkcmVzcyBvZiB0aGUgc2Vjb25kIHRva2VuIGluIHRoZSBwYWlyCi0gYGZlZV9jdXRfYnBzYDogRmVlIHBlcmNlbnRhZ2UgaW4gYmFzaXMgcG9pbnRzICgwLTEwMDAwLCB3aGVyZSAxMDAwMCA9IDEwMCUpCgojIFBhbmljcwotIElmIGNvbnRyYWN0IGlzIGFscmVhZHkgaW5pdGlhbGl6ZWQKLSBJZiBmZWVfY3V0X2JwcyBleGNlZWRzIDEwMDAwAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAABQAAAAAAAAAFb3duZXIAAAAAAAATAAAAAAAAAAhtdWx0aXNpZwAAABMAAAAAAAAABnRva2VuMAAAAAAAEwAAAAAAAAAGdG9rZW4xAAAAAAATAAAAAAAAAAtmZWVfY3V0X2JwcwAAAAAEAAAAAA==",
        "AAAAAAAAADFSZWVudHJhbmN5IGd1YXJkIGV4aXQ6IGNsZWFycyB0aGUgdGVtcG9yYXJ5IGZsYWcuAAAAAAAAD2V4aXRfcmVlbnRyYW5jeQAAAAAAAAAAAA==",
        "AAAAAAAAAaBFbWVyZ2VuY3kgZnVuY3Rpb24gdG8gcmVzZXQgcmVlbnRyYW5jeSBmbGFnIGlmIGl0IGdldHMgc3R1Y2suClRoaXMgY2FuIGhhcHBlbiBpZiBhIHBhbmljIG9jY3VycyBhZnRlciBgZW50ZXJfcmVlbnRyYW5jeWAgYnV0IGJlZm9yZSBgZXhpdF9yZWVudHJhbmN5YC4KVGhlIGZsYWcgd2lsbCBldmVudHVhbGx5IGV4cGlyZSB3aXRoIHRlbXBvcmFyeSBzdG9yYWdlIFRUTCwgYnV0IHRoaXMgcHJvdmlkZXMgaW1tZWRpYXRlIHJlY292ZXJ5LgoKIyBQYXJhbWV0ZXJzCi0gYGNhbGxlcmA6IFRoZSBhZGRyZXNzIGNhbGxpbmcgdGhpcyBmdW5jdGlvbiAobXVzdCBiZSBvd25lciBvciBhZG1pbikKCiMgQWNjZXNzCk9ubHkgb3duZXIgb3IgbXVsdGlzaWcgYWRtaW4KCiMgUGFuaWNzCi0gSWYgY2FsbGVyIGlzIG5vdCBvd25lciBvciBhZG1pbgAAABByZXNldF9yZWVudHJhbmN5AAAAAQAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAA==",
        "AAAAAAAAAI1SZXR1cm5zIHRoZSBhZGRyZXNzIG9mIHRoZSBjb250cmFjdCBvd25lci4KCiMgUmV0dXJucwpUaGUgb3duZXIgYWRkcmVzcyBzdG9yZWQgZHVyaW5nIGluaXRpYWxpemF0aW9uCgojIFBhbmljcwpJZiBjb250cmFjdCBpcyBub3QgaW5pdGlhbGl6ZWQAAAAAAAAJZ2V0X293bmVyAAAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAKBSZXR1cm5zIHRoZSBhZGRyZXNzIG9mIHRoZSBtdWx0aXNpZyBhZG1pbiAoTE9CU1RFUikuCgojIFJldHVybnMKVGhlIG11bHRpc2lnIGFkbWluIGFkZHJlc3Mgc3RvcmVkIGR1cmluZyBpbml0aWFsaXphdGlvbgoKIyBQYW5pY3MKSWYgY29udHJhY3QgaXMgbm90IGluaXRpYWxpemVkAAAADGdldF9tdWx0aXNpZwAAAAAAAAABAAAAEw==",
        "AAAAAAAAASlVcGRhdGVzIHRoZSBtdWx0aXNpZyBhZG1pbiAoTE9CU1RFUikgYWRkcmVzcy4KCiMgUGFyYW1ldGVycwotIGBjYWxsZXJgOiBNdXN0IGJlIGVpdGhlciB0aGUgcG9vbCBvd25lciBvciBjdXJyZW50IG11bHRpc2lnIGFkbWluCi0gYG5ld19tdWx0aXNpZ2A6IFRoZSBuZXcgbXVsdGlzaWcgYWRtaW4gYWRkcmVzcyB0byBzdG9yZQoKIyBBY2Nlc3MKT25seSBvd25lciBvciBtdWx0aXNpZyBhZG1pbgoKIyBQYW5pY3MKLSBJZiBjb250cmFjdCBpcyBub3QgaW5pdGlhbGl6ZWQKLSBJZiBjYWxsZXIgaXMgbm90IGF1dGhvcml6ZWQAAAAAAAAMc2V0X211bHRpc2lnAAAAAgAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAxuZXdfbXVsdGlzaWcAAAATAAAAAA==",
        "AAAAAAAAAKBSZXR1cm5zIHRoZSBhZGRyZXNzIG9mIHRoZSBmaXJzdCB0b2tlbiAodG9rZW4wKSBpbiB0aGUgcGFpci4KCiMgUmV0dXJucwpUaGUgdG9rZW4wIGFkZHJlc3Mgc3RvcmVkIGR1cmluZyBpbml0aWFsaXphdGlvbgoKIyBQYW5pY3MKSWYgY29udHJhY3QgaXMgbm90IGluaXRpYWxpemVkAAAACmdldF90b2tlbjAAAAAAAAAAAAABAAAAEw==",
        "AAAAAAAAAKFSZXR1cm5zIHRoZSBhZGRyZXNzIG9mIHRoZSBzZWNvbmQgdG9rZW4gKHRva2VuMSkgaW4gdGhlIHBhaXIuCgojIFJldHVybnMKVGhlIHRva2VuMSBhZGRyZXNzIHN0b3JlZCBkdXJpbmcgaW5pdGlhbGl6YXRpb24KCiMgUGFuaWNzCklmIGNvbnRyYWN0IGlzIG5vdCBpbml0aWFsaXplZAAAAAAAAApnZXRfdG9rZW4xAAAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAL5SZXR1cm5zIHRoZSBjdXJyZW50bHkgYWN0aXZlIERFWCBwcm90b2NvbCBpZGVudGlmaWVyLgoKIyBSZXR1cm5zClByb3RvY29sIGlkZW50aWZpZXI6IDAgPSBTb3Jvc3dhcCwgMSA9IFBob2VuaXgsIDIgPSBBcXVhcml1cywgNSA9IE5vIGFjdGl2ZSBwb3NpdGlvbgoKIyBQYW5pY3MKSWYgY29udHJhY3QgaXMgbm90IGluaXRpYWxpemVkAAAAAAATZ2V0X2FjdGl2ZV9wcm90b2NvbAAAAAAAAAAAAQAAAAs=",
        "AAAAAAAAAL9SZXR1cm5zIHRoZSBhZGRyZXNzIG9mIHRoZSBjdXJyZW50bHkgYWN0aXZlIGxpcXVpZGl0eSBwb29sLgoKIyBSZXR1cm5zClRoZSBwb29sIGFkZHJlc3Mgd2hlcmUgbGlxdWlkaXR5IGlzIGN1cnJlbnRseSBkZXBsb3llZAoKIyBQYW5pY3MKSWYgY29udHJhY3QgaXMgbm90IGluaXRpYWxpemVkIG9yIG5vIGFjdGl2ZSBwb29sIGV4aXN0cwAAAAAPZ2V0X2FjdHVhbF9wb29sAAAAAAAAAAABAAAAEw==",
        "AAAAAAAAAMFSZXR1cm5zIHRoZSBhZGRyZXNzIG9mIHRoZSBjdXJyZW50bHkgYWN0aXZlIHJvdXRlciAoZm9yIFNvcm9zd2FwKS4KCiMgUmV0dXJucwpUaGUgcm91dGVyIGFkZHJlc3MgdXNlZCBmb3IgU29yb3N3YXAgb3BlcmF0aW9ucwoKIyBQYW5pY3MKSWYgY29udHJhY3QgaXMgbm90IGluaXRpYWxpemVkIG9yIG5vIGFjdGl2ZSByb3V0ZXIgZXhpc3RzAAAAAAAAEWdldF9hY3R1YWxfcm91dGVyAAAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAANpSZXR1cm5zIHRoZSBhZGRyZXNzIG9mIHRoZSBMUCB0b2tlbi9zaGFyZSB0b2tlbiBmb3IgdGhlIGFjdGl2ZSBwb3NpdGlvbi4KCiMgUmV0dXJucwpUaGUgTFAgdG9rZW4gYWRkcmVzcyByZXByZXNlbnRpbmcgdGhlIGN1cnJlbnQgbGlxdWlkaXR5IHBvc2l0aW9uCgojIFBhbmljcwpJZiBjb250cmFjdCBpcyBub3QgaW5pdGlhbGl6ZWQgb3Igbm8gYWN0aXZlIHBvc2l0aW9uIGV4aXN0cwAAAAAAEGdldF9hY3R1YWxfc2hhcmUAAAAAAAAAAQAAABM=",
        "AAAAAAAAAG1QdWxsIHRva2VucyBmcm9tIGBjYWxsZXJgIGludG8gdGhpcyBjb250cmFjdCB1c2luZyBgdHJhbnNmZXJfZnJvbWAuCkFjY2Vzczogb25seSBgb3duZXJgIG9yIG11bHRpc2lnIGBhZG1pbmAuAAAAAAAAB2RlcG9zaXQAAAAAAwAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAdhbW91bnQwAAAAAAsAAAAAAAAAB2Ftb3VudDEAAAAACwAAAAA=",
        "AAAAAAAAAnJQdWJsaWMgZW50cnkgcG9pbnQgZm9yIGFkZGluZyBsaXF1aWRpdHkgdG8gYSBQaG9lbml4IHBvb2wuClZhbGlkYXRlcyBhY2Nlc3MgYW5kIGRlbGVnYXRlcyB0byBpbnRlcm5hbCBpbXBsZW1lbnRhdGlvbi4KCiMgUGFyYW1ldGVycwotIGBjYWxsZXJgOiBBZGRyZXNzIG9mIHRoZSBjYWxsZXIgKG11c3QgYmUgb3duZXIgb3IgbXVsdGlzaWcgYWRtaW4pCi0gYGFtb3VudDBgOiBEZXNpcmVkIGFtb3VudCBvZiB0b2tlbjAgdG8gYWRkCi0gYGFtb3VudDFgOiBEZXNpcmVkIGFtb3VudCBvZiB0b2tlbjEgdG8gYWRkCi0gYGFtb3VudDBfbWluYDogTWluaW11bSBhbW91bnQgb2YgdG9rZW4wIHRvIGFjY2VwdCAoc2xpcHBhZ2UgcHJvdGVjdGlvbikKLSBgYW1vdW50MV9taW5gOiBNaW5pbXVtIGFtb3VudCBvZiB0b2tlbjEgdG8gYWNjZXB0IChzbGlwcGFnZSBwcm90ZWN0aW9uKQotIGBwb29sX2FkZHJlc3NgOiBBZGRyZXNzIG9mIHRoZSBQaG9lbml4IHBvb2wKLSBgZGVhZGxpbmVgOiBMZWRnZXIgbnVtYmVyIGRlYWRsaW5lIGZvciB0aGUgdHJhbnNhY3Rpb24KLSBgc2xpcHBhZ2VgOiBBbGxvd2VkIHNsaXBwYWdlIGluIGJhc2lzIHBvaW50cwoKIyBBY2Nlc3MKT25seSBvd25lciBvciBtdWx0aXNpZyBhZG1pbgAAAAAAFWFkZF9saXF1aWRpdHlfcGhvZW5peAAAAAAAAAgAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAHYW1vdW50MAAAAAALAAAAAAAAAAdhbW91bnQxAAAAAAsAAAAAAAAAC2Ftb3VudDBfbWluAAAAAAsAAAAAAAAAC2Ftb3VudDFfbWluAAAAAAsAAAAAAAAADHBvb2xfYWRkcmVzcwAAABMAAAAAAAAACGRlYWRsaW5lAAAABgAAAAAAAAAIc2xpcHBhZ2UAAAAHAAAAAA==",
        "AAAAAAAAA0ZDYWxjdWxhdGVzIG9wdGltYWwgZGVwb3NpdCBhbW91bnRzIGZvciBhZGRpbmcgbGlxdWlkaXR5IHdoaWxlIG1haW50YWluaW5nIHBvb2wgcmF0aW8uCkVuc3VyZXMgYW1vdW50cyByZXNwZWN0IG1pbmltdW0gcmVxdWlyZW1lbnRzIGFuZCBhbGxvd2VkIHNsaXBwYWdlLgoKIyBQYXJhbWV0ZXJzCi0gYGRlc2lyZWRfYWA6IERlc2lyZWQgYW1vdW50IG9mIHRva2VuIEEgdG8gZGVwb3NpdAotIGBtaW5fYWA6IE9wdGlvbmFsIG1pbmltdW0gYW1vdW50IG9mIHRva2VuIEEgKHNsaXBwYWdlIHByb3RlY3Rpb24pCi0gYGRlc2lyZWRfYmA6IERlc2lyZWQgYW1vdW50IG9mIHRva2VuIEIgdG8gZGVwb3NpdAotIGBtaW5fYmA6IE9wdGlvbmFsIG1pbmltdW0gYW1vdW50IG9mIHRva2VuIEIgKHNsaXBwYWdlIHByb3RlY3Rpb24pCi0gYHBvb2xfYmFsYW5jZV9hYDogQ3VycmVudCBiYWxhbmNlIG9mIHRva2VuIEEgaW4gdGhlIHBvb2wKLSBgcG9vbF9iYWxhbmNlX2JgOiBDdXJyZW50IGJhbGFuY2Ugb2YgdG9rZW4gQiBpbiB0aGUgcG9vbAotIGBteV9hbGxvd2VkX3NsaXBwYWdlYDogQWxsb3dlZCBzbGlwcGFnZSBpbiBiYXNpcyBwb2ludHMKCiMgUmV0dXJucwpUdXBsZSBvZiAob3B0aW1hbF9hbW91bnRfYSwgb3B0aW1hbF9hbW91bnRfYikgdGhhdCBtYWludGFpbnMgcG9vbCByYXRpbwoKIyBQYW5pY3MKLSBJZiBkZXNpcmVkIGFtb3VudHMgYXJlIDw9IDAKLSBJZiBtaW4gYW1vdW50cyBhcmUgbmVnYXRpdmUKLSBJZiBjYWxjdWxhdGVkIGFtb3VudHMgZXhjZWVkIGFsbG93ZWQgc2xpcHBhZ2UKLSBJZiBjYWxjdWxhdGVkIGFtb3VudHMgYXJlIGJlbG93IG1pbmltdW0gcmVxdWlyZW1lbnRzAAAAAAATZ2V0X2RlcG9zaXRfYW1vdW50cwAAAAAHAAAAAAAAAAlkZXNpcmVkX2EAAAAAAAALAAAAAAAAAAVtaW5fYQAAAAAAA+gAAAALAAAAAAAAAAlkZXNpcmVkX2IAAAAAAAALAAAAAAAAAAVtaW5fYgAAAAAAA+gAAAALAAAAAAAAAA5wb29sX2JhbGFuY2VfYQAAAAAACwAAAAAAAAAOcG9vbF9iYWxhbmNlX2IAAAAAAAsAAAAAAAAAE215X2FsbG93ZWRfc2xpcHBhZ2UAAAAABwAAAAEAAAPtAAAAAgAAAAsAAAAL",
        "AAAAAAAAAltQdWJsaWMgZW50cnkgcG9pbnQgZm9yIGFkZGluZyBsaXF1aWRpdHkgdG8gYSBTb3Jvc3dhcCBwb29sIHZpYSByb3V0ZXIuClZhbGlkYXRlcyBhY2Nlc3MgYW5kIGRlbGVnYXRlcyB0byBpbnRlcm5hbCBpbXBsZW1lbnRhdGlvbi4KCiMgUGFyYW1ldGVycwotIGBjYWxsZXJgOiBBZGRyZXNzIG9mIHRoZSBjYWxsZXIgKG11c3QgYmUgb3duZXIgb3IgbXVsdGlzaWcgYWRtaW4pCi0gYGFtb3VudDBgOiBEZXNpcmVkIGFtb3VudCBvZiB0b2tlbjAgdG8gYWRkCi0gYGFtb3VudDFgOiBEZXNpcmVkIGFtb3VudCBvZiB0b2tlbjEgdG8gYWRkCi0gYGFtb3VudDBfbWluYDogTWluaW11bSBhbW91bnQgb2YgdG9rZW4wIHRvIGFjY2VwdCAoc2xpcHBhZ2UgcHJvdGVjdGlvbikKLSBgYW1vdW50MV9taW5gOiBNaW5pbXVtIGFtb3VudCBvZiB0b2tlbjEgdG8gYWNjZXB0IChzbGlwcGFnZSBwcm90ZWN0aW9uKQotIGBkZWFkbGluZV9sZWRnZXJgOiBMZWRnZXIgbnVtYmVyIGRlYWRsaW5lIGZvciB0aGUgdHJhbnNhY3Rpb24KLSBgcm91dGVyX2FkZHJlc3NgOiBBZGRyZXNzIG9mIHRoZSBTb3Jvc3dhcCByb3V0ZXIKCiMgQWNjZXNzCk9ubHkgb3duZXIgb3IgbXVsdGlzaWcgYWRtaW4AAAAAFmFkZF9saXF1aWRpdHlfc29yb3N3YXAAAAAAAAcAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAHYW1vdW50MAAAAAALAAAAAAAAAAdhbW91bnQxAAAAAAsAAAAAAAAAC2Ftb3VudDBfbWluAAAAAAsAAAAAAAAAC2Ftb3VudDFfbWluAAAAAAsAAAAAAAAAD2RlYWRsaW5lX2xlZGdlcgAAAAAGAAAAAAAAAA5yb3V0ZXJfYWRkcmVzcwAAAAAAEwAAAAA=",
        "AAAAAAAAAWlQdWJsaWMgZW50cnkgcG9pbnQgZm9yIGFkZGluZyBsaXF1aWRpdHkgdG8gYW4gQXF1YXJpdXMgcG9vbC4KVmFsaWRhdGVzIGFjY2VzcyBhbmQgZGVsZWdhdGVzIHRvIGludGVybmFsIGltcGxlbWVudGF0aW9uLgoKIyBQYXJhbWV0ZXJzCi0gYGNhbGxlcmA6IEFkZHJlc3Mgb2YgdGhlIGNhbGxlciAobXVzdCBiZSBvd25lciBvciBtdWx0aXNpZyBhZG1pbikKLSBgYW1vdW50MGA6IEFtb3VudCBvZiB0b2tlbjAgdG8gYWRkCi0gYGFtb3VudDFgOiBBbW91bnQgb2YgdG9rZW4xIHRvIGFkZAotIGBwb29sX2FkZHJlc3NgOiBBZGRyZXNzIG9mIHRoZSBBcXVhcml1cyBwb29sCgojIEFjY2VzcwpPbmx5IG93bmVyIG9yIG11bHRpc2lnIGFkbWluAAAAAAAAFmFkZF9saXF1aWRpdHlfYXF1YXJpdXMAAAAAAAQAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAHYW1vdW50MAAAAAALAAAAAAAAAAdhbW91bnQxAAAAAAsAAAAAAAAADHBvb2xfYWRkcmVzcwAAABMAAAAA",
        "AAAAAAAAAdFQdWJsaWMgZW50cnkgcG9pbnQgZm9yIHdpdGhkcmF3aW5nIGFsbCBsaXF1aWRpdHkgZnJvbSBhbiBBcXVhcml1cyBwb29sLgpWYWxpZGF0ZXMgYWNjZXNzIGFuZCBkZWxlZ2F0ZXMgdG8gaW50ZXJuYWwgaW1wbGVtZW50YXRpb24uCgojIFBhcmFtZXRlcnMKLSBgY2FsbGVyYDogQWRkcmVzcyBvZiB0aGUgY2FsbGVyIChtdXN0IGJlIG93bmVyIG9yIG11bHRpc2lnIGFkbWluKQotIGBwb29sX2FkZHJlc3NgOiBBZGRyZXNzIG9mIHRoZSBBcXVhcml1cyBwb29sIHRvIHdpdGhkcmF3IGZyb20KLSBgYW1vdW50MF9taW5gOiBNaW5pbXVtIGFtb3VudCBvZiB0b2tlbjAgdG8gcmVjZWl2ZSAoc2xpcHBhZ2UgcHJvdGVjdGlvbikKLSBgYW1vdW50MV9taW5gOiBNaW5pbXVtIGFtb3VudCBvZiB0b2tlbjEgdG8gcmVjZWl2ZSAoc2xpcHBhZ2UgcHJvdGVjdGlvbikKCiMgQWNjZXNzCk9ubHkgb3duZXIgb3IgbXVsdGlzaWcgYWRtaW4AAAAAAAARd2l0aGRyYXdfYXF1YXJpdXMAAAAAAAAEAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAADHBvb2xfYWRkcmVzcwAAABMAAAAAAAAAC2Ftb3VudDBfbWluAAAAAAoAAAAAAAAAC2Ftb3VudDFfbWluAAAAAAoAAAAA",
        "AAAAAAAAARFSZXR1cm5zIHRoZSBjdXJyZW50IExQIHRva2VuIGJhbGFuY2UgYW5kIExQIHRva2VuIGFkZHJlc3MgZm9yIGFuIEFxdWFyaXVzIHBvb2wuCgojIFBhcmFtZXRlcnMKLSBgcG9vbF9hZGRyZXNzYDogQWRkcmVzcyBvZiB0aGUgQXF1YXJpdXMgcG9vbAoKIyBSZXR1cm5zClR1cGxlIG9mIChscF9iYWxhbmNlLCBscF90b2tlbl9hZGRyZXNzKSAtIGN1cnJlbnQgTFAgYmFsYW5jZSBhbmQgTFAgdG9rZW4gY29udHJhY3QgYWRkcmVzcwoKIyBQYW5pY3MKSWYgcG9vbCBxdWVyaWVzIGZhaWwAAAAAAAAPZ2V0X2xwX2FxdWFyaXVzAAAAAAEAAAAAAAAADHBvb2xfYWRkcmVzcwAAABMAAAABAAAD7QAAAAIAAAALAAAAEw==",
        "AAAAAAAAAgdQdWJsaWMgZW50cnkgcG9pbnQgZm9yIHdpdGhkcmF3aW5nIGFsbCBsaXF1aWRpdHkgZnJvbSBhIFBob2VuaXggcG9vbC4KVmFsaWRhdGVzIGFjY2VzcyBhbmQgZGVsZWdhdGVzIHRvIGludGVybmFsIGltcGxlbWVudGF0aW9uLgoKIyBQYXJhbWV0ZXJzCi0gYGNhbGxlcmA6IEFkZHJlc3Mgb2YgdGhlIGNhbGxlciAobXVzdCBiZSBvd25lciBvciBtdWx0aXNpZyBhZG1pbikKLSBgcG9vbF9hZGRyZXNzYDogQWRkcmVzcyBvZiB0aGUgUGhvZW5peCBwb29sIHRvIHdpdGhkcmF3IGZyb20KLSBgYW1vdW50MF9taW5gOiBNaW5pbXVtIGFtb3VudCBvZiB0b2tlbjAgdG8gcmVjZWl2ZSAoc2xpcHBhZ2UgcHJvdGVjdGlvbikKLSBgYW1vdW50MV9taW5gOiBNaW5pbXVtIGFtb3VudCBvZiB0b2tlbjEgdG8gcmVjZWl2ZSAoc2xpcHBhZ2UgcHJvdGVjdGlvbikKLSBgZGVhZGxpbmVgOiBMZWRnZXIgbnVtYmVyIGRlYWRsaW5lIGZvciB0aGUgdHJhbnNhY3Rpb24KCiMgQWNjZXNzCk9ubHkgb3duZXIgb3IgbXVsdGlzaWcgYWRtaW4AAAAAEHdpdGhkcmF3X3Bob2VuaXgAAAAFAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAADHBvb2xfYWRkcmVzcwAAABMAAAAAAAAAC2Ftb3VudDBfbWluAAAAAAsAAAAAAAAAC2Ftb3VudDFfbWluAAAAAAsAAAAAAAAACGRlYWRsaW5lAAAABgAAAAA=",
        "AAAAAAAAAQ5SZXR1cm5zIHRoZSBjdXJyZW50IExQIHRva2VuIGJhbGFuY2UgYW5kIExQIHRva2VuIGFkZHJlc3MgZm9yIGEgUGhvZW5peCBwb29sLgoKIyBQYXJhbWV0ZXJzCi0gYHBvb2xfYWRkcmVzc2A6IEFkZHJlc3Mgb2YgdGhlIFBob2VuaXggcG9vbAoKIyBSZXR1cm5zClR1cGxlIG9mIChscF9iYWxhbmNlLCBscF90b2tlbl9hZGRyZXNzKSAtIGN1cnJlbnQgTFAgYmFsYW5jZSBhbmQgTFAgdG9rZW4gY29udHJhY3QgYWRkcmVzcwoKIyBQYW5pY3MKSWYgcG9vbCBxdWVyaWVzIGZhaWwAAAAAAA5nZXRfbHBfcGhvZW5peAAAAAAAAQAAAAAAAAAMcG9vbF9hZGRyZXNzAAAAEwAAAAEAAAPtAAAAAgAAAAsAAAAT",
        "AAAAAAAAAkdQdWJsaWMgZW50cnkgcG9pbnQgZm9yIHdpdGhkcmF3aW5nIGFsbCBsaXF1aWRpdHkgZnJvbSBhIFNvcm9zd2FwIHBvb2wgdmlhIHJvdXRlci4KVmFsaWRhdGVzIGFjY2VzcyBhbmQgZGVsZWdhdGVzIHRvIGludGVybmFsIGltcGxlbWVudGF0aW9uLgoKIyBQYXJhbWV0ZXJzCi0gYGNhbGxlcmA6IEFkZHJlc3Mgb2YgdGhlIGNhbGxlciAobXVzdCBiZSBvd25lciBvciBtdWx0aXNpZyBhZG1pbikKLSBgYW1vdW50MF9taW5gOiBNaW5pbXVtIGFtb3VudCBvZiB0b2tlbjAgdG8gcmVjZWl2ZSAoc2xpcHBhZ2UgcHJvdGVjdGlvbikKLSBgYW1vdW50MV9taW5gOiBNaW5pbXVtIGFtb3VudCBvZiB0b2tlbjEgdG8gcmVjZWl2ZSAoc2xpcHBhZ2UgcHJvdGVjdGlvbikKLSBgcG9vbF9hZGRyZXNzYDogQWRkcmVzcyBvZiB0aGUgU29yb3N3YXAgcG9vbCB0byB3aXRoZHJhdyBmcm9tCi0gYHJvdXRlcl9hZGRyZXNzYDogQWRkcmVzcyBvZiB0aGUgU29yb3N3YXAgcm91dGVyCi0gYGRlYWRsaW5lYDogTGVkZ2VyIG51bWJlciBkZWFkbGluZSBmb3IgdGhlIHRyYW5zYWN0aW9uCgojIEFjY2VzcwpPbmx5IG93bmVyIG9yIG11bHRpc2lnIGFkbWluAAAAABF3aXRoZHJhd19zb3Jvc3dhcAAAAAAAAAYAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAALYW1vdW50MF9taW4AAAAACwAAAAAAAAALYW1vdW50MV9taW4AAAAACwAAAAAAAAAMcG9vbF9hZGRyZXNzAAAAEwAAAAAAAAAOcm91dGVyX2FkZHJlc3MAAAAAABMAAAAAAAAACGRlYWRsaW5lAAAABgAAAAA=",
        "AAAAAAAAASNSZXR1cm5zIHRoZSBjdXJyZW50IExQIHRva2VuIGJhbGFuY2UgZm9yIGEgU29yb3N3YXAgcG9vbC4KSW4gU29yb3N3YXAsIHRoZSBMUCB0b2tlbiBpcyB0aGUgcG9vbCBhZGRyZXNzIGl0c2VsZi4KCiMgUGFyYW1ldGVycwotIGBwb29sX2FkZHJlc3NgOiBBZGRyZXNzIG9mIHRoZSBTb3Jvc3dhcCBwb29sIChhbHNvIHRoZSBMUCB0b2tlbiBhZGRyZXNzKQoKIyBSZXR1cm5zCkN1cnJlbnQgTFAgdG9rZW4gYmFsYW5jZSBoZWxkIGJ5IHRoaXMgY29udHJhY3QKCiMgUGFuaWNzCklmIGJhbGFuY2UgcXVlcnkgZmFpbHMAAAAAD2dldF9scF9zb3Jvc3dhcAAAAAABAAAAAAAAAAxwb29sX2FkZHJlc3MAAAATAAAAAQAAAAs=",
        "AAAAAAAAAWJQdWJsaWMgZW50cnkgcG9pbnQgZm9yIHdpdGhkcmF3aW5nIHRva2VucyBkaXJlY3RseSBmcm9tIHRoZSBjb250cmFjdCBiYWxhbmNlLgpUcmFuc2ZlcnMgdG9rZW5zIGZyb20gY29udHJhY3QgdG8gb3duZXIgd2l0aG91dCBpbnRlcmFjdGluZyB3aXRoIHBvb2xzLgoKIyBQYXJhbWV0ZXJzCi0gYGNhbGxlcmA6IEFkZHJlc3Mgb2YgdGhlIGNhbGxlciAobXVzdCBiZSBvd25lciBvciBtdWx0aXNpZyBhZG1pbikKLSBgYW1vdW50MGA6IEFtb3VudCBvZiB0b2tlbjAgdG8gd2l0aGRyYXcKLSBgYW1vdW50MWA6IEFtb3VudCBvZiB0b2tlbjEgdG8gd2l0aGRyYXcKCiMgQWNjZXNzCk9ubHkgb3duZXIgb3IgbXVsdGlzaWcgYWRtaW4AAAAAABF3aXRoZHJhd19jb250cmFjdAAAAAAAAAMAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAHYW1vdW50MAAAAAALAAAAAAAAAAdhbW91bnQxAAAAAAsAAAAA",
        "AAAAAAAAAgNSZXRyaWV2ZXMgdG9rZW4gcmVzZXJ2ZXMgZnJvbSBhIHBvb2wsIGhhbmRsaW5nIGRpZmZlcmVudCBERVggcHJvdG9jb2xzLgpSZXR1cm5zIHJlc2VydmVzIGluIHBvb2wgb3JkZXIgKG5vdCBjb250cmFjdCBvcmRlcikgdG8gbWFpbnRhaW4gY29uc2lzdGVuY3kKd2l0aCBhbW91bnRzIGZyb20gY29ycmVjdF90b2tlbl9vcmRlciBhbmQgVFZMIGNhbGN1bGF0aW9ucy4KCiMgUGFyYW1ldGVycwotIGBwb29sX2FkZHJlc3NgOiBBZGRyZXNzIG9mIHRoZSBsaXF1aWRpdHkgcG9vbAotIGBwcm90b2NvbF90dmxgOiBQcm90b2NvbCBpZGVudGlmaWVyICgwID0gU29yb3N3YXAsIDEgPSBQaG9lbml4LCAyID0gQXF1YXJpdXMpCgojIFJldHVybnMKVHVwbGUgb2YgKHJlc2VydmUwLCByZXNlcnZlMSkgaW4gcG9vbCBvcmRlciAocG9vbCdzIHRva2VuMCwgcG9vbCdzIHRva2VuMSkKCiMgUGFuaWNzCi0gSWYgcHJvdG9jb2wgaXMgaW52YWxpZAotIElmIHJlc2VydmVzIGFyZSB6ZXJvCi0gSWYgcG9vbCBxdWVyeSBmYWlscwAAAAAMZ2V0X3Jlc2VydmVzAAAAAgAAAAAAAAAMcG9vbF9hZGRyZXNzAAAAEwAAAAAAAAAMcHJvdG9jb2xfdHZsAAAABAAAAAEAAAPtAAAAAgAAAAsAAAAL",
        "AAAAAAAAAZBDYWxjdWxhdGVzIHRva2VuIHByaWNlcyBmcm9tIHBvb2wgcmVzZXJ2ZXMuCgojIFBhcmFtZXRlcnMKLSBgcmVzZXJ2ZTBgOiBSZXNlcnZlIGFtb3VudCBvZiB0b2tlbjAgaW4gdGhlIHBvb2wKLSBgcmVzZXJ2ZTFgOiBSZXNlcnZlIGFtb3VudCBvZiB0b2tlbjEgaW4gdGhlIHBvb2wKCiMgUmV0dXJucwpUdXBsZSBvZiAocHJpY2VfMF9pbl8xLCBwcmljZV8xX2luXzApIHdoZXJlOgotIHByaWNlXzBfaW5fMTogUHJpY2Ugb2YgdG9rZW4wIGRlbm9taW5hdGVkIGluIHRva2VuMQotIHByaWNlXzFfaW5fMDogUHJpY2Ugb2YgdG9rZW4xIGRlbm9taW5hdGVkIGluIHRva2VuMAoKIyBQYW5pY3MKLSBJZiByZXNlcnZlcyBhcmUgemVybyAoZGl2aXNpb24gYnkgemVybykKLSBPbiBhcml0aG1ldGljIG92ZXJmbG93AAAAGGdldF9wcmljZXNfZnJvbV9yZXNlcnZlcwAAAAIAAAAAAAAACHJlc2VydmUwAAAACwAAAAAAAAAIcmVzZXJ2ZTEAAAALAAAAAQAAA+0AAAACAAAACwAAAAs=",
        "AAAAAAAAAgdDYWxjdWxhdGVzIFRvdGFsIFZhbHVlIExvY2tlZCAoVFZMKSBmb3IgYm90aCB0b2tlbnMgaW4gdGhlIHBvc2l0aW9uLgpUVkwgcmVwcmVzZW50cyB0aGUgdG90YWwgdmFsdWUgb2YgdG9rZW5zLCBhY2NvdW50aW5nIGZvciB0aGVpciByZWxhdGl2ZSBwcmljZXMuCgojIFBhcmFtZXRlcnMKLSBgYW1vdW50MGA6IEFtb3VudCBvZiB0b2tlbjAKLSBgYW1vdW50MWA6IEFtb3VudCBvZiB0b2tlbjEKLSBgcHJpY2UwX2luXzFgOiBQcmljZSBvZiB0b2tlbjAgaW4gdGVybXMgb2YgdG9rZW4xCi0gYHByaWNlMV9pbl8wYDogUHJpY2Ugb2YgdG9rZW4xIGluIHRlcm1zIG9mIHRva2VuMAoKIyBSZXR1cm5zClR1cGxlIG9mICh0b2tlbjBfdHZsLCB0b2tlbjFfdHZsKSB3aGVyZToKLSB0b2tlbjBfdHZsOiBUb3RhbCB2YWx1ZSBvZiBwb3NpdGlvbiBpbiB0b2tlbjAgdGVybXMKLSB0b2tlbjFfdHZsOiBUb3RhbCB2YWx1ZSBvZiBwb3NpdGlvbiBpbiB0b2tlbjEgdGVybXMKCiMgUGFuaWNzCk9uIGFyaXRobWV0aWMgb3ZlcmZsb3cAAAAAG2dldF90b2tlbl90dmxfZnJvbV9yZXNlcnZlcwAAAAAEAAAAAAAAAAdhbW91bnQwAAAAAAsAAAAAAAAAB2Ftb3VudDEAAAAACwAAAAAAAAALcHJpY2UwX2luXzEAAAAACwAAAAAAAAALcHJpY2UxX2luXzAAAAAACwAAAAEAAAPtAAAAAgAAAAsAAAAL",
        "AAAAAAAAAoRDYWxjdWxhdGVzIHRoZSBmZWUgYW1vdW50IHRvIGJlIGRlZHVjdGVkIGZyb20gcHJvZml0cyBvbiBlYWNoIHRva2VuLgpGZWUgaXMgY2FsY3VsYXRlZCBhcyBhIHBlcmNlbnRhZ2Ugb2YgdG90YWwgcHJvZml0LCBkaXN0cmlidXRlZCBwcm9wb3J0aW9uYWxseS4KCiMgUGFyYW1ldGVycwotIGBpbml0X3R2bDBgOiBJbml0aWFsIFRWTCBpbiB0b2tlbjAgdGVybXMgd2hlbiBwb3NpdGlvbiB3YXMgb3BlbmVkCi0gYGluaXRfdHZsMWA6IEluaXRpYWwgVFZMIGluIHRva2VuMSB0ZXJtcyB3aGVuIHBvc2l0aW9uIHdhcyBvcGVuZWQKLSBgY3VycmVudF90dmwwYDogQ3VycmVudCBUVkwgaW4gdG9rZW4wIHRlcm1zCi0gYGN1cnJlbnRfdHZsMWA6IEN1cnJlbnQgVFZMIGluIHRva2VuMSB0ZXJtcwotIGBjdXJyZW50X2Ftb3VudDBgOiBDdXJyZW50IGFtb3VudCBvZiB0b2tlbjAKLSBgY3VycmVudF9hbW91bnQxYDogQ3VycmVudCBhbW91bnQgb2YgdG9rZW4xCgojIFJldHVybnMKVHVwbGUgb2YgKGZlZV90b2tlbjAsIGZlZV90b2tlbjEpIC0gZmVlIGFtb3VudHMgaW4gZWFjaCB0b2tlbgpSZXR1cm5zICgwLCAwKSBpZiB0aGVyZSdzIG5vIHByb2ZpdCBvciB0b3RhbCBUVkwgaXMgemVybwoKIyBQYW5pY3MKT24gYXJpdGhtZXRpYyBvdmVyZmxvdwAAAAtnZXRfZmVlX2N1dAAAAAAGAAAAAAAAAAlpbml0X3R2bDAAAAAAAAALAAAAAAAAAAlpbml0X3R2bDEAAAAAAAALAAAAAAAAAAxjdXJyZW50X3R2bDAAAAALAAAAAAAAAAxjdXJyZW50X3R2bDEAAAALAAAAAAAAAA9jdXJyZW50X2Ftb3VudDAAAAAACwAAAAAAAAAPY3VycmVudF9hbW91bnQxAAAAAAsAAAABAAAD7QAAAAIAAAALAAAACw==",
        "AAAAAAAAASRSZXRyaWV2ZXMgdGhlIHVuZGVybHlpbmcgdG9rZW4gYW1vdW50cyByZXByZXNlbnRlZCBieSBMUCBwb3NpdGlvbiBpbiBhIFBob2VuaXggcG9vbC4KCiMgUGFyYW1ldGVycwotIGBwb29sX2FkZHJlc3NgOiBBZGRyZXNzIG9mIHRoZSBQaG9lbml4IHBvb2wKCiMgUmV0dXJucwpUdXBsZSBvZiAoYW1vdW50X2EsIGFtb3VudF9iKSBvcmRlcmVkIHRvIG1hdGNoIGNvbnRyYWN0J3MgdG9rZW4wL3Rva2VuMQoKIyBQYW5pY3MKSWYgcG9vbCBxdWVyeSBmYWlscyBvciBMUCBiYWxhbmNlIGNhbm5vdCBiZSBkZXRlcm1pbmVkAAAAGGdldF9hbW91bnRzX2Zyb21fcGhvZW5peAAAAAEAAAAAAAAADHBvb2xfYWRkcmVzcwAAABMAAAABAAAD7QAAAAIAAAALAAAACw==",
        "AAAAAAAAAWFSZXRyaWV2ZXMgdGhlIHVuZGVybHlpbmcgdG9rZW4gYW1vdW50cyByZXByZXNlbnRlZCBieSBMUCBwb3NpdGlvbiBpbiBhIFNvcm9zd2FwIHBvb2wuCkNhbGN1bGF0ZXMgYW1vdW50cyBwcm9wb3J0aW9uYWxseSBiYXNlZCBvbiBMUCBzaGFyZSBvZiB0b3RhbCBzdXBwbHkuCgojIFBhcmFtZXRlcnMKLSBgcG9vbF9hZGRyZXNzYDogQWRkcmVzcyBvZiB0aGUgU29yb3N3YXAgcG9vbAoKIyBSZXR1cm5zClR1cGxlIG9mIChhbW91bnRfYSwgYW1vdW50X2IpIG9yZGVyZWQgdG8gbWF0Y2ggY29udHJhY3QncyB0b2tlbjAvdG9rZW4xCgojIFBhbmljcwpJZiBwb29sIHF1ZXJ5IGZhaWxzIG9yIGNhbGN1bGF0aW9uIG92ZXJmbG93cwAAAAAAABlnZXRfYW1vdW50c19mcm9tX3Nvcm9zd2FwAAAAAAAAAQAAAAAAAAAMcG9vbF9hZGRyZXNzAAAAEwAAAAEAAAPtAAAAAgAAAAsAAAAL",
        "AAAAAAAAAWJSZXRyaWV2ZXMgdGhlIHVuZGVybHlpbmcgdG9rZW4gYW1vdW50cyByZXByZXNlbnRlZCBieSBMUCBwb3NpdGlvbiBpbiBhbiBBcXVhcml1cyBwb29sLgpDYWxjdWxhdGVzIGFtb3VudHMgcHJvcG9ydGlvbmFsbHkgYmFzZWQgb24gTFAgc2hhcmUgb2YgdG90YWwgc3VwcGx5LgoKIyBQYXJhbWV0ZXJzCi0gYHBvb2xfYWRkcmVzc2A6IEFkZHJlc3Mgb2YgdGhlIEFxdWFyaXVzIHBvb2wKCiMgUmV0dXJucwpUdXBsZSBvZiAoYW1vdW50X2EsIGFtb3VudF9iKSBvcmRlcmVkIHRvIG1hdGNoIGNvbnRyYWN0J3MgdG9rZW4wL3Rva2VuMQoKIyBQYW5pY3MKSWYgcG9vbCBxdWVyeSBmYWlscyBvciBjYWxjdWxhdGlvbiBvdmVyZmxvd3MAAAAAABlnZXRfYW1vdW50c19mcm9tX2FxdWFyaXVzAAAAAAAAAQAAAAAAAAAMcG9vbF9hZGRyZXNzAAAAEwAAAAEAAAPtAAAAAgAAAAsAAAAL",
        "AAAAAAAAANRSZXR1cm5zIHRoZSBjdXJyZW50IHRva2VuIGJhbGFuY2VzIGhlbGQgZGlyZWN0bHkgYnkgdGhpcyBjb250cmFjdCAobm90IGluIHBvb2xzKS4KCiMgUmV0dXJucwpUdXBsZSBvZiAoYW1vdW50MCwgYW1vdW50MSkgLSBjdXJyZW50IGJhbGFuY2VzIG9mIHRva2VuMCBhbmQgdG9rZW4xIGluIGNvbnRyYWN0CgojIFBhbmljcwpJZiB0b2tlbiBiYWxhbmNlIHF1ZXJpZXMgZmFpbAAAABJnZXRfYW1vdW50c190b2tlbnMAAAAAAAAAAAABAAAD7QAAAAIAAAALAAAACw==",
        "AAAABAAAAAAAAAAAAAAADUNvbnRyYWN0RXJyb3IAAAAAAAAoAAAAAAAAAA1Ob3RBdXRob3JpemVkAAAAAAABkQAAAAAAAAAnR2V0RGVwb3NpdEFtb3VudHNNaW5BQmlnZ2VyVGhlbkRlc2lyZWRBAAAAATIAAAAAAAAAJ0dldERlcG9zaXRBbW91bnRzTWluQkJpZ2dlclRoZW5EZXNpcmVkQgAAAAEzAAAAAAAAACpHZXREZXBvc2l0QW1vdW50c0Ftb3VudEFCaWdnZXJUaGVuRGVzaXJlZEEAAAAAATQAAAAAAAAAJEdldERlcG9zaXRBbW91bnRzQW1vdW50QUxlc3NUaGVuTWluQQAAATUAAAAAAAAAKkdldERlcG9zaXRBbW91bnRzQW1vdW50QkJpZ2dlclRoZW5EZXNpcmVkQgAAAAABNgAAAAAAAAAkR2V0RGVwb3NpdEFtb3VudHNBbW91bnRCTGVzc1RoZW5NaW5CAAABNwAAAAAAAAAeRGVzaXJlZEFtb3VudHNCZWxvd09yRXF1YWxaZXJvAAAAAAE5AAAAAAAAABNNaW5BbW91bnRzQmVsb3daZXJvAAAAAToAAAAAAAAAEUNvbnRyYWN0TWF0aEVycm9yAAAAAAABSAAAAAAAAAATVG9rZW5UcmFuc2ZlckZhaWxlZAAAAAFKAAAAJVNvcm9zd2FwUm91dGVyOiBpbnN1ZmZpY2llbnQgYSBhbW91bnQAAAAAAAATSW5zdWZmaWNpZW50QUFtb3VudAAAAAGVAAAAJVNvcm9zd2FwUm91dGVyOiBpbnN1ZmZpY2llbnQgYiBhbW91bnQAAAAAAAATSW5zdWZmaWNpZW50QkFtb3VudAAAAAGWAAAAAAAAABhSb3V0ZXJGYWN0b3J5UXVlcnlGYWlsZWQAAAGXAAAAAAAAABNRdWVyeVBvb2xJbmZvRmFpbGVkAAAAAfQAAAAAAAAAF1Bvb2xJbmZvQ29udmVyc2lvbkVycm9yAAAAAfUAAAAAAAAAFlByb3ZpZGVMaXF1aWRpdHlGYWlsZWQAAAAAAfYAAAAAAAAAFVBvb2xUb2tlbjBRdWVyeUZhaWxlZAAAAAAAAf4AAAAAAAAAF1JvdXRlckdldFJlc2VydmVzRmFpbGVkAAAAAf8AAAAAAAAAEVJvdXRlclF1b3RlRmFpbGVkAAAAAAACAAAAAAAAAAAYUm91dGVyQWRkTGlxdWlkaXR5RmFpbGVkAAACAQAAAAAAAAAbUm91dGVyUmVtb3ZlTGlxdWlkaXR5RmFpbGVkAAAAAgIAAAAAAAAAF0FxdWFyaXVzR2V0VG9rZW5zRmFpbGVkAAAAAggAAAAAAAAAFUFxdWFyaXVzRGVwb3NpdEZhaWxlZAAAAAAAAgkAAAAAAAAAFkFxdWFyaXVzV2l0aGRyYXdGYWlsZWQAAAAAAgoAAAAAAAAAGkFxdWFyaXVzU2hhcmVJZFF1ZXJ5RmFpbGVkAAAAAAILAAAAAAAAABdBcXVhcml1c1Jlc2VydmVUb29MYXJnZQAAAAIMAAAAAAAAABxQaG9lbml4U2hhcmVUb2tlblF1ZXJ5RmFpbGVkAAACEgAAAAAAAAAeUGhvZW5peFdpdGhkcmF3TGlxdWlkaXR5RmFpbGVkAAAAAAITAAAAAAAAABlMcFRva2VuQmFsYW5jZVF1ZXJ5RmFpbGVkAAAAAAACHAAAAAAAAAAYUG9vbExwQmFsYW5jZVF1ZXJ5RmFpbGVkAAACHQAAAAAAAAATUm91dGVyUGFpckZvckZhaWxlZAAAAAIeAAAAAAAAAA9JbnZhbGlkUHJvdG9jb2wAAAACJgAAAAAAAAAMWmVyb1Jlc2VydmVzAAACJwAAAAAAAAAUQWN0aXZlUG9zaXRpb25FeGlzdHMAAAIoAAAAAAAAABJBbHJlYWR5SW5pdGlhbGl6ZWQAAAAAAjAAAAAAAAAAD0ludmFsaWRGZWVWYWx1ZQAAAAIxAAAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAACMgAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAjMAAAAAAAAAElJlZW50cmFuY3lEZXRlY3RlZAAAAAACNA==" ]),
      options
    )
  }
  public readonly fromJSON = {
    exit_reentrancy: this.txFromJSON<null>,
        reset_reentrancy: this.txFromJSON<null>,
        get_owner: this.txFromJSON<string>,
        get_multisig: this.txFromJSON<string>,
        set_multisig: this.txFromJSON<null>,
        get_token0: this.txFromJSON<string>,
        get_token1: this.txFromJSON<string>,
        get_active_protocol: this.txFromJSON<i128>,
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
        withdraw_contract: this.txFromJSON<null>,
        get_reserves: this.txFromJSON<readonly [i128, i128]>,
        get_prices_from_reserves: this.txFromJSON<readonly [i128, i128]>,
        get_token_tvl_from_reserves: this.txFromJSON<readonly [i128, i128]>,
        get_fee_cut: this.txFromJSON<readonly [i128, i128]>,
        get_amounts_from_phoenix: this.txFromJSON<readonly [i128, i128]>,
        get_amounts_from_soroswap: this.txFromJSON<readonly [i128, i128]>,
        get_amounts_from_aquarius: this.txFromJSON<readonly [i128, i128]>,
        get_amounts_tokens: this.txFromJSON<readonly [i128, i128]>
  }
}