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
            panic!("Contract not initialized");
        }

        let owner: Address = env.storage().persistent().get(&OWNER).unwrap();
        let admin: Address = env.storage().persistent().get(&LOBSTER).unwrap();

        if caller != owner && caller != admin {
            panic_with_error!(env.clone(), ContractError::NotAuthorized);
        }
    }

    /// Reentrancy guard entry: sets a temporary flag, returns false if already set.
    fn enter_reentrancy(env: &Env) -> bool {
        let flag: bool = env.storage().temporary().get(&KEY_RENTR).unwrap_or(false);
        if flag {
            return false;
        }
        env.storage().temporary().set(&KEY_RENTR, &true);
        true
    }

    /// Reentrancy guard exit: clears the temporary flag.
    pub fn exit_reentrancy(env: &Env) {
        env.storage().temporary().set(&KEY_RENTR, &false);
    }

    /// Helper: Check if ratio (amount / desired) is within allowed slippage (in basis points)
    /// Returns true if (amount / desired) - 1 <= allowed_slippage_bps / 10000
    /// This is equivalent to: amount * 10000 <= desired * (10000 + allowed_slippage_bps)
    fn is_within_slippage(env: &Env, amount: i128, desired: i128, allowed_slippage_bps: i64) -> bool {
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

    pub fn get_owner(env: Env) -> Address {
        env.storage().persistent().get(&OWNER).unwrap()
    }

    pub fn get_multisig(env: Env) -> Address {
        env.storage().persistent().get(&LOBSTER).unwrap()
    }

    pub fn get_token0(env: Env) -> Address {
        env.storage().persistent().get(&TOKEN0).unwrap()
    }

    pub fn get_token1(env: Env) -> Address {
        env.storage().persistent().get(&TOKEN1).unwrap()
    }

    pub fn get_active_protocol(env: Env) -> u32 {
        env.storage().persistent().get(&ACT_DEX).unwrap()
    }

    pub fn get_actual_pool(env: Env) -> Address {
        env.storage().persistent().get(&ACT_POOL).unwrap()
    }

    pub fn get_actual_router(env: Env) -> Address {
        env.storage().persistent().get(&ACT_ROUTER).unwrap()
    }

    pub fn get_actual_share(env: Env) -> Address {
        env.storage().persistent().get(&ACT_SHARE).unwrap()
    }

    /// Pull tokens from `caller` into this contract using `transfer_from`.
    /// Access: only `owner` or multisig `admin`.
    pub fn deposit(env: Env, caller: Address, amount0: i128, amount1: i128) {
        if !env.storage().persistent().has(&OWNER) {
            panic!("Contract not initialized");
        }

        // Validate that amounts are non-negative
        if amount0 < 0 || amount1 < 0 {
            panic_with_error!(env, ContractError::InvalidAmount);
        }

        Self::require_owner_or_admin(&env, caller.clone());
        Self::enter_reentrancy(&env);

        let token0: Address = env.storage().persistent().get(&TOKEN0).unwrap();
        let token1: Address = env.storage().persistent().get(&TOKEN1).unwrap();

        let c0 = token::Client::new(&env, &token0);
        let c1 = token::Client::new(&env, &token1);
        let to = env.current_contract_address();

        // Pull funds from user into this contract
        // transfer_from requires spender auth; contracts can authorize themselves in-call
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
        if !env.storage().persistent().has(&OWNER) {
            panic!("Contract not initialized");
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

    /// Add liquidity through Phoenix pools. Computes correct token ordering and approvals.
    /// Access: only `owner` or multisig `admin`.
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

        let token0: Address = env.storage().persistent().get(&TOKEN0).unwrap();
        let token1: Address = env.storage().persistent().get(&TOKEN1).unwrap();

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

        let (approve0, approve1) = Self::get_deposit_amounts(
            &env,
            correct_amount0.clone(),
            Some(correct_amount0_min.clone()),
            correct_amount1.clone(),
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
                    correct_amount0.into_val(&env),
                    correct_amount0_min.into_val(&env),
                    correct_amount1.into_val(&env),
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
            1u32,
        );

        Self::exit_reentrancy(&env);
    }

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
        if !env.storage().persistent().has(&OWNER) {
            panic!("Contract not initialized");
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

    /// Add liquidity through Soroswap router with correct ordering and quoting.
    /// Access: only `owner` or multisig `admin`.
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

        let token0: Address = env.storage().persistent().get(&TOKEN0).unwrap();
        let token1: Address = env.storage().persistent().get(&TOKEN1).unwrap();

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

        let pool_address = pool_address_r.unwrap();

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
            pool_token0.unwrap(),
            amount0, // if you have these variables
            amount1, // if you have these variables
            amount0_min,
            amount1_min,
        );

        let (reserve0, reserve1) = Self::get_reserves(env.clone(), pool_address.clone(), 0);

        // let result1 = env
        //     .try_invoke_contract::<i128, InvokeError>(
        //         &router_address,
        //         &Symbol::new(&env, "quote"),
        //         vec![
        //             &env,
        //             correct_amount0.into_val(&env),
        //             reserve0.into_val(&env),
        //             reserve1.into_val(&env),
        //         ],
        //     )
        //     .unwrap_or_else(|_| {
        //         panic_with_error!(env, ContractError::RouterQuoteFailed);
        //     });

        // let result0 = env
        //     .try_invoke_contract::<i128, InvokeError>(
        //         &router_address,
        //         &Symbol::new(&env, "quote"),
        //         vec![
        //             &env,
        //             correct_amount1.into_val(&env),
        //             reserve1.into_val(&env),
        //             reserve0.into_val(&env),
        //         ],
        //     )
        //     .unwrap_or_else(|_| {
        //         panic_with_error!(env, ContractError::RouterQuoteFailed);
        //     });

        // let amount_a_optimal: i128 = result0.unwrap().into_val(&env);
        // let amount_b_optimal: i128 = result1.unwrap().into_val(&env);

        // Compute optimal amounts locally (same as router.quote)
        let amount_b_optimal = correct_amount0
            .checked_mul(reserve1)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError))
            .checked_div(reserve0)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError));

        let amount_a_optimal = correct_amount1
            .checked_mul(reserve0)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError))
            .checked_div(reserve1)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError));

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
            assert!(amount_a_optimal <= correct_amount0);

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

        let (_token0, _token1, liquidity_shares) = liquidity.unwrap();

        Self::save_n_publish(
            env.clone(),
            pool_address.clone(),
            liquidity_shares,
            approve0,
            approve1,
            "add_liq_soro",
            0u32,
        );

        env.storage()
            .persistent()
            .set(&ACT_ROUTER, &router_address.clone());

        Self::exit_reentrancy(&env);
    }

    pub fn add_liquidity_aquarius(
        env: Env,
        caller: Address,
        amount0: i128,
        amount1: i128,
        pool_address: Address,
    ) {
        if !env.storage().persistent().has(&OWNER) {
            panic!("Contract not initialized");
        }

        Self::require_owner_or_admin(&env, caller.clone());

        Self::add_liquidity_aquarius_internal(
            env.clone(),
            amount0.clone(),
            amount1.clone(),
            pool_address.clone(),
        );
    }

    /// Add liquidity to an Aquarius pool using its deposit method.
    /// Access: only `owner` or multisig `admin`.
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

        let token0: Address = env.storage().persistent().get(&TOKEN0).unwrap();
        let token1: Address = env.storage().persistent().get(&TOKEN1).unwrap();

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

        let liquidity_shares = liquidity.unwrap().1 as i128;

        Self::save_n_publish(
            env.clone(),
            pool_address.clone(),
            liquidity_shares,
            correct_amount0,
            correct_amount1,
            "add_liq_aqua",
            2u32,
        );

        Self::exit_reentrancy(&env);
    }

    pub fn withdraw_aquarius(
        env: Env,
        caller: Address,
        pool_address: Address,
        amount0_min: u128,
        amount1_min: u128,
    ) {
        if !env.storage().persistent().has(&OWNER) {
            panic!("Contract not initialized");
        }

        Self::require_owner_or_admin(&env, caller.clone());

        Self::withdraw_aquarius_internal(
            env.clone(),
            pool_address.clone(),
            amount0_min.clone(),
            amount1_min.clone(),
        );
    }
    /// Withdraw all LP from an Aquarius pool and redeem underlying tokens.
    /// Access: only `owner` or multisig `admin`.
    fn withdraw_aquarius_internal(
        env: Env,
        pool_address: Address,
        amount0_min: u128,
        amount1_min: u128,
    ) {
        // fn withdraw(e: Env, user: Address, share_amount: u128, min_amounts: Vec<u128>) -> Vec<u128>

        Self::enter_reentrancy(&env);

        let token0: Address = env.storage().persistent().get(&TOKEN0).unwrap();
        let _token1: Address = env.storage().persistent().get(&TOKEN1).unwrap();

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

        let correct_amount0 = i128::try_from(
            withdraw_result.get(0).unwrap_or_else(|| {
                panic_with_error!(env, ContractError::AquariusWithdrawFailed);
            })
        ).unwrap_or_else(|_| panic_with_error!(env, ContractError::ContractMathError));
        let correct_amount1 = i128::try_from(
            withdraw_result.get(1).unwrap_or_else(|| {
                panic_with_error!(env, ContractError::AquariusWithdrawFailed);
            })
        ).unwrap_or_else(|_| panic_with_error!(env, ContractError::ContractMathError));

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
        env.storage().persistent().set(&ACT_DEX, &5);

        Self::exit_reentrancy(&env);
    }

    /// Returns the current LP token balance and LP token address for an Aquarius pool.
    pub fn get_lp_aquarius(env: Env, pool_address: Address) -> (i128, Address) {
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

    pub fn withdraw_phoenix(
        env: Env,
        caller: Address,
        pool_address: Address,
        amount0_min: i128,
        amount1_min: i128,
        deadline: u64,
    ) {
        if !env.storage().persistent().has(&OWNER) {
            panic!("Contract not initialized");
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

    /// Withdraw all LP from a Phoenix pool and redeem underlying tokens.
    /// Access: only `owner` or multisig `admin`.
    fn withdraw_phoenix_internal(
        env: Env,
        pool_address: Address,
        amount0_min: i128,
        amount1_min: i128,
        deadline: u64,
    ) {
        Self::enter_reentrancy(&env);

        let token0: Address = env.storage().persistent().get(&TOKEN0).unwrap();
        let _token1: Address = env.storage().persistent().get(&TOKEN1).unwrap();

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
        env.storage().persistent().set(&ACT_DEX, &5);

        Self::exit_reentrancy(&env);
    }

    /// Returns the current LP token balance and LP token address for a Phoenix pool.
    pub fn get_lp_phoenix(env: Env, pool_address: Address) -> (i128, Address) {
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

    pub fn withdraw_soroswap(
        env: Env,
        caller: Address,
        amount0_min: i128,
        amount1_min: i128,
        pool_address: Address,
        router_address: Address,
        deadline: u64,
    ) {
        if !env.storage().persistent().has(&OWNER) {
            panic!("Contract not initialized");
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
    /// Withdraw LP through the Soroswap router and redeem underlying tokens.
    /// Access: only `owner` or multisig `admin`.
    // fn withdraw(e: Env, to: Address) -> (i128, i128);
    // fn remove_liquidity(token_a: address, token_b: address, liquidity: i128, amount_a_min: i128, amount_b_min: i128, to: address, deadline: u64) -> result<tuple<i128,i128>,CombinedRouterError>
    fn withdraw_soroswap_internal(
        env: Env,
        amount0_min: i128,
        amount1_min: i128,
        pool_address: Address,
        router_address: Address,
        deadline: u64,
    ) {
        Self::enter_reentrancy(&env);

        let token0: Address = env.storage().persistent().get(&TOKEN0).unwrap();
        let token1: Address = env.storage().persistent().get(&TOKEN1).unwrap();

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
            pool_token0.unwrap(),
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
        env.storage().persistent().set(&ACT_DEX, &5);

        Self::exit_reentrancy(&env);
    }

    /// Returns the current LP token balance for a Soroswap pool (LP token is the pool address).
    pub fn get_lp_soroswap(env: Env, pool_address: Address) -> i128 {
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

    pub fn migrate_pool(
        env: Env,
        caller: Address,
        target_pool: u32,              // 0: Soroswap, 1: Phoenix, 2: Aquarius
        pool_addresses: PoolAddresses, // All pool addresses
        withdraw_params: WithdrawParams,
        add_liquidity_params: AddLiquidityParams,
    ) {
        if !env.storage().persistent().has(&OWNER) {
            panic!("Contract not initialized");
        }

        Self::require_owner_or_admin(&env, caller.clone());

        // Get current pool
        let current_pool = Self::get_active_protocol(env.clone());

        // 1. Withdraw from current pool
        match current_pool {
            0 => {
                // Soroswap: withdraw_soroswap(env, caller, amount0_min, amount1_min, pool_address, router_address, deadline)
                let deadline = withdraw_params.deadline.unwrap_or(0);
                Self::withdraw_soroswap_internal(
                    env.clone(),
                    withdraw_params.amount0_min,
                    withdraw_params.amount1_min,
                    pool_addresses.soroswap_pool.clone(),
                    pool_addresses.soroswap_router.clone(),
                    deadline,
                );
            }
            1 => {
                // Phoenix: withdraw_phoenix(env, caller, amount_lp, pool_address, amount0_min, amount1_min, deadline, auto_unstake)
                let deadline = withdraw_params.deadline.unwrap_or(0);
                let amount_lp = withdraw_params.amount_lp.unwrap_or(0);
                let auto_unstake = withdraw_params.auto_unstake.unwrap_or(false);
                Self::withdraw_phoenix_internal(
                    env.clone(),
                    pool_addresses.phoenix_pool.clone(),
                    withdraw_params.amount0_min,
                    withdraw_params.amount1_min,
                    deadline,
                );
            }
            2 => {
                // Aquarius: withdraw_aquarius(env, caller, pool_address, amount0_min, amount1_min)
                // Note: Aquarius uses u128 for min amounts, but we store as i128 and cast
                Self::withdraw_aquarius_internal(
                    env.clone(),
                    pool_addresses.aquarius_pool.clone(),
                    withdraw_params.amount0_min as u128,
                    withdraw_params.amount1_min as u128,
                );
            }
            _ => panic!("Invalid current pool"),
        }

        // Get the amounts withdrawn - they should now be in the contract
        // The withdraw functions handle transferring tokens to the contract

        let (amount0, amount1) = Self::get_amounts_tokens(env.clone());

        // 2. Add liquidity to target pool
        match target_pool {
            0 => {
                // Soroswap: add_liquidity_soroswap(env, caller, amount0, amount1, amount0_min, amount1_min, deadline_ledger, router_address)
                let deadline = add_liquidity_params.deadline.unwrap_or(0);
                let amount0 = add_liquidity_params.amount0.unwrap_or(amount0);
                let amount1 = add_liquidity_params.amount1.unwrap_or(amount1);
                Self::add_liquidity_soroswap_internal(
                    env.clone(),
                    amount0,
                    amount1,
                    add_liquidity_params.amount0_min,
                    add_liquidity_params.amount1_min,
                    deadline,
                    pool_addresses.soroswap_router.clone(),
                );
            }
            1 => {
                // Phoenix: add_liquidity_phoenix(env, caller, amount0, amount1, amount0_min, amount1_min, pool_address, deadline, slippage)
                let deadline = add_liquidity_params.deadline.unwrap_or(0);
                let slippage = add_liquidity_params.slippage.unwrap_or(500); // Default 5% slippage
                let amount0 = add_liquidity_params.amount0.unwrap_or(amount0);
                let amount1 = add_liquidity_params.amount1.unwrap_or(amount1);
                Self::add_liquidity_phoenix_internal(
                    env.clone(),
                    amount0,
                    amount1,
                    add_liquidity_params.amount0_min,
                    add_liquidity_params.amount1_min,
                    pool_addresses.phoenix_pool.clone(),
                    deadline,
                    slippage,
                );
            }
            2 => {
                // Aquarius: add_liquidity_aquarius(env, caller, amount0, amount1, pool_address)
                let amount0 = add_liquidity_params.amount0.unwrap_or(amount0);
                let amount1 = add_liquidity_params.amount1.unwrap_or(amount1);
                Self::add_liquidity_aquarius_internal(
                    env.clone(),
                    amount0,
                    amount1,
                    pool_addresses.aquarius_pool.clone(),
                );
            }
            3 => {
                // Withdraw from contract: completely empty the contract
                Self::withdraw_contract_internal(
                    env.clone(),
                    caller.clone(),
                    amount0.clone(),
                    amount1.clone(),
                );
                // Don't update ACT_DEX since we're withdrawing completely
                //env.storage().persistent().remove(&ACT_DEX);
                return;
            }
            _ => panic!("Invalid target pool"),
        }

        // Update active protocol
        //env.storage().persistent().set(&ACT_DEX, &target_pool);

        // Emit migrate event
        env.events().publish(
            (symbol_short!("lostr_mig"), caller.clone()),
            (&current_pool, &target_pool),
        );
    }

    pub fn withdraw_contract(env: Env, caller: Address, amount0: i128, amount1: i128) {
        if !env.storage().persistent().has(&OWNER) {
            panic!("Contract not initialized");
        }

        Self::require_owner_or_admin(&env, caller.clone());

        Self::withdraw_contract_internal(
            env.clone(),
            caller.clone(),
            amount0.clone(),
            amount1.clone(),
        );
    }

    /// Transfer `amount0` and `amount1` of the underlying tokens from this contract to `caller`.
    /// Access: only `owner` or multisig `admin`.
    fn withdraw_contract_internal(env: Env, caller: Address, amount0: i128, amount1: i128) {
        // Validate that amounts are non-negative
        if amount0 < 0 || amount1 < 0 {
            panic_with_error!(env, ContractError::InvalidAmount);
        }

        let token0: Address = env.storage().persistent().get(&TOKEN0).unwrap();
        let token1: Address = env.storage().persistent().get(&TOKEN1).unwrap();

        let spender: Address = env.current_contract_address();

        let owner: Address = env.storage().persistent().get(&OWNER).unwrap();

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

    // Add this helper function to your contract implementation
    fn correct_token_order(
        env: Env,
        pool_token0: Address,
        amount0: i128,
        amount1: i128,
        amount0_min: i128,
        amount1_min: i128,
    ) -> (Address, Address, i128, i128, i128, i128) {
        let token0: Address = env.storage().persistent().get(&TOKEN0).unwrap();
        let token1: Address = env.storage().persistent().get(&TOKEN1).unwrap();

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

    fn calculate_fee_cut(
        env: Env,
        amount0: i128,
        amount1: i128,
        last_pool_balance_a: i128,
        last_pool_balance_b: i128,
    ) -> (i128, i128) {
        let fee_cut_bps = env.storage().persistent().get(&FEE_CUT_BPS).unwrap_or(0);

        let benefit_a = amount0 - last_pool_balance_a;
        let benefit_b = amount1 - last_pool_balance_b;

        let amount0_fee_cut = benefit_a * fee_cut_bps / 10000;
        let amount1_fee_cut = benefit_b * fee_cut_bps / 10000;

        (amount0_fee_cut, amount1_fee_cut)
    }

    fn save_n_publish(
        env: Env,
        pool_address: Address,
        liquidity_shares: i128,
        correct_amount0: i128,
        correct_amount1: i128,
        event_name: &str,
        protocol: u32,
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

    pub fn can_withdraw(env: Env) -> bool {
        if env
            .storage()
            .persistent()
            .get::<Symbol, i128>(&ACT_SHARE)
            .unwrap()
            == 0
        {
            return true;
        } else {
            return false;
        }
    }

    pub fn get_reserves(env: Env, pool_address: Address, protocol_tvl: u32) -> (i128, i128) {
        let (reserve0, reserve1) = match protocol_tvl {
            0 => {
                // Soroswap protocol - get reserves directly
                env.try_invoke_contract::<(i128, i128), InvokeError>(
                    &pool_address,
                    &Symbol::new(&env, "get_reserves"),
                    vec![&env],
                )
                .unwrap_or_else(|_| {
                    panic_with_error!(env, ContractError::QueryPoolInfoFailed);
                })
                .expect("Conversion error")
            }
            1 => {
                // Phoenix protocol - get pool info first
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

                (pool_info.asset_a.amount, pool_info.asset_b.amount)
            }
            2 => {
                // Aquarius protocol - get reserves directly
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

                (
                    pool_info.get(0).unwrap_or_else(|| {
                        panic_with_error!(env, ContractError::QueryPoolInfoFailed);
                    }) as i128,
                    pool_info.get(1).unwrap_or_else(|| {
                        panic_with_error!(env, ContractError::QueryPoolInfoFailed);
                    }) as i128,
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

    // TODO: add protocol_tvl to the function
    pub fn get_prices_from_reserves(env: Env, reserve0: i128, reserve1: i128) -> (i128, i128) {

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

    pub fn get_token_tvl_from_reserves(
        env: Env,
        amount0: i128,
        amount1: i128,
        price0_in_1: i128,
        price1_in_0: i128,
    ) -> (i128, i128) {
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

    pub fn get_fee_cut(
        env: Env,
        init_tvl0: i128,
        init_tvl1: i128,
        current_tvl0: i128,
        current_tvl1: i128,
        current_amount0: i128,
        current_amount1: i128,
    ) -> (i128, i128) {
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

    pub fn transfer_fee_cut(env: Env, correct_token: Address, amount_fee_cut: i128) {
        let lobster_address: Address = env.storage().persistent().get(&LOBSTER).unwrap();

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

    pub fn get_amounts_from_phoenix(env: Env, pool_address: Address) -> (i128, i128) {
        let (lp_balance, lp_token) = Self::get_lp_phoenix(env.clone(), pool_address.clone());

        let ok_result = env
            .try_invoke_contract::<(i128, i128), InvokeError>(
                &lp_token,
                &Symbol::new(&env, "query_share"),
                vec![&env, lp_balance.into_val(&env)],
            )
            .unwrap_or_else(|_| {
                panic_with_error!(env, ContractError::LpTokenBalanceQueryFailed);
            });

        let (amount0, amount1) = ok_result.unwrap_or_else(|_| {
            panic_with_error!(env, ContractError::LpTokenBalanceQueryFailed);
        });

        (amount0, amount1)
    }

    pub fn get_amounts_from_soroswap(env: Env, pool_address: Address) -> (i128, i128) {
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

    pub fn get_amounts_from_aquarius(env: Env, pool_address: Address) -> (i128, i128) {
        let (lp_balance, lp_token) = Self::get_lp_aquarius(env.clone(), pool_address.clone());

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

        let total_lp_u = total_lp_u.unwrap();
        let total_lp_i128 = i128::try_from(total_lp_u)
            .unwrap_or_else(|_| panic_with_error!(env, ContractError::ContractMathError));

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

    pub fn get_amounts_tokens(env: Env) -> (i128, i128) {
        let token0: Address = env.storage().persistent().get(&TOKEN0).unwrap();
        let token1: Address = env.storage().persistent().get(&TOKEN1).unwrap();

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

// // Only calculate fee cuts for positive benefits (no fees on losses)
// let amount0_fee_cut = if benefit_a > 0 {
//     benefit_a
//         .checked_mul(fee_cut_bps as i128)
//         .unwrap_or_else(|| {
//             panic_with_error!(env, ContractError::ContractMathError);
//         })
//         .checked_div(10000)
//         .unwrap_or_else(|| {
//             panic_with_error!(env, ContractError::ContractMathError);
//         })
// } else {
//     0
// };

// // let amount1_fee_cut = if benefit_b > 0 {
// //     benefit_b
// //         .checked_mul(fee_cut_bps as i128)
// //         .unwrap_or_else(|| {
// //             panic_with_error!(env, ContractError::ContractMathError);
// //         })
// //         .checked_div(10000)
// //         .unwrap_or_else(|| {
// //             panic_with_error!(env, ContractError::ContractMathError);
// //         })
// // } else {
// //     0
// // };
