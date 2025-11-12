#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, symbol_short, vec, xdr::ToXdr, Address,
    Bytes, BytesN, Env, IntoVal, InvokeError, Symbol, Val, Vec,
};

mod error;
mod test;

use error::ContractError;

#[contracttype]
#[derive(Clone)]
pub struct LobsterPools {
    /// The asset A in the pool together with asset amounts
    token0: Address,
    /// The asset B in the pool together with asset amounts
    token1: Address,
    /// The address of the lobster contract for the liquidity pool
    lobster_address: Address,
    /// The address of the owner of the pool
    owner: Address,
}

const KEY_RENTR: Symbol = symbol_short!("KEY_RENTR");

const ADMIN: Symbol = symbol_short!("admin");
const LOBSTER_POOLS_ID: Symbol = symbol_short!("lob_pl_id");
const LOBSTER_POOLS_ADR: Symbol = symbol_short!("lob_pl_ad");
const LOBSTER_POOL_COUNT: Symbol = symbol_short!("lob_count");
const LOBSTER_POOL_USER: Symbol = symbol_short!("lob_adr");
const LOBSTER_POOL_TOKEN: Symbol = symbol_short!("lob_token");

const LOBSTER_WASM_HASH: Symbol = symbol_short!("lob_hash");

// Add these constants after the existing ones
const PENDING_FEE_CHANGE: Symbol = symbol_short!("PEND_FEE");
const FEES: Symbol = symbol_short!("FEES");

// Add this struct after LobsterPools
#[contracttype]
#[derive(Clone)]
pub struct PendingFeeChange {
    /// The new fee value in basis points
    new_fee_bps: u32,
    /// The timestamp when the change was announced
    announcement_timestamp: u64,
    /// The timestamp when the change can be executed (announcement + delay)
    execution_timestamp: u64,
}

#[contract]
pub struct Factory;

#[contractimpl]
impl Factory {
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

    pub fn __constructor(env: Env, admin: Address, wasm_hash: BytesN<32>, fee_bps: u32) {
        // Prevent re-initialization: check if contract is already initialized
        if env.storage().persistent().has(&ADMIN) {
            panic_with_error!(env, ContractError::AlreadyInitialized);
        }

        admin.require_auth();

        // Validate fee value (0-10000 basis points = 0-100%)
        if fee_bps > 10000 {
            panic_with_error!(env, ContractError::InvalidFeeValue);
        }

        env.storage().persistent().set(&ADMIN, &admin);

        let lobster_pools: Vec<LobsterPools> = Vec::new(&env);

        env.storage()
            .persistent()
            .set(&LOBSTER_POOLS_ID, &lobster_pools);
        env.storage()
            .persistent()
            .set(&LOBSTER_POOLS_ADR, &lobster_pools);

        env.storage().persistent().set(&LOBSTER_POOL_COUNT, &0u64);

        env.storage()
            .persistent()
            .set(&LOBSTER_WASM_HASH, &wasm_hash);

        env.storage().persistent().set(&FEES, &fee_bps);
    }

    pub fn create_pool(env: Env, user: Address, token0: Address, token1: Address) -> Address {
        if !env.storage().persistent().has(&ADMIN) {
            panic_with_error!(env, ContractError::NotInitialized);
        }

        if !Self::enter_reentrancy(&env) {
            panic_with_error!(env, ContractError::AlreadyExists); // or appropriate error
        }
        user.require_auth();

        // Validate that token0 and token1 are distinct
        if token0 == token1 {
            panic_with_error!(env, ContractError::InvalidPoolTokens);
        }

        let admin: Address = env
            .storage()
            .persistent()
            .get::<Symbol, Address>(&ADMIN)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized));

        let lobster_pool_count: u64 = env
            .storage()
            .persistent()
            .get::<Symbol, u64>(&LOBSTER_POOL_COUNT)
            .unwrap_or(0);

        let mut lobster_user = env
            .storage()
            .persistent()
            .get::<(Symbol, Address), Vec<LobsterPools>>(&(LOBSTER_POOL_USER, user.clone()))
            .unwrap_or_else(|| Vec::new(&env));

        //get lobster token from storage
        let mut lobster_token = env
            .storage()
            .persistent()
            .get::<(Symbol, Address, Address), Vec<LobsterPools>>(&(
                LOBSTER_POOL_TOKEN,
                token0.clone(),
                token1.clone(),
            ))
            .unwrap_or_else(|| Vec::new(&env));

        if Self::pool_exists(&env, &user, &token0, &token1) {
            panic_with_error!(env, ContractError::AlreadyExists);
        }

        //get wasm hash from storage
        let wasm_hash = env
            .storage()
            .persistent()
            .get::<Symbol, BytesN<32>>(&LOBSTER_WASM_HASH)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized));

        // Generate salt from timestamp
        // Generate salt from timestamp + pool_count to ensure uniqueness

        let salt = {
            let mut salt_data = Bytes::new(&env);
            salt_data.append(&token0.clone().to_xdr(&env));
            salt_data.append(&token1.clone().to_xdr(&env));
            salt_data.append(&user.clone().to_xdr(&env));

            // Hash to get deterministic 32-byte salt
            env.crypto().sha256(&salt_data)
        };
        let fee_bps = env.storage().persistent().get(&FEES).unwrap_or(0u32);

        let deploy_args: Vec<Val> = vec![
            &env,
            user.clone().into_val(&env),
            admin.into_val(&env),
            token0.into_val(&env),
            token1.into_val(&env),
            fee_bps.into_val(&env),
        ];

        let deployed_address = env
            .deployer()
            .with_address(env.current_contract_address(), salt)
            .deploy_v2(wasm_hash, deploy_args);

        let lobster_pool = LobsterPools {
            token0: token0.clone(),
            token1: token1.clone(),
            lobster_address: deployed_address.clone(),
            owner: user.clone(),
        };

        let lobster_pool_new_count = lobster_pool_count
            .checked_add(1)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::ContractMathError));

        lobster_user.push_back(lobster_pool.clone());

        lobster_token.push_back(lobster_pool.clone());

        env.storage()
            .persistent()
            .set(&LOBSTER_POOL_COUNT, &lobster_pool_new_count);

        env.storage().persistent().set(
            &(LOBSTER_POOLS_ID, lobster_pool_new_count.clone()),
            &lobster_pool.clone(),
        );

        env.storage().persistent().set(
            &(LOBSTER_POOLS_ADR, deployed_address.clone()),
            &lobster_pool.clone(),
        );

        env.storage()
            .persistent()
            .set(&(LOBSTER_POOL_USER, user.clone()), &lobster_user.clone());

        env.storage().persistent().set(
            &(LOBSTER_POOL_TOKEN, token0.clone(), token1.clone()),
            &lobster_token.clone(),
        );

        Self::exit_reentrancy(&env);

        return deployed_address;
    }

    fn pool_exists(env: &Env, user: &Address, token0: &Address, token1: &Address) -> bool {
        // Try both (token0, token1) and (token1, token0)
        let existing_a = env
            .storage()
            .persistent()
            .get::<(Symbol, Address, Address), Vec<LobsterPools>>(&(
                LOBSTER_POOL_TOKEN,
                token0.clone(),
                token1.clone(),
            ));

        let existing_b = env
            .storage()
            .persistent()
            .get::<(Symbol, Address, Address), Vec<LobsterPools>>(&(
                LOBSTER_POOL_TOKEN,
                token1.clone(),
                token0.clone(),
            ));

        // Check if any pool matches the user
        let found_a = existing_a.map_or(false, |v| v.iter().any(|p| p.owner == *user));

        let found_b = existing_b.map_or(false, |v| v.iter().any(|p| p.owner == *user));

        found_a || found_b
    }

    // Getters
    pub fn get_admin(env: Env) -> Address {
        let admin: Address = env
            .storage()
            .persistent()
            .get::<Symbol, Address>(&ADMIN)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::NotInitialized));
        admin
    }

    pub fn get_wasm_hash(env: Env) -> BytesN<32> {
        // Prefer instance storage; fall back to default zeroed hash
        env.storage()
            .persistent()
            .get::<Symbol, BytesN<32>>(&LOBSTER_WASM_HASH)
            .unwrap_or_else(|| BytesN::from_array(&env, &[0; 32]))
    }

    pub fn get_pool_count(env: Env) -> u64 {
        let lobster_pool_count: u64 = env
            .storage()
            .persistent()
            .get::<Symbol, u64>(&LOBSTER_POOL_COUNT)
            .unwrap_or(0u64);
        lobster_pool_count
    }

    pub fn get_pool_by_id(env: Env, id: u64) -> Option<LobsterPools> {
        env.storage()
            .persistent()
            .get::<(Symbol, u64), LobsterPools>(&(LOBSTER_POOLS_ID, id))
    }

    pub fn get_pool_by_address(env: Env, addr: Address) -> Option<LobsterPools> {
        env.storage()
            .persistent()
            .get::<(Symbol, Address), LobsterPools>(&(LOBSTER_POOLS_ADR, addr))
    }

    pub fn get_pools_by_user(env: Env, user: Address) -> Vec<LobsterPools> {
        env.storage()
            .persistent()
            .get::<(Symbol, Address), Vec<LobsterPools>>(&(LOBSTER_POOL_USER, user))
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn get_pools_by_tokens(env: Env, token0: Address, token1: Address) -> Vec<LobsterPools> {
        let a = env
            .storage()
            .persistent()
            .get::<(Symbol, Address, Address), Vec<LobsterPools>>(&(
                LOBSTER_POOL_TOKEN,
                token0.clone(),
                token1.clone(),
            ))
            .unwrap_or_else(|| Vec::new(&env));
        let b = env
            .storage()
            .persistent()
            .get::<(Symbol, Address, Address), Vec<LobsterPools>>(&(
                LOBSTER_POOL_TOKEN,
                token1.clone(),
                token0.clone(),
            ))
            .unwrap_or_else(|| Vec::new(&env));
        // Concatenate results
        let mut out = Vec::new(&env);
        for p in a.iter() {
            out.push_back(p.clone());
        }
        for p in b.iter() {
            out.push_back(p.clone());
        }
        out
    }

    // Setters (admin only)
    pub fn set_admin(env: Env, new_admin: Address) {
        if !env.storage().persistent().has(&ADMIN) {
            panic_with_error!(env, ContractError::NotInitialized);
        }
        let current_admin: Address = env.storage().persistent().get(&ADMIN).unwrap();
        current_admin.require_auth();
        env.storage().persistent().set(&ADMIN, &new_admin);
    }

    pub fn set_wasm_hash(env: Env, wasm_hash: BytesN<32>) {
        if !env.storage().persistent().has(&ADMIN) {
            panic_with_error!(env, ContractError::NotInitialized);
        }
        let admin: Address = env.storage().persistent().get(&ADMIN).unwrap();
        admin.require_auth();
        env.storage()
            .persistent()
            .set(&LOBSTER_WASM_HASH, &wasm_hash);
    }

    // Add these functions at the end of the impl Factory block, before the closing brace

    /// Announce a fee change. This starts the 2-week delay period.
    /// Access: admin only
    pub fn announce_fee_change(env: Env, new_fee_bps: u32) {
        if !env.storage().persistent().has(&ADMIN) {
            panic_with_error!(env, ContractError::NotInitialized);
        }

        let admin: Address = env.storage().persistent().get(&ADMIN).unwrap();
        admin.require_auth();

        // Validate fee value (0-10000 basis points = 0-100%)
        if new_fee_bps > 10000 {
            panic_with_error!(env, ContractError::InvalidFeeValue);
        }

        // Prevent overwriting an existing pending fee change
        if env.storage().persistent().has(&PENDING_FEE_CHANGE) {
            panic_with_error!(env, ContractError::FeeChangeAlreadyPending);
        }

        let current_timestamp = env.ledger().timestamp();
        let delay_period = 14 * 24 * 60 * 60; // 14 days in seconds
        let execution_timestamp = current_timestamp + delay_period;

        let pending_change = PendingFeeChange {
            new_fee_bps,
            announcement_timestamp: current_timestamp,
            execution_timestamp,
        };

        env.storage()
            .persistent()
            .set(&PENDING_FEE_CHANGE, &pending_change);

        // Emit event
        env.events().publish(
            (symbol_short!("fee_chge"), admin.clone()),
            (new_fee_bps, current_timestamp, execution_timestamp),
        );
    }

    /// Execute the announced fee change after the delay period has passed.
    /// Access: admin only
    pub fn execute_fee_change(env: Env) {
        if !env.storage().persistent().has(&ADMIN) {
            panic_with_error!(env, ContractError::NotInitialized);
        }

        let admin: Address = env.storage().persistent().get(&ADMIN).unwrap();
        admin.require_auth();

        let pending_change: PendingFeeChange = env
            .storage()
            .persistent()
            .get(&PENDING_FEE_CHANGE)
            .unwrap_or_else(|| panic_with_error!(env, ContractError::FeeChangeNotAnnounced));

        let current_timestamp = env.ledger().timestamp();

        if current_timestamp < pending_change.execution_timestamp {
            panic_with_error!(env, ContractError::FeeChangeNotReady);
        }

        env.storage()
            .persistent()
            .set(&FEES, &pending_change.new_fee_bps);

        // Clear the pending change
        env.storage().persistent().remove(&PENDING_FEE_CHANGE);

        // Emit event
        env.events().publish(
            (symbol_short!("fee_apply"), admin.clone()),
            pending_change.new_fee_bps,
        );
    }
}
