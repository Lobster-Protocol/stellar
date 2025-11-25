#![no_std]

use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, contracttype, log, panic_with_error, symbol_short, token, vec, Address,
    Env, IntoVal, InvokeError, Symbol, Val, Vec,
};

mod error;

mod test_aqua;
mod test_phoenix;
mod test_soroswap;

use error::ContractError;

const OWNER: Symbol = symbol_short!("OWNER");
const LOBSTER: Symbol = symbol_short!("LOBSTER");
const TOKEN0: Symbol = symbol_short!("TOKEN0");
const TOKEN1: Symbol = symbol_short!("TOKEN1");

const ACT_SHARE: Symbol = symbol_short!("ACT_SHARE");
const ACT_POOL: Symbol = symbol_short!("ACT_POOL");
const ACT_ROUTER: Symbol = symbol_short!("ACT_ROUT");
const ACT_DEX: Symbol = symbol_short!("ACT_DEX");
const KEY_RENTR: Symbol = symbol_short!("KEY_RENTR");

// Add these storage keys
const FEE_CUT_BPS: Symbol = symbol_short!("FEE_BPS"); // Your fee percentage (e.g., 100 = 1%)
const LAST_POOL_BALANCE_A: Symbol = symbol_short!("LAST_A");
const LAST_POOL_BALANCE_B: Symbol = symbol_short!("LAST_B");

const TOKEN0_TVL: Symbol = symbol_short!("TVL0");
const TOKEN1_TVL: Symbol = symbol_short!("TVL1");

// TTL constants for storage extension
const DAY_IN_LEDGERS: u32 = 17280;
const MONTH_IN_LEDGERS: u32 = DAY_IN_LEDGERS * 30;
const MAX_PERSISTENT_TTL: u32 = MONTH_IN_LEDGERS * 6; // 6 months (~180 days)
const PERSISTENT_TTL_THRESHOLD: u32 = MAX_PERSISTENT_TTL - MONTH_IN_LEDGERS; // 5 months (~150 days)
const MAX_INSTANCE_TTL: u32 = MONTH_IN_LEDGERS * 6; // 6 months
const INSTANCE_TTL_THRESHOLD: u32 = MAX_INSTANCE_TTL - MONTH_IN_LEDGERS; // 5 months

#[contracttype]
struct Asset {
    /// Address of the asset
    address: Address,
    /// The total amount of those tokens in the pool
    amount: i128,
}

#[contracttype]
struct PoolResponse {
    /// The asset A in the pool together with asset amounts
    asset_a: Asset,
    /// The asset B in the pool together with asset amounts
    asset_b: Asset,
    /// The total amount of LP tokens currently issued
    asset_lp_share: Asset,
    /// The address of the Stake contract for the liquidity pool
    stake_address: Address,
}

#[derive(Clone)]
#[contracttype]
pub struct AutoUnstakeInfo {
    pub stake_amount: i128,
    pub stake_timestamp: u64,
}

/// Contains all pool and router addresses for different protocols
#[contracttype]
#[derive(Clone)]
pub struct PoolAddresses {
    /// Soroswap pool address
    pub soroswap_pool: Address,
    /// Soroswap router address
    pub soroswap_router: Address,
    /// Phoenix pool address
    pub phoenix_pool: Address,
    /// Aquarius pool address
    pub aquarius_pool: Address,
}

/// Parameters for withdraw operations (different pools need different params)
#[contracttype]
#[derive(Clone)]
pub struct WithdrawParams {
    /// Minimum amount of token0 to receive (i128 for Soroswap/Phoenix, u128 for Aquarius)
    /// For Aquarius, this will be cast from u128
    pub amount0_min: i128,
    /// Minimum amount of token1 to receive (i128 for Soroswap/Phoenix, u128 for Aquarius)
    /// For Aquarius, this will be cast from u128
    pub amount1_min: i128,
    /// Deadline for Soroswap/Phoenix (ledger number)
    pub deadline: Option<u64>,
    /// Auto-unstake flag for Phoenix (optional)
    pub auto_unstake: Option<bool>,
    /// Amount LP for Phoenix (optional, usually not needed as we withdraw all)
    pub amount_lp: Option<i128>,
}

/// Parameters for add liquidity operations (different pools need different params)
#[contracttype]
#[derive(Clone)]
pub struct AddLiquidityParams {
    /// Amount of token0 to add (optional - if None, uses contract balance)
    pub amount0: Option<i128>,
    /// Amount of token1 to add (optional - if None, uses contract balance)
    pub amount1: Option<i128>,
    /// Minimum amount of token0 to add (slippage protection)
    pub amount0_min: i128,
    /// Minimum amount of token1 to add (slippage protection)
    pub amount1_min: i128,
    /// Deadline for Soroswap/Phoenix (ledger number)
    pub deadline: Option<u64>,
    /// Slippage for Phoenix (optional, in basis points)
    pub slippage: Option<i64>,
}

#[contract]
pub struct Lobster;

#[contractimpl]
impl Lobster {
    /// Initializes the Lobster contract with owner, multisig admin, token pair, and fee configuration.
    ///
    /// # Parameters
    /// - `owner`: The address of the pool owner who can manage positions
    /// - `multisig`: The address of the multisig admin (LOBSTER) that can also manage positions
    /// - `token0`: Address of the first token in the pair
    /// - `token1`: Address of the second token in the pair
    /// - `fee_cut_bps`: Fee percentage in basis points (0-10000, where 10000 = 100%)
    ///
    /// # Panics
    /// - If contract is already initialized
    /// - If fee_cut_bps exceeds 10000
    pub fn __constructor(
        env: Env,
        owner: Address,
        multisig: Address,
        token0: Address,
        token1: Address,
        fee_cut_bps: u32,
    ) {
        if env.storage().persistent().has(&OWNER) {
            panic_with_error!(env, ContractError::AlreadyInitialized);
        }

        // Validate fee value (0-10000 basis points = 0-100%)
        if fee_cut_bps > 10000 {
            panic_with_error!(env, ContractError::InvalidFeeValue);
        }

        env.storage().persistent().set(&OWNER, &owner);
        env.storage().persistent().set(&LOBSTER, &multisig);
        env.storage().persistent().set(&TOKEN0, &token0);
        env.storage().persistent().set(&TOKEN1, &token1);
        env.storage().persistent().set(&FEE_CUT_BPS, &fee_cut_bps);
        env.storage().persistent().set(&LAST_POOL_BALANCE_A, &0i128);
        env.storage().persistent().set(&LAST_POOL_BALANCE_B, &0i128);
        env.storage().persistent().set(&ACT_DEX, &5i128);
    }

    /// Ensures that `caller` is either the pool `owner` or the multisig `admin`.
    /// Requires the caller's signature and aborts with `NotAuthorized` otherwise.
    fn require_owner_or_admin(env: &Env, caller: Address) {
        // First require authentication to ensure the caller is properly signed
        caller.require_auth();

        // Check if contract is initialized
        if !env.storage().persistent().has(&OWNER) {
            panic_with_error!(env, ContractError::NotInitialized);
        }

        let owner: Address = env
            .storage()
            .persistent()
            .get(&OWNER)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized));

        let admin: Address = env
            .storage()
            .persistent()
            .get(&LOBSTER)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized));

        if caller != owner && caller != admin {
            panic_with_error!(env.clone(), ContractError::NotAuthorized);
        }
    }

    /// Reentrancy guard entry: sets a temporary flag, panics if already set.
    /// This prevents reentrant calls to protected functions.
    fn enter_reentrancy(env: &Env) {
        let flag: bool = env.storage().temporary().get(&KEY_RENTR).unwrap_or(false);
        if flag {
            panic_with_error!(env, ContractError::ReentrancyDetected);
        }
        env.storage().temporary().set(&KEY_RENTR, &true);
    }

    /// Reentrancy guard exit: clears the temporary flag.
    pub fn exit_reentrancy(env: &Env) {
        env.storage().temporary().set(&KEY_RENTR, &false);
    }

    /// Emergency function to reset reentrancy flag if it gets stuck.
    /// This can happen if a panic occurs after `enter_reentrancy` but before `exit_reentrancy`.
    /// The flag will eventually expire with temporary storage TTL, but this provides immediate recovery.
    ///
    /// # Parameters
    /// - `caller`: The address calling this function (must be owner or admin)
    ///
    /// # Access
    /// Only owner or multisig admin
    ///
    /// # Panics
    /// - If caller is not owner or admin
    pub fn reset_reentrancy(env: Env, caller: Address) {
        Self::require_owner_or_admin(&env, caller);
        Self::exit_reentrancy(&env);
    }

    /// Helper function to extend TTL for a persistent storage key if it exists.
    /// Only extends if the key exists to avoid unnecessary operations.
    fn extend_persistent_ttl_if_exists(env: &Env, key: &Symbol) {
        if env.storage().persistent().has(key) {
            env.storage()
                .persistent()
                .extend_ttl(key, PERSISTENT_TTL_THRESHOLD, MAX_PERSISTENT_TTL);
        }
    }

    /// Extends TTL for all critical storage entries to maximum (6 months).
    /// This should be called at the start of public functions to ensure all data remains accessible.
    /// 
    /// Extends TTL for:
    /// - Contract instance (instance storage)
    /// - All persistent storage keys (OWNER, LOBSTER, TOKEN0, TOKEN1, FEE_CUT_BPS, 
    ///   ACT_DEX, ACT_SHARE, ACT_POOL, ACT_ROUTER, LAST_POOL_BALANCE_A, LAST_POOL_BALANCE_B,
    ///   TOKEN0_TVL, TOKEN1_TVL)
    ///
    /// This function is safe to call multiple times and only extends TTL if entries exist.
    fn extend_all_storage_ttl(env: &Env) {
        // Extend instance TTL (contract code and instance storage)
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, MAX_INSTANCE_TTL);

        // Extend TTL for all critical persistent storage keys (only if they exist)
        Self::extend_persistent_ttl_if_exists(env, &OWNER);
        Self::extend_persistent_ttl_if_exists(env, &LOBSTER);
        Self::extend_persistent_ttl_if_exists(env, &TOKEN0);
        Self::extend_persistent_ttl_if_exists(env, &TOKEN1);
        Self::extend_persistent_ttl_if_exists(env, &FEE_CUT_BPS);
        Self::extend_persistent_ttl_if_exists(env, &ACT_DEX);
        Self::extend_persistent_ttl_if_exists(env, &ACT_SHARE);
        Self::extend_persistent_ttl_if_exists(env, &ACT_POOL);
        Self::extend_persistent_ttl_if_exists(env, &ACT_ROUTER);
        Self::extend_persistent_ttl_if_exists(env, &LAST_POOL_BALANCE_A);
        Self::extend_persistent_ttl_if_exists(env, &LAST_POOL_BALANCE_B);
        Self::extend_persistent_ttl_if_exists(env, &TOKEN0_TVL);
        Self::extend_persistent_ttl_if_exists(env, &TOKEN1_TVL);
    }

    /// Helper: Check if ratio (amount / desired) is within allowed slippage (in basis points)
    /// Returns true if (amount / desired) - 1 <= allowed_slippage_bps / 10000
    /// This is equivalent to: amount * 10000 <= desired * (10000 + allowed_slippage_bps)
    fn is_within_slippage(
        env: &Env,
        amount: i128,
        desired: i128,
        allowed_slippage_bps: i64,
    ) -> bool {
        if desired == 0 {
            return false;
        }
        // Check: amount * 10000 <= desired * (10000 + allowed_slippage_bps)
        let left = amount
            .checked_mul(10000)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError));
        let slippage_sum = 10000i128
            .checked_add(allowed_slippage_bps as i128)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError));
        let right = desired
            .checked_mul(slippage_sum)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError));
        left <= right
    }

    /// Helper: Calculate proportional amount using ratio (numerator / denominator) * value
    /// Equivalent to: value * numerator / denominator with overflow protection
    fn calculate_proportional_amount(
        env: &Env,
        value: i128,
        numerator: i128,
        denominator: i128,
    ) -> i128 {
        if denominator == 0 {
            panic_with_error!(env, ContractError::ContractMathError);
        }
        value
            .checked_mul(numerator)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError))
            .checked_div(denominator)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError))
    }

    /// Returns the address of the contract owner.
    ///
    /// # Returns
    /// The owner address stored during initialization
    ///
    /// # Panics
    /// If contract is not initialized
    pub fn get_owner(env: Env) -> Address {
        Self::extend_all_storage_ttl(&env);
        env.storage()
            .persistent()
            .get(&OWNER)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized))
    }

    /// Returns the address of the multisig admin (LOBSTER).
    ///
    /// # Returns
    /// The multisig admin address stored during initialization
    ///
    /// # Panics
    /// If contract is not initialized
    pub fn get_multisig(env: Env) -> Address {
        Self::extend_all_storage_ttl(&env);
        env.storage()
            .persistent()
            .get(&LOBSTER)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized))
    }

    /// Updates the multisig admin (LOBSTER) address.
    ///
    /// # Parameters
    /// - `caller`: Must be either the pool owner or current multisig admin
    /// - `new_multisig`: The new multisig admin address to store
    ///
    /// # Access
    /// Only owner or multisig admin
    ///
    /// # Panics
    /// - If contract is not initialized
    /// - If caller is not authorized
    pub fn set_multisig(env: Env, caller: Address, new_multisig: Address) {
        Self::extend_all_storage_ttl(&env);
        if !env.storage().persistent().has(&OWNER) {
            panic_with_error!(env, ContractError::NotInitialized);
        }

        Self::require_owner_or_admin(&env, caller);
        env.storage()
            .persistent()
            .set(&LOBSTER, &new_multisig);
    }

    /// Returns the address of the first token (token0) in the pair.
    ///
    /// # Returns
    /// The token0 address stored during initialization
    ///
    /// # Panics
    /// If contract is not initialized
    pub fn get_token0(env: Env) -> Address {
        Self::extend_all_storage_ttl(&env);
        env.storage()
            .persistent()
            .get(&TOKEN0)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized))
    }

    /// Returns the address of the second token (token1) in the pair.
    ///
    /// # Returns
    /// The token1 address stored during initialization
    ///
    /// # Panics
    /// If contract is not initialized
    pub fn get_token1(env: Env) -> Address {
        Self::extend_all_storage_ttl(&env);
        env.storage()
            .persistent()
            .get(&TOKEN1)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized))
    }

    /// Returns the currently active DEX protocol identifier.
    ///
    /// # Returns
    /// Protocol identifier: 0 = Soroswap, 1 = Phoenix, 2 = Aquarius, 5 = No active position
    ///
    /// # Panics
    /// If contract is not initialized
    pub fn get_active_protocol(env: Env) -> i128 {
        Self::extend_all_storage_ttl(&env);
        env.storage()
            .persistent()
            .get(&ACT_DEX)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized))
    }

    /// Returns the address of the currently active liquidity pool.
    ///
    /// # Returns
    /// The pool address where liquidity is currently deployed
    ///
    /// # Panics
    /// If contract is not initialized or no active pool exists
    pub fn get_actual_pool(env: Env) -> Address {
        Self::extend_all_storage_ttl(&env);
        env.storage()
            .persistent()
            .get(&ACT_POOL)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized))
    }

    /// Returns the address of the currently active router (for Soroswap).
    ///
    /// # Returns
    /// The router address used for Soroswap operations
    ///
    /// # Panics
    /// If contract is not initialized or no active router exists
    pub fn get_actual_router(env: Env) -> Address {
        Self::extend_all_storage_ttl(&env);
        env.storage()
            .persistent()
            .get(&ACT_ROUTER)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized))
    }

    /// Returns the address of the LP token/share token for the active position.
    ///
    /// # Returns
    /// The LP token address representing the current liquidity position
    ///
    /// # Panics
    /// If contract is not initialized or no active position exists
    pub fn get_actual_share(env: Env) -> Address {
        Self::extend_all_storage_ttl(&env);
        env.storage()
            .persistent()
            .get(&ACT_SHARE)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized))
    }

    /// Pull tokens from `caller` into this contract using `transfer_from`.
    /// Access: only `owner` or multisig `admin`.
    pub fn deposit(env: Env, caller: Address, amount0: i128, amount1: i128) {
        Self::extend_all_storage_ttl(&env);
        if !env.storage().persistent().has(&OWNER) {
            panic_with_error!(env, ContractError::NotInitialized);
        }

        // Validate that amounts are non-negative
        if amount0 < 0 || amount1 < 0 {
            panic_with_error!(env, ContractError::InvalidAmount);
        }

        Self::require_owner_or_admin(&env, caller.clone());
        Self::enter_reentrancy(&env);

        let token0: Address = env.storage().persistent().get(&TOKEN0)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized));
        let token1: Address = env.storage().persistent().get(&TOKEN1)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized));

        let c0 = token::Client::new(&env, &token0);
        let c1 = token::Client::new(&env, &token1);
        let to = env.current_contract_address();

        // Pull funds from user into this contract
        // transfer trom requires spender auth; contracts can authorize themselves in-call
        c0.transfer(&caller.clone(), &to.clone(), &amount0);
        c1.transfer(&caller.clone(), &to.clone(), &amount1);

        let contract_balance_a: i128 = env
            .storage()
            .persistent()
            .get(&LAST_POOL_BALANCE_A)
            .unwrap_or(0);
        let contract_balance_b: i128 = env
            .storage()
            .persistent()
            .get(&LAST_POOL_BALANCE_B)
            .unwrap_or(0);

        let new_balance_a = contract_balance_a
            .checked_add(amount0)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError));
        let new_balance_b = contract_balance_b
            .checked_add(amount1)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError));

        env.storage()
            .persistent()
            .set(&LAST_POOL_BALANCE_A, &new_balance_a);
        env.storage()
            .persistent()
            .set(&LAST_POOL_BALANCE_B, &new_balance_b);

        Self::exit_reentrancy(&env);

        let pos = (amount0, amount1);
        //events::emit_deposit(&env, &caller, &pos);
        env.events()
            .publish((symbol_short!("lostr_dep"), caller.clone()), &pos);
    }

    /// Public entry point for adding liquidity to a Phoenix pool.
    /// Validates access and delegates to internal implementation.
    ///
    /// # Parameters
    /// - `caller`: Address of the caller (must be owner or multisig admin)
    /// - `amount0`: Desired amount of token0 to add
    /// - `amount1`: Desired amount of token1 to add
    /// - `amount0_min`: Minimum amount of token0 to accept (slippage protection)
    /// - `amount1_min`: Minimum amount of token1 to accept (slippage protection)
    /// - `pool_address`: Address of the Phoenix pool
    /// - `deadline`: Ledger number deadline for the transaction
    /// - `slippage`: Allowed slippage in basis points
    ///
    /// # Access
    /// Only owner or multisig admin
    pub fn add_liquidity_phoenix(
        env: Env,
        caller: Address,
        amount0: i128,
        amount1: i128,
        amount0_min: i128,
        amount1_min: i128,
        pool_address: Address,
        deadline: u64,
        slippage: i64,
    ) {
        Self::extend_all_storage_ttl(&env);
        if !env.storage().persistent().has(&OWNER) {
            panic_with_error!(env, ContractError::NotInitialized);
        }

        Self::require_owner_or_admin(&env, caller.clone());

        Self::add_liquidity_phoenix_internal(
            env.clone(),
            amount0.clone(),
            amount1.clone(),
            amount0_min.clone(),
            amount1_min.clone(),
            pool_address.clone(),
            deadline.clone(),
            slippage.clone(),
        );
    }

    /// Internal implementation for adding liquidity to a Phoenix pool.
    /// Computes correct token ordering, optimal amounts, and handles approvals.
    ///
    /// # Parameters
    /// - `amount0`: Desired amount of token0 to add
    /// - `amount1`: Desired amount of token1 to add
    /// - `amount0_min`: Minimum amount of token0 to accept (slippage protection)
    /// - `amount1_min`: Minimum amount of token1 to accept (slippage protection)
    /// - `pool_address`: Address of the Phoenix pool
    /// - `deadline`: Ledger number deadline for the transaction
    /// - `slippage`: Allowed slippage in basis points
    ///
    /// # Panics
    /// - If active position already exists
    /// - If pool query fails
    /// - If liquidity provision fails
    fn add_liquidity_phoenix_internal(
        env: Env,
        amount0: i128,
        amount1: i128,
        amount0_min: i128,
        amount1_min: i128,
        pool_address: Address,
        deadline: u64,
        slippage: i64,
    ) {
        Self::enter_reentrancy(&env);

        // // Check if there's already an active position
        let act_dex: i128 = env.storage().persistent().get(&ACT_DEX).unwrap_or(0i128);
        if act_dex != 5i128 {
            panic_with_error!(env, ContractError::ActivePositionExists);
        }

        let token0: Address = env.storage().persistent().get(&TOKEN0)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized));
        let token1: Address = env.storage().persistent().get(&TOKEN1)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized));

        // Approve the pool/router to spend lobster's tokens
        let _c0 = token::Client::new(&env, &token0);
        let _c1 = token::Client::new(&env, &token1);
        let spender: Address = env.current_contract_address();

        let pool_info: PoolResponse = env
            .try_invoke_contract::<PoolResponse, InvokeError>(
                &pool_address,
                &Symbol::new(&env, "query_pool_info"),
                vec![&env],
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::QueryPoolInfoFailed);
            })
            .expect("Conversion error");

        let (
            correct_token0,
            correct_token1,
            correct_amount0,
            correct_amount1,
            correct_amount0_min,
            correct_amount1_min,
        ) = Self::correct_token_order(
            env.clone(),
            pool_info.asset_a.address,
            amount0, // if you have these variables
            amount1, // if you have these variables
            amount0_min,
            amount1_min,
        );

        let amount0_from_ratio = Self::calculate_proportional_amount(
            &env,
            amount1.clone(),
            pool_info.asset_a.amount.clone(),
            pool_info.asset_b.amount.clone(),
        );
    
        // If we use all max_amount0, how much amount1 do we need?
        let amount1_from_ratio = Self::calculate_proportional_amount(
            &env,
            amount0.clone(),
            pool_info.asset_b.amount.clone(),
            pool_info.asset_a.amount.clone(),
        );
    
        // Use the constraint that doesn't exceed available balance
        let (optimal_amount0, optimal_amount1) = if amount0_from_ratio <= amount0 {
            // We have enough amount0 to match max_amount1, use all max_amount1
            (amount0_from_ratio, amount1)
        } else {
            // We don't have enough amount0, use all max_amount0 and calculate amount1
            (amount0, amount1_from_ratio)
        };

        let (approve0, approve1) = Self::get_deposit_amounts(
            &env,
            optimal_amount0.clone(),
            Some(correct_amount0_min.clone()),
            optimal_amount1.clone(),
            Some(correct_amount1_min.clone()),
            pool_info.asset_a.amount.clone(),
            pool_info.asset_b.amount.clone(),
            500_i64,
        );

        let mut transfer_args_a: Vec<Val> = vec![&env];
        transfer_args_a.push_back(env.current_contract_address().into_val(&env));
        transfer_args_a.push_back(pool_address.into_val(&env));
        transfer_args_a.push_back(approve0.into_val(&env));

        let mut transfer_args_b: Vec<Val> = vec![&env];
        transfer_args_b.push_back(env.current_contract_address().into_val(&env));
        transfer_args_b.push_back(pool_address.into_val(&env));
        transfer_args_b.push_back(approve1.into_val(&env));

        env.authorize_as_current_contract(vec![
            &env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: correct_token0.clone(),
                    fn_name: Symbol::new(&env, "transfer"),
                    args: transfer_args_a.clone(),
                },
                sub_invocations: vec![&env],
            }),
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: correct_token1.clone(),
                    fn_name: Symbol::new(&env, "transfer"),
                    args: transfer_args_b.clone(),
                },
                sub_invocations: vec![&env],
            }),
        ]);

        let _result = env
            .try_invoke_contract::<(), InvokeError>(
                &pool_address,
                &Symbol::new(&env, "provide_liquidity"),
                vec![
                    &env,
                    spender.into_val(&env),
                    optimal_amount0.into_val(&env),
                    correct_amount0_min.into_val(&env),
                    optimal_amount1.into_val(&env),
                    correct_amount1_min.into_val(&env),
                    slippage.into_val(&env),
                    deadline.into_val(&env),
                    false.into_val(&env),
                ],
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::ProvideLiquidityFailed);
            });

        let (price0_in_1, price1_in_0) = Self::get_prices_from_reserves(
            env.clone(),
            pool_info.asset_a.amount.clone(),
            pool_info.asset_b.amount.clone(),
        );

        let (token0_tvl, token1_tvl) = Self::get_token_tvl_from_reserves(
            env.clone(),
            correct_amount0.clone(),
            correct_amount1.clone(),
            price0_in_1.clone(),
            price1_in_0.clone(),
        );

        env.storage().persistent().set(&TOKEN0_TVL, &token0_tvl);
        env.storage().persistent().set(&TOKEN1_TVL, &token1_tvl);

        let (liquidity_shares, lp_token) = Self::get_lp_phoenix(env.clone(), pool_address.clone());

        Self::save_n_publish(
            env.clone(),
            pool_address.clone(),
            liquidity_shares,
            correct_amount0,
            correct_amount1,
            "add_liq_phoe",
            1i128,
        );

        Self::exit_reentrancy(&env);
    }

    /// Calculates optimal deposit amounts for adding liquidity while maintaining pool ratio.
    /// Ensures amounts respect minimum requirements and allowed slippage.
    ///
    /// # Parameters
    /// - `desired_a`: Desired amount of token A to deposit
    /// - `min_a`: Optional minimum amount of token A (slippage protection)
    /// - `desired_b`: Desired amount of token B to deposit
    /// - `min_b`: Optional minimum amount of token B (slippage protection)
    /// - `pool_balance_a`: Current balance of token A in the pool
    /// - `pool_balance_b`: Current balance of token B in the pool
    /// - `my_allowed_slippage`: Allowed slippage in basis points
    ///
    /// # Returns
    /// Tuple of (optimal_amount_a, optimal_amount_b) that maintains pool ratio
    ///
    /// # Panics
    /// - If desired amounts are <= 0
    /// - If min amounts are negative
    /// - If calculated amounts exceed allowed slippage
    /// - If calculated amounts are below minimum requirements
    pub fn get_deposit_amounts(
        env: &Env,
        desired_a: i128,
        min_a: Option<i128>,
        desired_b: i128,
        min_b: Option<i128>,
        pool_balance_a: i128,
        pool_balance_b: i128,
        my_allowed_slippage: i64,
    ) -> (i128, i128) {
        if desired_a <= 0 || desired_b <= 0 {
            log!(
            env,
            "Pool: Get Deposit Amounts: Desired amounts are equal or less than zero - desired_a: {}, desired_b: {}",
            desired_a, desired_b);

            panic_with_error!(env, ContractError::DesiredAmountsBelowOrEqualZero);
        }
        let allowed_slippage_bps = my_allowed_slippage as i64;
        if let (Some(min_a), Some(min_b)) = (min_a, min_b) {
            if min_a < 0 || min_b < 0 {
                log!(
                env,
                "Pool: Get Deposit Amounts: Min amounts are less than zero - min_a: {}, min_b: {}",
                min_a, min_b);

                panic_with_error!(env, ContractError::MinAmountsBelowZero);
            }
        }

        if pool_balance_a == 0 && pool_balance_b == 0 {
            return (desired_a, desired_b);
        }

        if let Some(min_a) = min_a {
            if min_a > desired_a {
                log!(
                    &env,
                    "Pool: GetDepositAmounts: Critical error - minimumA is bigger than desiredA"
                );
                panic_with_error!(env, ContractError::GetDepositAmountsMinABiggerThenDesiredA);
            }
        }
        if let Some(min_b) = min_b {
            if min_b > desired_b {
                log!(
                    &env,
                    "Pool: GetDepositAmounts: Critical error - minimumB is bigger than desiredB"
                );
                panic_with_error!(env, ContractError::GetDepositAmountsMinBBiggerThenDesiredB);
            }
        }

        let amount_a = {
            let mut amount_a = desired_b
                .checked_mul(pool_balance_a)
                .and_then(|result| result.checked_div(pool_balance_b))
                .unwrap_or_else(|| {
                    log!(&env, "Pool: Get Deposit Amounts: overflow/underflow error");
                    panic_with_error!(env, ContractError::ContractMathError);
                });
            if amount_a > desired_a {
                // If the amount is within the desired amount of slippage, we accept it
                if Self::is_within_slippage(&env, amount_a, desired_a, allowed_slippage_bps) {
                    amount_a = desired_a;
                } else {
                    log!(
                        env,
                        "Pool: Get deposit amounts: Deposit amount for asset A ({}) is invalid. It exceeds the desired amount ({})",
                        amount_a,
                        desired_a,
                    );
                    panic_with_error!(
                        env,
                        ContractError::GetDepositAmountsAmountABiggerThenDesiredA
                    );
                }
            };
            if let Some(min_a) = min_a {
                if amount_a < min_a {
                    log!(
                        env,
                        "Pool: Get deposit amounts: Deposit amount for asset A ({}) is invalid. It falls below the minimum requirement ({})",
                        amount_a,
                        min_a
                    );
                    panic_with_error!(env, ContractError::GetDepositAmountsAmountALessThenMinA);
                }
            }
            amount_a
        };

        let amount_b = {
            let mut amount_b = desired_a
                .checked_mul(pool_balance_b)
                .and_then(|result| result.checked_div(pool_balance_a))
                .unwrap_or_else(|| {
                    log!(&env, "Pool: Get Deposit Amounts: overflow/underflow error");
                    panic_with_error!(env, ContractError::ContractMathError);
                });
            if amount_b > desired_b {
                // If the amount is within the set threshold of the desired amount, we accept it
                if Self::is_within_slippage(&env, amount_b, desired_b, allowed_slippage_bps) {
                    amount_b = desired_b;
                } else {
                    log!(
                env,
                "Pool: Get deposit amounts: Deposit amount for asset B ({}) is invalid. It exceeds the desired amount ({})",
                amount_b,
                desired_b,
            );
                    panic_with_error!(
                        env,
                        ContractError::GetDepositAmountsAmountBBiggerThenDesiredB
                    );
                }
            };
            if let Some(min_b) = min_b {
                if amount_b < min_b {
                    log!(
                env,
                "Pool: Get deposit amounts: Deposit amount for asset B ({}) is invalid. It falls below the minimum requirement ({})",
                amount_b,
                min_b
            );
                    panic_with_error!(env, ContractError::GetDepositAmountsAmountBLessThenMinB);
                }
            }
            amount_b
        };

        (amount_a, amount_b)
    }

    /// Public entry point for adding liquidity to a Soroswap pool via router.
    /// Validates access and delegates to internal implementation.
    ///
    /// # Parameters
    /// - `caller`: Address of the caller (must be owner or multisig admin)
    /// - `amount0`: Desired amount of token0 to add
    /// - `amount1`: Desired amount of token1 to add
    /// - `amount0_min`: Minimum amount of token0 to accept (slippage protection)
    /// - `amount1_min`: Minimum amount of token1 to accept (slippage protection)
    /// - `deadline_ledger`: Ledger number deadline for the transaction
    /// - `router_address`: Address of the Soroswap router
    ///
    /// # Access
    /// Only owner or multisig admin
    pub fn add_liquidity_soroswap(
        env: Env,
        caller: Address,
        amount0: i128,
        amount1: i128,
        amount0_min: i128,
        amount1_min: i128,
        deadline_ledger: u64,
        router_address: Address,
    ) {
        Self::extend_all_storage_ttl(&env);
        if !env.storage().persistent().has(&OWNER) {
            panic_with_error!(env, ContractError::NotInitialized);
        }

        Self::require_owner_or_admin(&env, caller.clone());

        Self::add_liquidity_soroswap_internal(
            env,
            amount0,
            amount1,
            amount0_min,
            amount1_min,
            deadline_ledger,
            router_address,
        );
    }

    /// Internal implementation for adding liquidity to a Soroswap pool via router.
    /// Handles token ordering, optimal amount calculation, and router interaction.
    ///
    /// # Parameters
    /// - `amount0`: Desired amount of token0 to add
    /// - `amount1`: Desired amount of token1 to add
    /// - `amount0_min`: Minimum amount of token0 to accept (slippage protection)
    /// - `amount1_min`: Minimum amount of token1 to accept (slippage protection)
    /// - `deadline_ledger`: Ledger number deadline for the transaction
    /// - `router_address`: Address of the Soroswap router
    ///
    /// # Panics
    /// - If active position already exists
    /// - If router/pool queries fail
    /// - If liquidity addition fails
    fn add_liquidity_soroswap_internal(
        env: Env,
        amount0: i128,
        amount1: i128,
        amount0_min: i128,
        amount1_min: i128,
        deadline_ledger: u64,
        router_address: Address,
    ) {
        Self::enter_reentrancy(&env);

        // // Check if there's already an active position
        let act_dex: i128 = env.storage().persistent().get(&ACT_DEX).unwrap_or(0i128);
        if act_dex != 5i128 {
            panic_with_error!(env, ContractError::ActivePositionExists);
        }

        let token0: Address = env.storage().persistent().get(&TOKEN0)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized));
        let token1: Address = env.storage().persistent().get(&TOKEN1)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized));

        // Approve the pool/router to spend lobster's tokens
        let _c0 = token::Client::new(&env, &token0);
        let _c1 = token::Client::new(&env, &token1);
        let spender: Address = env.current_contract_address();

        let pool_address_r = env
            .try_invoke_contract::<Address, InvokeError>(
                &router_address,
                &Symbol::new(&env, "router_pair_for"),
                vec![&env, token0.into_val(&env), token1.into_val(&env)],
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::RouterPairForFailed);
            });

        let pool_address = pool_address_r.unwrap_or_else(|_| {
            panic_with_error!(env, ContractError::RouterPairForFailed);
        });

        let pool_token0 = env
            .try_invoke_contract::<Address, InvokeError>(
                &pool_address,
                &Symbol::new(&env, "token_0"),
                vec![&env],
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::PoolToken0QueryFailed);
            });

        let (
            correct_token0,
            correct_token1,
            correct_amount0,
            correct_amount1,
            correct_amount0_min,
            correct_amount1_min,
        ) = Self::correct_token_order(
            env.clone(),
            pool_token0.unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::PoolToken0QueryFailed);
            }),
            amount0, // if you have these variables
            amount1, // if you have these variables
            amount0_min,
            amount1_min,
        );

        let (reserve0, reserve1) = Self::get_reserves(env.clone(), pool_address.clone(), 0);

        let result1 = env
            .try_invoke_contract::<i128, InvokeError>(
                &router_address,
                &Symbol::new(&env, "quote"),
                vec![
                    &env,
                    correct_amount0.into_val(&env),
                    reserve0.into_val(&env),
                    reserve1.into_val(&env),
                ],
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::RouterQuoteFailed);
            });

        let result0 = env
            .try_invoke_contract::<i128, InvokeError>(
                &router_address,
                &Symbol::new(&env, "quote"),
                vec![
                    &env,
                    correct_amount1.into_val(&env),
                    reserve1.into_val(&env),
                    reserve0.into_val(&env),
                ],
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::RouterQuoteFailed);
            });

        let amount_a_optimal: i128 = result0.unwrap_or_else(|_| {
            panic_with_error!(env, ContractError::RouterQuoteFailed);
        });
        let amount_b_optimal: i128 = result1.unwrap_or_else(|_| {
            panic_with_error!(env, ContractError::RouterQuoteFailed);
        });

        // // Compute optimal amounts locally (same as router.quote)
        // let amount_b_optimal = correct_amount0
        //     .checked_mul(reserve1)
        //     .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError))
        //     .checked_div(reserve0)
        //     .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError));

        // let amount_a_optimal = correct_amount1
        //     .checked_mul(reserve0)
        //     .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError))
        //     .checked_div(reserve1)
        //     .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError));

        let approve0;
        let approve1;

        if amount_b_optimal <= correct_amount1 {
            if amount_b_optimal < correct_amount1_min {
                panic_with_error!(env, ContractError::InsufficientBAmount);
            }
            approve0 = correct_amount0;
            approve1 = amount_b_optimal;
        }
        // If not, we can try with the amount b desired
        else {
            // This should happen anyway. Because if we were not able to fulfill with our amount1 for our amount0
            // It is to expect that the amount_a_optimal for that lower amount1 to be lower than the amount0
            if amount_a_optimal > correct_amount0 {
                panic_with_error!(env, ContractError::ContractMathError);
            }

            if amount_a_optimal < correct_amount0_min {
                panic_with_error!(env, ContractError::InsufficientAAmount);
            }
            approve0 = amount_a_optimal;
            approve1 = correct_amount1;
        }

        let mut transfer_args_a: Vec<Val> = vec![&env];
        transfer_args_a.push_back(env.current_contract_address().into_val(&env));
        transfer_args_a.push_back(pool_address.into_val(&env));
        transfer_args_a.push_back(approve0.into_val(&env));

        let mut transfer_args_b: Vec<Val> = vec![&env];
        transfer_args_b.push_back(env.current_contract_address().into_val(&env));
        transfer_args_b.push_back(pool_address.into_val(&env));
        transfer_args_b.push_back(approve1.into_val(&env));

        env.authorize_as_current_contract(vec![
            &env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: correct_token0.clone(),
                    fn_name: Symbol::new(&env, "transfer"),
                    args: transfer_args_a,
                },
                sub_invocations: vec![&env],
            }),
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: correct_token1.clone(),
                    fn_name: Symbol::new(&env, "transfer"),
                    args: transfer_args_b,
                },
                sub_invocations: vec![&env],
            }),
        ]);

        let liquidity = env
            .try_invoke_contract::<(i128, i128, i128), InvokeError>(
                &router_address,
                &Symbol::new(&env, "add_liquidity"),
                vec![
                    &env,
                    correct_token0.into_val(&env),
                    correct_token1.into_val(&env),
                    correct_amount0.into_val(&env),
                    correct_amount1.into_val(&env),
                    correct_amount0_min.into_val(&env),
                    correct_amount1_min.into_val(&env),
                    spender.into_val(&env),
                    deadline_ledger.into_val(&env),
                ],
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::RouterAddLiquidityFailed);
            });

        let (price0_in_1, price1_in_0) =
            Self::get_prices_from_reserves(env.clone(), reserve0, reserve1);

        let (token0_tvl, token1_tvl) = Self::get_token_tvl_from_reserves(
            env.clone(),
            correct_amount0.clone(),
            correct_amount1.clone(),
            price0_in_1.clone(),
            price1_in_0.clone(),
        );

        env.storage().persistent().set(&TOKEN0_TVL, &token0_tvl);
        env.storage().persistent().set(&TOKEN1_TVL, &token1_tvl);

        let (_token0, _token1, liquidity_shares) = liquidity.unwrap_or_else(|_| {
            panic_with_error!(env, ContractError::RouterAddLiquidityFailed);
        });

        Self::save_n_publish(
            env.clone(),
            pool_address.clone(),
            liquidity_shares,
            approve0,
            approve1,
            "add_liq_soro",
            0i128,
        );

        env.storage()
            .persistent()
            .set(&ACT_ROUTER, &router_address.clone());

        Self::exit_reentrancy(&env);
    }

    /// Public entry point for adding liquidity to an Aquarius pool.
    /// Validates access and delegates to internal implementation.
    ///
    /// # Parameters
    /// - `caller`: Address of the caller (must be owner or multisig admin)
    /// - `amount0`: Amount of token0 to add
    /// - `amount1`: Amount of token1 to add
    /// - `pool_address`: Address of the Aquarius pool
    ///
    /// # Access
    /// Only owner or multisig admin
    pub fn add_liquidity_aquarius(
        env: Env,
        caller: Address,
        amount0: i128,
        amount1: i128,
        pool_address: Address,
    ) {
        Self::extend_all_storage_ttl(&env);
        if !env.storage().persistent().has(&OWNER) {
            panic_with_error!(env, ContractError::NotInitialized);
        }

        Self::require_owner_or_admin(&env, caller.clone());

        Self::add_liquidity_aquarius_internal(
            env.clone(),
            amount0.clone(),
            amount1.clone(),
            pool_address.clone(),
        );
    }

    /// Internal implementation for adding liquidity to an Aquarius pool.
    /// Handles token ordering and direct deposit to the pool.
    ///
    /// # Parameters
    /// - `amount0`: Amount of token0 to add
    /// - `amount1`: Amount of token1 to add
    /// - `pool_address`: Address of the Aquarius pool
    ///
    /// # Panics
    /// - If active position already exists
    /// - If pool queries fail
    /// - If deposit fails
    fn add_liquidity_aquarius_internal(
        env: Env,
        amount0: i128,
        amount1: i128,
        pool_address: Address,
    ) {
        Self::enter_reentrancy(&env);

        // // Check if there's already an active position
        let act_dex: i128 = env.storage().persistent().get(&ACT_DEX).unwrap_or(0i128);
        if act_dex != 5i128 {
            panic_with_error!(env, ContractError::ActivePositionExists);
        }

        let spender: Address = env.current_contract_address();

        let tokens = env
            .try_invoke_contract::<Vec<Address>, InvokeError>(
                &pool_address,
                &Symbol::new(&env, "get_tokens"),
                vec![&env],
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::AquariusGetTokensFailed);
            });

        let toks = tokens.unwrap();

        let response_token0 = toks.get(0).unwrap().clone();
        let _response_token1 = toks.get(1).unwrap().clone();

        let (
            correct_token0,
            correct_token1,
            correct_amount0,
            correct_amount1,
            _correct_amount0_min,
            _correct_amount1_min,
        ) = Self::correct_token_order(
            env.clone(),
            response_token0,
            amount1, // if you have these variables
            amount0, // if you have these variables
            0i128,
            0i128,
        );

        let (reserve0, reserve1) = Self::get_reserves(env.clone(), pool_address.clone(), 2);

        let mut transfer_args_a: Vec<Val> = vec![&env];
        transfer_args_a.push_back(env.current_contract_address().into_val(&env));
        transfer_args_a.push_back(pool_address.into_val(&env));
        transfer_args_a.push_back(correct_amount0.into_val(&env));

        let mut transfer_args_b: Vec<Val> = vec![&env];
        transfer_args_b.push_back(env.current_contract_address().into_val(&env));
        transfer_args_b.push_back(pool_address.into_val(&env));
        transfer_args_b.push_back(correct_amount1.into_val(&env));

        env.authorize_as_current_contract(vec![
            &env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: correct_token0.clone(),
                    fn_name: Symbol::new(&env, "transfer"),
                    args: transfer_args_a.clone(),
                },
                sub_invocations: vec![&env],
            }),
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: correct_token1.clone(),
                    fn_name: Symbol::new(&env, "transfer"),
                    args: transfer_args_b.clone(),
                },
                sub_invocations: vec![&env],
            }),
        ]);

        // Validate that amounts are non-negative before casting to u128
        if correct_amount0 < 0 || correct_amount1 < 0 {
            panic_with_error!(env, ContractError::InvalidAmount);
        }

        let amount0_for_list = correct_amount0 as u128;
        let amount1_for_list = correct_amount1 as u128;
        let mut list: Vec<Val> = vec![&env];
        list.push_back(amount0_for_list.into_val(&env));
        list.push_back(amount1_for_list.into_val(&env));

        let liquidity = env
            .try_invoke_contract::<(Vec<u128>, u128), InvokeError>(
                &pool_address,
                &Symbol::new(&env, "deposit"),
                vec![
                    &env,
                    spender.into_val(&env),
                    list.clone().into_val(&env),
                    0u128.into_val(&env),
                ],
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::AquariusDepositFailed);
            });

        let (price0_in_1, price1_in_0) =
            Self::get_prices_from_reserves(env.clone(), reserve0, reserve1);

        let (token0_tvl, token1_tvl) = Self::get_token_tvl_from_reserves(
            env.clone(),
            correct_amount0.clone(),
            correct_amount1.clone(),
            price0_in_1.clone(),
            price1_in_0.clone(),
        );

        env.storage().persistent().set(&TOKEN0_TVL, &token0_tvl);
        env.storage().persistent().set(&TOKEN1_TVL, &token1_tvl);

        // Note: If LP shares exceed i128::MAX, conversion will fail with AquariusReserveTooLarge
        let liquidity_shares = i128::try_from(
            liquidity.unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::AquariusDepositFailed);
            }).1
        )
        .unwrap_or_else(|_| panic_with_error!(env, ContractError::AquariusReserveTooLarge));

        Self::save_n_publish(
            env.clone(),
            pool_address.clone(),
            liquidity_shares,
            correct_amount0,
            correct_amount1,
            "add_liq_aqua",
            2i128,
        );

        Self::exit_reentrancy(&env);
    }

    /// Public entry point for withdrawing all liquidity from an Aquarius pool.
    /// Validates access and delegates to internal implementation.
    ///
    /// # Parameters
    /// - `caller`: Address of the caller (must be owner or multisig admin)
    /// - `pool_address`: Address of the Aquarius pool to withdraw from
    /// - `amount0_min`: Minimum amount of token0 to receive (slippage protection)
    /// - `amount1_min`: Minimum amount of token1 to receive (slippage protection)
    ///
    /// # Access
    /// Only owner or multisig admin
    pub fn withdraw_aquarius(
        env: Env,
        caller: Address,
        pool_address: Address,
        amount0_min: u128,
        amount1_min: u128,
    ) {
        Self::extend_all_storage_ttl(&env);
        if !env.storage().persistent().has(&OWNER) {
            panic_with_error!(env, ContractError::NotInitialized);
        }

        Self::require_owner_or_admin(&env, caller.clone());

        Self::withdraw_aquarius_internal(
            env.clone(),
            pool_address.clone(),
            amount0_min.clone(),
            amount1_min.clone(),
        );
    }
    /// Internal implementation for withdrawing all liquidity from an Aquarius pool.
    /// Burns LP tokens and redeems underlying tokens, calculates and transfers fees.
    ///
    /// # Parameters
    /// - `pool_address`: Address of the Aquarius pool to withdraw from
    /// - `amount0_min`: Minimum amount of token0 to receive (slippage protection)
    /// - `amount1_min`: Minimum amount of token1 to receive (slippage protection)
    ///
    /// # Panics
    /// - If pool queries fail
    /// - If withdrawal fails
    /// - If amounts received are below minimums
    fn withdraw_aquarius_internal(
        env: Env,
        pool_address: Address,
        amount0_min: u128,
        amount1_min: u128,
    ) {
        // fn withdraw(e: Env, user: Address, share_amount: u128, min_amounts: Vec<u128>) -> Vec<u128>

        Self::enter_reentrancy(&env);

        let spender: Address = env.current_contract_address();

        let tokens = env
            .try_invoke_contract::<Vec<Address>, InvokeError>(
                &pool_address,
                &Symbol::new(&env, "get_tokens"),
                vec![&env],
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::AquariusGetTokensFailed);
            });

        let toks = tokens.unwrap();

        let response_token0 = toks.get(0).unwrap().clone();
        let _response_token1 = toks.get(1).unwrap().clone();

        let (
            correct_token0,
            correct_token1,
            _correct_amount0,
            _correct_amount1,
            correct_amount0_mini,
            correct_amount1_mini,
        ) = Self::correct_token_order(
            env.clone(),
            response_token0,
            0i128, // if you have these variables
            0i128, // if you have these variables
            amount0_min as i128,
            amount1_min as i128,
        );

        let correct_amount0_min = correct_amount0_mini as u128;
        let correct_amount1_min = correct_amount1_mini as u128;

        let (lp_balance, lp_token) = Self::get_lp_aquarius(env.clone(), pool_address.clone());

        let mut burn_args: Vec<Val> = vec![&env];
        burn_args.push_back(env.current_contract_address().into_val(&env));
        burn_args.push_back(lp_balance.into_val(&env));

        env.authorize_as_current_contract(vec![
            &env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: lp_token.clone(),
                    fn_name: Symbol::new(&env, "burn"),
                    args: burn_args.clone(),
                },
                sub_invocations: vec![&env],
            }),
        ]);

        let real_amount_lp = lp_balance as u128;

        let mut min_amounts: Vec<Val> = vec![&env];
        min_amounts.push_back(correct_amount0_min.into_val(&env));
        min_amounts.push_back(correct_amount1_min.into_val(&env));

        let mut withdraw_args: Vec<Val> = vec![&env];
        withdraw_args.push_back(spender.into_val(&env));
        withdraw_args.push_back(real_amount_lp.into_val(&env));
        withdraw_args.push_back(min_amounts.clone().into_val(&env));

        let withdraw_result = env
            .try_invoke_contract::<Vec<u128>, InvokeError>(
                &pool_address,
                &Symbol::new(&env, "withdraw"),
                withdraw_args,
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::AquariusWithdrawFailed);
            })
            .expect("Conversion error");

        // Note: If withdrawal amounts exceed i128::MAX, conversion will fail with AquariusReserveTooLarge
        let correct_amount0 = i128::try_from(withdraw_result.get(0).unwrap_or_else(|| {
            panic_with_error!(env, ContractError::AquariusWithdrawFailed);
        }))
        .unwrap_or_else(|_| panic_with_error!(env, ContractError::AquariusReserveTooLarge));
        let correct_amount1 = i128::try_from(withdraw_result.get(1).unwrap_or_else(|| {
            panic_with_error!(env, ContractError::AquariusWithdrawFailed);
        }))
        .unwrap_or_else(|_| panic_with_error!(env, ContractError::AquariusReserveTooLarge));

        let (reserve0, reserve1) = Self::get_reserves(env.clone(), pool_address.clone(), 2);
        let (price0_in_1, price1_in_0) =
            Self::get_prices_from_reserves(env.clone(), reserve0, reserve1);

        let (token0_tvl, token1_tvl) = Self::get_token_tvl_from_reserves(
            env.clone(),
            correct_amount0.clone(),
            correct_amount1.clone(),
            price0_in_1.clone(),
            price1_in_0.clone(),
        );

        let init_token0_tvl: i128 = env.storage().persistent().get(&TOKEN0_TVL).unwrap();
        let init_token1_tvl: i128 = env.storage().persistent().get(&TOKEN1_TVL).unwrap();

        // Add validation
        if init_token0_tvl.clone() < 0 || init_token1_tvl.clone() < 0 {
            panic_with_error!(env, ContractError::ContractMathError);
        }

        let (amount0_fee_cut, amount1_fee_cut) = Self::get_fee_cut(
            env.clone(),
            init_token0_tvl.clone(),
            init_token1_tvl.clone(),
            token0_tvl.clone(),
            token1_tvl.clone(),
            correct_amount0.clone(),
            correct_amount1.clone(),
        );

        if amount0_fee_cut > 0 {
            Self::transfer_fee_cut(env.clone(), correct_token0, amount0_fee_cut);
        }
        if amount1_fee_cut > 0 {
            Self::transfer_fee_cut(env.clone(), correct_token1, amount1_fee_cut);
        }

        env.storage().persistent().set(&TOKEN0_TVL, &0i128);
        env.storage().persistent().set(&TOKEN1_TVL, &0i128);
        env.storage().persistent().set(&ACT_POOL, &0);
        env.storage().persistent().set(&ACT_SHARE, &0);
        env.storage().persistent().set(&ACT_ROUTER, &0);
        env.storage().persistent().set(&ACT_DEX, &5i128);

        Self::exit_reentrancy(&env);
    }

    /// Returns the current LP token balance and LP token address for an Aquarius pool.
    ///
    /// # Parameters
    /// - `pool_address`: Address of the Aquarius pool
    ///
    /// # Returns
    /// Tuple of (lp_balance, lp_token_address) - current LP balance and LP token contract address
    ///
    /// # Panics
    /// If pool queries fail
    pub fn get_lp_aquarius(env: Env, pool_address: Address) -> (i128, Address) {
        Self::extend_all_storage_ttl(&env);
        let lp_token = env
            .try_invoke_contract::<Address, InvokeError>(
                &pool_address,
                &Symbol::new(&env, "share_id"),
                vec![&env],
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::AquariusShareIdQueryFailed);
            });

        let lp_token = lp_token.unwrap();

        let lp_balance = env
            .try_invoke_contract::<i128, InvokeError>(
                &lp_token,
                &Symbol::new(&env, "balance"),
                vec![&env, env.current_contract_address().into_val(&env)],
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::LpTokenBalanceQueryFailed);
            });

        (lp_balance.unwrap(), lp_token)
    }

    /// Public entry point for withdrawing all liquidity from a Phoenix pool.
    /// Validates access and delegates to internal implementation.
    ///
    /// # Parameters
    /// - `caller`: Address of the caller (must be owner or multisig admin)
    /// - `pool_address`: Address of the Phoenix pool to withdraw from
    /// - `amount0_min`: Minimum amount of token0 to receive (slippage protection)
    /// - `amount1_min`: Minimum amount of token1 to receive (slippage protection)
    /// - `deadline`: Ledger number deadline for the transaction
    ///
    /// # Access
    /// Only owner or multisig admin
    pub fn withdraw_phoenix(
        env: Env,
        caller: Address,
        pool_address: Address,
        amount0_min: i128,
        amount1_min: i128,
        deadline: u64,
    ) {
        Self::extend_all_storage_ttl(&env);
        if !env.storage().persistent().has(&OWNER) {
            panic_with_error!(env, ContractError::NotInitialized);
        }

        Self::require_owner_or_admin(&env, caller.clone());

        Self::withdraw_phoenix_internal(
            env.clone(),
            pool_address.clone(),
            amount0_min.clone(),
            amount1_min.clone(),
            deadline.clone(),
        );
    }

    /// Internal implementation for withdrawing all liquidity from a Phoenix pool.
    /// Transfers LP tokens and redeems underlying tokens, calculates and transfers fees.
    ///
    /// # Parameters
    /// - `pool_address`: Address of the Phoenix pool to withdraw from
    /// - `amount0_min`: Minimum amount of token0 to receive (slippage protection)
    /// - `amount1_min`: Minimum amount of token1 to receive (slippage protection)
    /// - `deadline`: Ledger number deadline for the transaction
    ///
    /// # Panics
    /// - If pool queries fail
    /// - If withdrawal fails
    /// - If amounts received are below minimums
    fn withdraw_phoenix_internal(
        env: Env,
        pool_address: Address,
        amount0_min: i128,
        amount1_min: i128,
        deadline: u64,
    ) {
        Self::enter_reentrancy(&env);

        let spender: Address = env.current_contract_address();

        let (lp_balance, lp_token) = Self::get_lp_phoenix(env.clone(), pool_address.clone());

        let pool_info: PoolResponse = env
            .try_invoke_contract::<PoolResponse, InvokeError>(
                &pool_address,
                &Symbol::new(&env, "query_pool_info"),
                vec![&env],
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::QueryPoolInfoFailed);
            })
            .expect("Conversion error");

        let (
            correct_token0,
            correct_token1,
            _correct_amount0,
            _correct_amount1,
            correct_amount0_min,
            correct_amount1_min,
        ) = Self::correct_token_order(
            env.clone(),
            pool_info.asset_a.address.clone(),
            0i128, // if you have these variables
            0i128, // if you have these variables
            amount0_min,
            amount1_min,
        );

        let mut transfer_args: Vec<Val> = vec![&env];
        transfer_args.push_back(env.current_contract_address().into_val(&env));
        transfer_args.push_back(pool_address.into_val(&env));
        transfer_args.push_back(lp_balance.into_val(&env));

        env.authorize_as_current_contract(vec![
            &env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: lp_token.clone(),
                    fn_name: Symbol::new(&env, "transfer"),
                    args: transfer_args.clone(),
                },
                sub_invocations: vec![&env],
            }),
        ]);

        let mut withdraw_args: Vec<Val> = vec![&env];
        withdraw_args.push_back(spender.into_val(&env));
        withdraw_args.push_back(lp_balance.into_val(&env));
        withdraw_args.push_back(correct_amount0_min.into_val(&env));
        withdraw_args.push_back(correct_amount1_min.into_val(&env));
        withdraw_args.push_back(deadline.into_val(&env));
        withdraw_args.push_back(None::<AutoUnstakeInfo>.into_val(&env));

        let withdraw_result = env
            .try_invoke_contract::<(i128, i128), InvokeError>(
                &pool_address,
                &Symbol::new(&env, "withdraw_liquidity"),
                withdraw_args,
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::PhoenixWithdrawLiquidityFailed);
            })
            .expect("Conversion error");

        let (correct_amount0, correct_amount1) = withdraw_result;

        //let (reserve0, reserve1) = Self::get_reserves(env.clone(), pool_address.clone(), 1);
        let (price0_in_1, price1_in_0) = Self::get_prices_from_reserves(
            env.clone(),
            pool_info.asset_a.amount.clone(),
            pool_info.asset_b.amount.clone(),
        );

        let (token0_tvl, token1_tvl) = Self::get_token_tvl_from_reserves(
            env.clone(),
            correct_amount0.clone(),
            correct_amount1.clone(),
            price0_in_1.clone(),
            price1_in_0.clone(),
        );

        let init_token0_tvl: i128 = env.storage().persistent().get(&TOKEN0_TVL).unwrap();
        let init_token1_tvl: i128 = env.storage().persistent().get(&TOKEN1_TVL).unwrap();

        // Add validation
        if init_token0_tvl.clone() < 0 || init_token1_tvl.clone() < 0 {
            panic_with_error!(env, ContractError::ContractMathError);
        }

        let (amount0_fee_cut, amount1_fee_cut) = Self::get_fee_cut(
            env.clone(),
            init_token0_tvl.clone(),
            init_token1_tvl.clone(),
            token0_tvl.clone(),
            token1_tvl.clone(),
            correct_amount0.clone(),
            correct_amount1.clone(),
        );

        if amount0_fee_cut > 0 {
            Self::transfer_fee_cut(env.clone(), correct_token0, amount0_fee_cut);
        }
        if amount1_fee_cut > 0 {
            Self::transfer_fee_cut(env.clone(), correct_token1, amount1_fee_cut);
        }

        env.storage().persistent().set(&TOKEN0_TVL, &0i128);
        env.storage().persistent().set(&TOKEN1_TVL, &0i128);
        env.storage().persistent().set(&ACT_POOL, &0);
        env.storage().persistent().set(&ACT_SHARE, &0);
        env.storage().persistent().set(&ACT_ROUTER, &0);
        env.storage().persistent().set(&ACT_DEX, &5i128);

        Self::exit_reentrancy(&env);
    }

    /// Returns the current LP token balance and LP token address for a Phoenix pool.
    ///
    /// # Parameters
    /// - `pool_address`: Address of the Phoenix pool
    ///
    /// # Returns
    /// Tuple of (lp_balance, lp_token_address) - current LP balance and LP token contract address
    ///
    /// # Panics
    /// If pool queries fail
    pub fn get_lp_phoenix(env: Env, pool_address: Address) -> (i128, Address) {
        Self::extend_all_storage_ttl(&env);
        let lp_token = env
            .try_invoke_contract::<Address, InvokeError>(
                &pool_address,
                &Symbol::new(&env, "query_share_token_address"),
                vec![&env],
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::PhoenixShareTokenQueryFailed);
            });

        let lp_token = lp_token.unwrap();

        let lp_balance = env
            .try_invoke_contract::<i128, InvokeError>(
                &lp_token,
                &Symbol::new(&env, "balance"),
                vec![&env, env.current_contract_address().into_val(&env)],
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::LpTokenBalanceQueryFailed);
            });

        (lp_balance.unwrap(), lp_token)
    }

    /// Public entry point for withdrawing all liquidity from a Soroswap pool via router.
    /// Validates access and delegates to internal implementation.
    ///
    /// # Parameters
    /// - `caller`: Address of the caller (must be owner or multisig admin)
    /// - `amount0_min`: Minimum amount of token0 to receive (slippage protection)
    /// - `amount1_min`: Minimum amount of token1 to receive (slippage protection)
    /// - `pool_address`: Address of the Soroswap pool to withdraw from
    /// - `router_address`: Address of the Soroswap router
    /// - `deadline`: Ledger number deadline for the transaction
    ///
    /// # Access
    /// Only owner or multisig admin
    pub fn withdraw_soroswap(
        env: Env,
        caller: Address,
        amount0_min: i128,
        amount1_min: i128,
        pool_address: Address,
        router_address: Address,
        deadline: u64,
    ) {
        Self::extend_all_storage_ttl(&env);
        if !env.storage().persistent().has(&OWNER) {
            panic_with_error!(env, ContractError::NotInitialized);
        }

        Self::require_owner_or_admin(&env, caller.clone());

        Self::withdraw_soroswap_internal(
            env,
            amount0_min,
            amount1_min,
            pool_address,
            router_address,
            deadline,
        );
    }
    /// Internal implementation for withdrawing all liquidity from a Soroswap pool via router.
    /// Transfers LP tokens to pool and removes liquidity, calculates and transfers fees.
    ///
    /// # Parameters
    /// - `amount0_min`: Minimum amount of token0 to receive (slippage protection)
    /// - `amount1_min`: Minimum amount of token1 to receive (slippage protection)
    /// - `pool_address`: Address of the Soroswap pool to withdraw from
    /// - `router_address`: Address of the Soroswap router
    /// - `deadline`: Ledger number deadline for the transaction
    ///
    /// # Panics
    /// - If pool queries fail
    /// - If liquidity removal fails
    /// - If amounts received are below minimums
    fn withdraw_soroswap_internal(
        env: Env,
        amount0_min: i128,
        amount1_min: i128,
        pool_address: Address,
        router_address: Address,
        deadline: u64,
    ) {
        Self::enter_reentrancy(&env);

        let spender: Address = env.current_contract_address();

        let pool_token0 = env
            .try_invoke_contract::<Address, InvokeError>(
                &pool_address,
                &Symbol::new(&env, "token_0"),
                vec![&env],
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::PoolToken0QueryFailed);
            });

        let (
            correct_token0,
            correct_token1,
            _correct_amount0,
            _correct_amount1,
            correct_amount0_min,
            correct_amount1_min,
        ) = Self::correct_token_order(
            env.clone(),
            pool_token0.unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::PoolToken0QueryFailed);
            }),
            0i128, // if you have these variables
            0i128, // if you have these variables
            amount0_min,
            amount1_min,
        );

        let (reserve0, reserve1) = Self::get_reserves(env.clone(), pool_address.clone(), 0);

        let liquidity: i128 = Self::get_lp_soroswap(env.clone(), pool_address.clone());

        let mut transfer_args: Vec<Val> = vec![&env];
        transfer_args.push_back(env.current_contract_address().into_val(&env));
        transfer_args.push_back(pool_address.into_val(&env));
        transfer_args.push_back(liquidity.into_val(&env));

        env.authorize_as_current_contract(vec![
            &env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: pool_address.clone(),
                    fn_name: Symbol::new(&env, "transfer"),
                    args: transfer_args,
                },
                sub_invocations: vec![&env],
            }),
        ]);

        let mut withdraw_args: Vec<Val> = vec![&env];
        withdraw_args.push_back(correct_token0.into_val(&env));
        withdraw_args.push_back(correct_token1.into_val(&env));
        withdraw_args.push_back(liquidity.into_val(&env));
        withdraw_args.push_back(correct_amount0_min.into_val(&env));
        withdraw_args.push_back(correct_amount1_min.into_val(&env));
        withdraw_args.push_back(spender.into_val(&env));
        withdraw_args.push_back(deadline.into_val(&env));

        let withdraw_result = env
            .try_invoke_contract::<(i128, i128), InvokeError>(
                &router_address,
                &Symbol::new(&env, "remove_liquidity"),
                withdraw_args,
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::RouterRemoveLiquidityFailed);
            })
            .expect("Conversion error");

        let (correct_amount0, correct_amount1) = withdraw_result;

        let (price0_in_1, price1_in_0) =
            Self::get_prices_from_reserves(env.clone(), reserve0, reserve1);

        let (token0_tvl, token1_tvl) = Self::get_token_tvl_from_reserves(
            env.clone(),
            correct_amount0.clone(),
            correct_amount1.clone(),
            price0_in_1.clone(),
            price1_in_0.clone(),
        );

        let init_token0_tvl: i128 = env.storage().persistent().get(&TOKEN0_TVL).unwrap();
        let init_token1_tvl: i128 = env.storage().persistent().get(&TOKEN1_TVL).unwrap();

        // Add validation
        if init_token0_tvl.clone() < 0 || init_token1_tvl.clone() < 0 {
            panic_with_error!(env, ContractError::ContractMathError);
        }

        let (amount0_fee_cut, amount1_fee_cut) = Self::get_fee_cut(
            env.clone(),
            init_token0_tvl.clone(),
            init_token1_tvl.clone(),
            token0_tvl.clone(),
            token1_tvl.clone(),
            correct_amount0.clone(),
            correct_amount1.clone(),
        );

        if amount0_fee_cut > 0 {
            Self::transfer_fee_cut(env.clone(), correct_token0, amount0_fee_cut);
        }
        if amount1_fee_cut > 0 {
            Self::transfer_fee_cut(env.clone(), correct_token1, amount1_fee_cut);
        }

        env.storage().persistent().set(&TOKEN0_TVL, &0i128);
        env.storage().persistent().set(&TOKEN1_TVL, &0i128);
        env.storage().persistent().set(&ACT_POOL, &0);
        env.storage().persistent().set(&ACT_SHARE, &0);
        env.storage().persistent().set(&ACT_ROUTER, &0);
        env.storage().persistent().set(&ACT_DEX, &5i128);

        Self::exit_reentrancy(&env);
    }

    /// Returns the current LP token balance for a Soroswap pool.
    /// In Soroswap, the LP token is the pool address itself.
    ///
    /// # Parameters
    /// - `pool_address`: Address of the Soroswap pool (also the LP token address)
    ///
    /// # Returns
    /// Current LP token balance held by this contract
    ///
    /// # Panics
    /// If balance query fails
    pub fn get_lp_soroswap(env: Env, pool_address: Address) -> i128 {
        Self::extend_all_storage_ttl(&env);
        let lp_balance = env
            .try_invoke_contract::<i128, InvokeError>(
                &pool_address,
                &Symbol::new(&env, "balance"),
                vec![&env, env.current_contract_address().into_val(&env)],
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::PoolLpBalanceQueryFailed);
            });

        let liquidity = lp_balance.unwrap();

        liquidity
    }

    /// Public entry point for withdrawing tokens directly from the contract balance.
    /// Transfers tokens from contract to owner without interacting with pools.
    ///
    /// # Parameters
    /// - `caller`: Address of the caller (must be owner or multisig admin)
    /// - `amount0`: Amount of token0 to withdraw
    /// - `amount1`: Amount of token1 to withdraw
    ///
    /// # Access
    /// Only owner or multisig admin
    pub fn withdraw_contract(env: Env, caller: Address, amount0: i128, amount1: i128) {
        Self::extend_all_storage_ttl(&env);
        if !env.storage().persistent().has(&OWNER) {
            panic_with_error!(env, ContractError::NotInitialized);
        }

        Self::require_owner_or_admin(&env, caller.clone());

        Self::withdraw_contract_internal(
            env.clone(),
            amount0.clone(),
            amount1.clone(),
        );
    }

    /// Internal implementation for withdrawing tokens directly from contract balance.
    /// Transfers tokens from contract to owner without interacting with pools.
    ///
    /// # Parameters
    /// - `caller`: Address of the caller (must be owner or multisig admin)
    /// - `amount0`: Amount of token0 to withdraw
    /// - `amount1`: Amount of token1 to withdraw
    ///
    /// # Panics
    /// - If amounts are negative
    /// - If token transfers fail
    fn withdraw_contract_internal(env: Env, amount0: i128, amount1: i128) {
        // Validate that amounts are non-negative
        if amount0 < 0 || amount1 < 0 {
            panic_with_error!(env, ContractError::InvalidAmount);
        }

        let token0: Address = env.storage().persistent().get(&TOKEN0)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized));
        let token1: Address = env.storage().persistent().get(&TOKEN1)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized));

        let spender: Address = env.current_contract_address();

        let owner: Address = env.storage().persistent().get(&OWNER)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized));

        let mut withdraw_args0: Vec<Val> = vec![&env];
        withdraw_args0.push_back(spender.into_val(&env));
        withdraw_args0.push_back(owner.into_val(&env));
        withdraw_args0.push_back(amount0.into_val(&env));

        let mut withdraw_args1: Vec<Val> = vec![&env];
        withdraw_args1.push_back(spender.into_val(&env));
        withdraw_args1.push_back(owner.into_val(&env));
        withdraw_args1.push_back(amount1.into_val(&env));

        let _withdraw = env
            .try_invoke_contract::<(i128, i128), InvokeError>(
                &token0,
                &Symbol::new(&env, "transfer"),
                withdraw_args0,
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::TokenTransferFailed);
            });

        let _withdraw = env
            .try_invoke_contract::<(i128, i128), InvokeError>(
                &token1,
                &Symbol::new(&env, "transfer"),
                withdraw_args1,
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::TokenTransferFailed);
            });
    }

    /// Corrects token and amount ordering to match the pool's expected token order.
    /// Ensures amounts are aligned with pool's token0/token1 ordering.
    ///
    /// # Parameters
    /// - `pool_token0`: Address of token0 as defined by the pool
    /// - `amount0`: Amount of token0 (as defined by contract)
    /// - `amount1`: Amount of token1 (as defined by contract)
    /// - `amount0_min`: Minimum amount of token0
    /// - `amount1_min`: Minimum amount of token1
    ///
    /// # Returns
    /// Tuple of (correct_token0, correct_token1, correct_amount0, correct_amount1, correct_amount0_min, correct_amount1_min)
    /// ordered to match the pool's token ordering
    fn correct_token_order(
        env: Env,
        pool_token0: Address,
        amount0: i128,
        amount1: i128,
        amount0_min: i128,
        amount1_min: i128,
    ) -> (Address, Address, i128, i128, i128, i128) {
        let token0: Address = env.storage().persistent().get(&TOKEN0)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized));
        let token1: Address = env.storage().persistent().get(&TOKEN1)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized));

        if pool_token0 != token0 {
            (
                token1,      // correct_token0
                token0,      // correct_token1
                amount1,     // correct_amount0
                amount0,     // correct_amount1
                amount1_min, // correct_amount0_min
                amount0_min, // correct_amount1_min
            )
        } else {
            (
                token0,      // correct_token0
                token1,      // correct_token1
                amount0,     // correct_amount0
                amount1,     // correct_amount1
                amount0_min, // correct_amount0_min
                amount1_min, // correct_amount1_min
            )
        }
    }

    /// Saves liquidity position state and publishes an event.
    /// Updates storage with pool address, LP shares, amounts, and protocol identifier.
    ///
    /// # Parameters
    /// - `pool_address`: Address of the liquidity pool
    /// - `liquidity_shares`: Amount of LP tokens received/held
    /// - `correct_amount0`: Amount of token0 deposited/withdrawn
    /// - `correct_amount1`: Amount of token1 deposited/withdrawn
    /// - `event_name`: Name of the event to publish
    /// - `protocol`: Protocol identifier (0 = Soroswap, 1 = Phoenix, 2 = Aquarius)
    fn save_n_publish(
        env: Env,
        pool_address: Address,
        liquidity_shares: i128,
        correct_amount0: i128,
        correct_amount1: i128,
        event_name: &str,
        protocol: i128,
    ) {
        env.events().publish(
            (Symbol::new(&env, event_name), pool_address.clone()),
            (liquidity_shares, correct_amount0, correct_amount1),
        );

        env.storage()
            .persistent()
            .set(&ACT_SHARE, &liquidity_shares);

        env.storage().persistent().set(&ACT_POOL, &pool_address);

        env.storage()
            .persistent()
            .set(&LAST_POOL_BALANCE_A, &correct_amount0);

        env.storage()
            .persistent()
            .set(&LAST_POOL_BALANCE_B, &correct_amount1);

        env.storage().persistent().set(&ACT_DEX, &protocol);
    }

    /// Retrieves token reserves from a pool, handling different DEX protocols.
    /// Returns reserves in pool order (not contract order) to maintain consistency
    /// with amounts from correct_token_order and TVL calculations.
    ///
    /// # Parameters
    /// - `pool_address`: Address of the liquidity pool
    /// - `protocol_tvl`: Protocol identifier (0 = Soroswap, 1 = Phoenix, 2 = Aquarius)
    ///
    /// # Returns
    /// Tuple of (reserve0, reserve1) in pool order (pool's token0, pool's token1)
    ///
    /// # Panics
    /// - If protocol is invalid
    /// - If reserves are zero
    /// - If pool query fails
    pub fn get_reserves(env: Env, pool_address: Address, protocol_tvl: u32) -> (i128, i128) {
        Self::extend_all_storage_ttl(&env);
        let (reserve0, reserve1) = match protocol_tvl {
            0 => {
                // Soroswap protocol - get reserves directly (already in pool order)
                let (reserve0, reserve1) = env
                    .try_invoke_contract::<(i128, i128), InvokeError>(
                        &pool_address,
                        &Symbol::new(&env, "get_reserves"),
                        vec![&env],
                    )
                    .unwrap_or_else(|_| {
                        panic_with_error!(env, ContractError::QueryPoolInfoFailed);
                    })
                    .expect("Conversion error");

                (reserve0, reserve1)
            }
            1 => {
                // Phoenix protocol - get pool info and return in pool order
                let pool_info: PoolResponse = env
                    .try_invoke_contract::<PoolResponse, InvokeError>(
                        &pool_address,
                        &Symbol::new(&env, "query_pool_info"),
                        vec![&env],
                    )
                    .unwrap_or_else(|_| {
                        panic_with_error!(env, ContractError::QueryPoolInfoFailed);
                    })
                    .expect("Conversion error");

                // Return in pool order: asset_a is pool's token0, asset_b is pool's token1
                    (pool_info.asset_a.amount, pool_info.asset_b.amount)
            }
            2 => {
                // Aquarius protocol - get reserves directly in pool order
                let pool_info = env
                    .try_invoke_contract::<Vec<u128>, InvokeError>(
                        &pool_address,
                        &Symbol::new(&env, "get_reserves"),
                        vec![&env],
                    )
                    .unwrap_or_else(|_| {
                        panic_with_error!(env, ContractError::QueryPoolInfoFailed);
                    })
                    .expect("Conversion error");

                // Return in pool order: index 0 is pool's token0, index 1 is pool's token1
                // Note: If reserves exceed i128::MAX, conversion will fail with AquariusReserveTooLarge
                (
                    i128::try_from(pool_info.get(0).unwrap_or_else(|| {
                            panic_with_error!(env, ContractError::QueryPoolInfoFailed);
                    }))
                    .unwrap_or_else(|_| panic_with_error!(env, ContractError::AquariusReserveTooLarge)),
                    i128::try_from(pool_info.get(1).unwrap_or_else(|| {
                            panic_with_error!(env, ContractError::QueryPoolInfoFailed);
                    }))
                    .unwrap_or_else(|_| panic_with_error!(env, ContractError::AquariusReserveTooLarge)),
                )
            }
            _ => {
                panic_with_error!(env, ContractError::InvalidProtocol);
            }
        };

        // Check for division by zero
        if reserve0 == 0 || reserve1 == 0 {
            panic_with_error!(env, ContractError::ZeroReserves);
        }

        (reserve0, reserve1)
    }

    /// Calculates token prices from pool reserves.
    ///
    /// # Parameters
    /// - `reserve0`: Reserve amount of token0 in the pool
    /// - `reserve1`: Reserve amount of token1 in the pool
    ///
    /// # Returns
    /// Tuple of (price_0_in_1, price_1_in_0) where:
    /// - price_0_in_1: Price of token0 denominated in token1
    /// - price_1_in_0: Price of token1 denominated in token0
    ///
    /// # Panics
    /// - If reserves are zero (division by zero)
    /// - On arithmetic overflow
    pub fn get_prices_from_reserves(env: Env, reserve0: i128, reserve1: i128) -> (i128, i128) {
        Self::extend_all_storage_ttl(&env);
        if reserve0 == 0 || reserve1 == 0 {
            panic_with_error!(env, ContractError::ZeroReserves);
        }
        // Calculate prices with overflow protection
        let price_0_in_1 = reserve1.checked_div(reserve0).unwrap_or_else(|| {
            panic_with_error!(env, ContractError::ContractMathError);
        });

        let price_1_in_0 = reserve0.checked_div(reserve1).unwrap_or_else(|| {
            panic_with_error!(env, ContractError::ContractMathError);
        });

        (price_0_in_1, price_1_in_0)
    }

    /// Calculates Total Value Locked (TVL) for both tokens in the position.
    /// TVL represents the total value of tokens, accounting for their relative prices.
    ///
    /// # Parameters
    /// - `amount0`: Amount of token0
    /// - `amount1`: Amount of token1
    /// - `price0_in_1`: Price of token0 in terms of token1
    /// - `price1_in_0`: Price of token1 in terms of token0
    ///
    /// # Returns
    /// Tuple of (token0_tvl, token1_tvl) where:
    /// - token0_tvl: Total value of position in token0 terms
    /// - token1_tvl: Total value of position in token1 terms
    ///
    /// # Panics
    /// On arithmetic overflow
    pub fn get_token_tvl_from_reserves(
        env: Env,
        amount0: i128,
        amount1: i128,
        price0_in_1: i128,
        price1_in_0: i128,
    ) -> (i128, i128) {
        Self::extend_all_storage_ttl(&env);
        //Calculate TVL with overflow protection
        let token0_tvl = amount0
            .checked_add(amount1.checked_mul(price1_in_0).unwrap_or_else(|| {
                panic_with_error!(env, ContractError::ContractMathError);
            }))
            .unwrap_or_else(|| {
                panic_with_error!(env, ContractError::ContractMathError);
            });

        let token1_tvl = amount1
            .checked_add(amount0.checked_mul(price0_in_1).unwrap_or_else(|| {
                panic_with_error!(env, ContractError::ContractMathError);
            }))
            .unwrap_or_else(|| {
                panic_with_error!(env, ContractError::ContractMathError);
            });

        (token0_tvl, token1_tvl)
    }

    /// Calculates the fee amount to be deducted from profits on each token.
    /// Fee is calculated as a percentage of total profit, distributed proportionally.
    ///
    /// # Parameters
    /// - `init_tvl0`: Initial TVL in token0 terms when position was opened
    /// - `init_tvl1`: Initial TVL in token1 terms when position was opened
    /// - `current_tvl0`: Current TVL in token0 terms
    /// - `current_tvl1`: Current TVL in token1 terms
    /// - `current_amount0`: Current amount of token0
    /// - `current_amount1`: Current amount of token1
    ///
    /// # Returns
    /// Tuple of (fee_token0, fee_token1) - fee amounts in each token
    /// Returns (0, 0) if there's no profit or total TVL is zero
    ///
    /// # Panics
    /// On arithmetic overflow
    pub fn get_fee_cut(
        env: Env,
        init_tvl0: i128,
        init_tvl1: i128,
        current_tvl0: i128,
        current_tvl1: i128,
        current_amount0: i128,
        current_amount1: i128,
    ) -> (i128, i128) {
        Self::extend_all_storage_ttl(&env);
        let fee_cut_bps: u32 = env.storage().persistent().get(&FEE_CUT_BPS).unwrap();

        // Calculate benefits with overflow protection
        let total_profit = current_tvl0
            .checked_add(current_tvl1)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError))
            .checked_sub(
                init_tvl0
                    .checked_add(init_tvl1)
                    .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError)),
            )
            .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError));

        if total_profit <= 0 {
            return (0, 0); // no fee on loss
        }

        let fee_total = total_profit
            .checked_mul(fee_cut_bps as i128)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError))
            .checked_div(10_000)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError));

        let total_tvl = current_tvl0
            .checked_add(current_tvl1)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError));

        if total_tvl == 0 {
            return (0, 0);
        }

        // Calculate fee amounts with proper formula: fee_token = current_amount * fee_tvl / total_tvl
        // This distributes the fee proportionally based on current TVL, not profit
        let fee_token0 = current_amount0
            .checked_mul(fee_total)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError))
            .checked_div(total_tvl)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError));

        let fee_token1 = current_amount1
            .checked_mul(fee_total)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError))
            .checked_div(total_tvl)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError));

        (fee_token0, fee_token1)
    }

    /// Transfers the calculated fee amount to the multisig admin (LOBSTER) address.
    /// Uses contract authorization to enable the token transfer.
    ///
    /// # Parameters
    /// - `correct_token`: Address of the token to transfer
    /// - `amount_fee_cut`: Amount of tokens to transfer as fee
    ///
    /// # Panics
    /// If token transfer fails
    fn transfer_fee_cut(env: Env, correct_token: Address, amount_fee_cut: i128) {
        let lobster_address: Address = env.storage().persistent().get(&LOBSTER)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized));

        // Add authorization for the transfer
        env.authorize_as_current_contract(vec![
            &env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: correct_token.clone(),
                    fn_name: Symbol::new(&env, "transfer"),
                    args: vec![
                        &env,
                        env.current_contract_address().into_val(&env),
                        lobster_address.into_val(&env),
                        amount_fee_cut.into_val(&env),
                    ],
                },
                sub_invocations: vec![&env],
            }),
        ]);

        let mut transfer_args: Vec<Val> = vec![&env];
        transfer_args.push_back(env.current_contract_address().into_val(&env));
        transfer_args.push_back(lobster_address.into_val(&env));
        transfer_args.push_back(amount_fee_cut.into_val(&env));

        let _transfer = env
            .try_invoke_contract::<(), InvokeError>(
                &correct_token,
                &Symbol::new(&env, "transfer"),
                transfer_args,
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::TokenTransferFailed);
            });
    }

    /// Retrieves the underlying token amounts represented by LP position in a Phoenix pool.
    ///
    /// # Parameters
    /// - `pool_address`: Address of the Phoenix pool
    ///
    /// # Returns
    /// Tuple of (amount_a, amount_b) ordered to match contract's token0/token1
    ///
    /// # Panics
    /// If pool query fails or LP balance cannot be determined
    pub fn get_amounts_from_phoenix(env: Env, pool_address: Address) -> (i128, i128) {
        Self::extend_all_storage_ttl(&env);
        let (lp_balance, _lp_token) = Self::get_lp_phoenix(env.clone(), pool_address.clone());

        let ok_result = env
            .try_invoke_contract::<(Asset, Asset), InvokeError>(
                &pool_address,
                &Symbol::new(&env, "query_share"),
                vec![&env, lp_balance.into_val(&env)],
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::LpTokenBalanceQueryFailed);
            });

        let (asset0, asset1) = ok_result.unwrap_or_else(|_| {
            panic_with_error!(env, ContractError::LpTokenBalanceQueryFailed);
        });

        // Get TOKEN0 from storage to ensure correct ordering
        let token0: Address = env.storage().persistent().get(&TOKEN0)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized));

        // Order the amounts to match TOKEN0 (same logic as get_reserves for Phoenix)
        let (amount_a, amount_b) = if asset0.address != token0 {
            (asset1.amount, asset0.amount)
        } else {
            (asset0.amount, asset1.amount)
        };

        (amount_a, amount_b)
    }

    /// Retrieves the underlying token amounts represented by LP position in a Soroswap pool.
    /// Calculates amounts proportionally based on LP share of total supply.
    ///
    /// # Parameters
    /// - `pool_address`: Address of the Soroswap pool
    ///
    /// # Returns
    /// Tuple of (amount_a, amount_b) ordered to match contract's token0/token1
    ///
    /// # Panics
    /// If pool query fails or calculation overflows
    pub fn get_amounts_from_soroswap(env: Env, pool_address: Address) -> (i128, i128) {
        Self::extend_all_storage_ttl(&env);
        let lp_balance = Self::get_lp_soroswap(env.clone(), pool_address.clone());

        let (reserve0, reserve1) = Self::get_reserves(env.clone(), pool_address.clone(), 0);

        let total_lp = env
            .try_invoke_contract::<i128, InvokeError>(
                &pool_address.clone(),
                &Symbol::new(&env, "total_supply"),
                vec![&env],
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::LpTokenBalanceQueryFailed);
            });

        let total_lp = total_lp.unwrap();

        let amount_a = if total_lp != 0 {
            Self::calculate_proportional_amount(&env, reserve0, lp_balance, total_lp)
        } else {
            0i128
        };
        let amount_b = if total_lp != 0 {
            Self::calculate_proportional_amount(&env, reserve1, lp_balance, total_lp)
        } else {
            0i128
        };

        (amount_a, amount_b)
    }

    /// Retrieves the underlying token amounts represented by LP position in an Aquarius pool.
    /// Calculates amounts proportionally based on LP share of total supply.
    ///
    /// # Parameters
    /// - `pool_address`: Address of the Aquarius pool
    ///
    /// # Returns
    /// Tuple of (amount_a, amount_b) ordered to match contract's token0/token1
    ///
    /// # Panics
    /// If pool query fails or calculation overflows
    pub fn get_amounts_from_aquarius(env: Env, pool_address: Address) -> (i128, i128) {
        Self::extend_all_storage_ttl(&env);
        let (lp_balance, _lp_token) = Self::get_lp_aquarius(env.clone(), pool_address.clone());

        let (reserve0, reserve1) = Self::get_reserves(env.clone(), pool_address.clone(), 2);

        let total_lp_u = env
            .try_invoke_contract::<u128, InvokeError>(
                &pool_address.clone(),
                &Symbol::new(&env, "get_total_shares"),
                vec![&env],
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::LpTokenBalanceQueryFailed);
            });

        let total_lp_u = total_lp_u.unwrap_or_else(|_| {
            panic_with_error!(env, ContractError::LpTokenBalanceQueryFailed);
        });
        // Note: If total LP shares exceed i128::MAX, conversion will fail with AquariusReserveTooLarge
        let total_lp_i128 = i128::try_from(total_lp_u)
            .unwrap_or_else(|_| panic_with_error!(env, ContractError::AquariusReserveTooLarge));

        let amount_a = if total_lp_i128 != 0 {
            Self::calculate_proportional_amount(&env, reserve0, lp_balance, total_lp_i128)
        } else {
            0i128
        };
        let amount_b = if total_lp_i128 != 0 {
            Self::calculate_proportional_amount(&env, reserve1, lp_balance, total_lp_i128)
        } else {
            0i128
        };

        (amount_a, amount_b)
    }

    /// Returns the current token balances held directly by this contract (not in pools).
    ///
    /// # Returns
    /// Tuple of (amount0, amount1) - current balances of token0 and token1 in contract
    ///
    /// # Panics
    /// If token balance queries fail
    pub fn get_amounts_tokens(env: Env) -> (i128, i128) {
        Self::extend_all_storage_ttl(&env);
        let token0: Address = env.storage().persistent().get(&TOKEN0)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized));
        let token1: Address = env.storage().persistent().get(&TOKEN1)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized));

        let amount0 = env
            .try_invoke_contract::<i128, InvokeError>(
                &token0.clone(),
                &Symbol::new(&env, "balance"),
                vec![&env, env.current_contract_address().into_val(&env)],
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::LpTokenBalanceQueryFailed);
            });

        let amount1 = env
            .try_invoke_contract::<i128, InvokeError>(
                &token1.clone(),
                &Symbol::new(&env, "balance"),
                vec![&env, env.current_contract_address().into_val(&env)],
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::LpTokenBalanceQueryFailed);
            });

        (amount0.unwrap(), amount1.unwrap())
    }
}
