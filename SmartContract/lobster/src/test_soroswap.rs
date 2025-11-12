// SmartContract/lobster/src/test_soroswap.rs
#![allow(dead_code)]
#![cfg(test)]

use crate::{Lobster, LobsterClient};
use soroban_sdk::{
    Address, Env, Symbol, Vec, contract, contractimpl, symbol_short, testutils::{Address as _, Ledger, LedgerInfo}, token, vec, Val, IntoVal
};

// Mock Soroswap Pool Contract (acts as LP token too)
#[contract]
pub struct MockSoroswapPool;

#[contractimpl]
impl MockSoroswapPool {
    pub fn token_0(env: Env) -> Address {
        // Deterministic address for token0
        Address::generate(&env)
    }

    pub fn get_reserves(_env: Env) -> (i128, i128) {
        (1000i128, 2000i128)
    }

    // LP balance of an account (pool is LP token)
    pub fn balance(_env: Env, _account: Address) -> i128 {
        1000i128
    }

    // Accept LP transfer from the contract (no-op in mock)
    pub fn transfer(_env: Env, _from: Address, _to: Address, _amount: i128) {}

    // Total LP supply
    pub fn total_supply(_env: Env) -> i128 { 10_000i128 }
}

// Mock Soroswap Router
#[contract]
pub struct MockSoroswapRouter;

#[contractimpl]
impl MockSoroswapRouter {
    pub fn initialize(env: Env, pool_address: Address) {
        env.storage().persistent().set(&symbol_short!("POOL"), &pool_address);
    }

    // Map a token pair to a pool
    pub fn router_pair_for(env: Env, _token_a: Address, _token_b: Address) -> Address {
        env.storage()
            .persistent()
            .get(&symbol_short!("POOL"))
            .unwrap_or_else(|| Address::generate(&env))
    }

    // Router add_liquidity returns (amountA, amountB, liquidity)
    pub fn add_liquidity(
        _env: Env,
        _token_a: Address,
        _token_b: Address,
        amount_a_desired: i128,
        amount_b_desired: i128,
        _amount_a_min: i128,
        _amount_b_min: i128,
        _to: Address,
        _deadline: u64,
    ) -> (i128, i128, i128) {
        // Return the desired amounts directly and a fixed liquidity
        (amount_a_desired, amount_b_desired, 1000i128)
    }

    // Router remove_liquidity returns (amountA, amountB)
    pub fn remove_liquidity(
        _env: Env,
        _token_a: Address,
        _token_b: Address,
        liquidity: i128,
        _amount_a_min: i128,
        _amount_b_min: i128,
        _to: Address,
        _deadline: u64,
    ) -> (i128, i128) {
        // Split liquidity arbitrarily into token amounts for predictability
        let a = liquidity / 2;
        let b = liquidity - a;
        (a, b)
    }
}

// Helpers
pub fn create_token_contract<'a>(e: &Env, admin: &Address) -> (token::Client<'a>, token::StellarAssetClient<'a>) {
    let sac = e.register_stellar_asset_contract_v2(admin.clone());
    (token::Client::new(e, &sac.address()), token::StellarAssetClient::new(e, &sac.address()))
}

pub fn create_mock_soroswap_pool<'a>(env: &Env) -> MockSoroswapPoolClient<'a> {
    MockSoroswapPoolClient::new(env, &env.register(MockSoroswapPool {}, ()))
}

pub fn create_mock_soroswap_router<'a>(env: &Env, pool_address: &Address) -> MockSoroswapRouterClient<'a> {
    let router_id = env.register(MockSoroswapRouter {}, ());
    let router_client = MockSoroswapRouterClient::new(env, &router_id);
    router_client.initialize(pool_address);
    router_client
}

// Test setup struct for Soroswap-specific tests
pub struct SoroswapTestSetup {
    pub env: Env,
    pub owner: Address,
    pub multisig: Address,
    pub token0_address: Address,
    pub token1_address: Address,
    pub lobster_id: Address,
    pub mock_soroswap_pool_address: Address,
    pub mock_soroswap_router_address: Address,
}

impl SoroswapTestSetup {
    pub fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set(LedgerInfo {
            timestamp: 12345,
            protocol_version: 22,
            sequence_number: 10,
            network_id: Default::default(),
            base_reserve: 10,
            min_temp_entry_ttl: 10,
            min_persistent_entry_ttl: 10,
            max_entry_ttl: 1000000,
        });

        let owner = Address::generate(&env);
        let multisig = Address::generate(&env);
        let token_admin = Address::generate(&env);

        // Create tokens and mint
        let (token0, token0_admin) = create_token_contract(&env, &token_admin);
        let (token1, token1_admin) = create_token_contract(&env, &token_admin);
        token0_admin.mint(&owner, &1000000);
        token1_admin.mint(&owner, &1000000);

        // Deploy lobster with initialization args
        let deploy_args: Vec<Val> = vec![
            &env,
            owner.clone().into_val(&env),
            multisig.clone().into_val(&env),
            token0.address.into_val(&env),
            token1.address.into_val(&env),
            100u32.into_val(&env),
        ];

        let lobster_id = env.register(Lobster, deploy_args);

        // Mock pool and router
        let mock_pool = create_mock_soroswap_pool(&env);
        let mock_soroswap_pool_address = mock_pool.address.clone();
        let mock_router = create_mock_soroswap_router(&env, &mock_soroswap_pool_address);
        let mock_soroswap_router_address = mock_router.address.clone();

        SoroswapTestSetup {
            env,
            owner,
            multisig,
            token0_address: token0.address,
            token1_address: token1.address,
            lobster_id,
            mock_soroswap_pool_address,
            mock_soroswap_router_address,
        }
    }

    pub fn lobster_client(&self) -> LobsterClient { LobsterClient::new(&self.env, &self.lobster_id) }
    pub fn token0_client(&self) -> token::Client { token::Client::new(&self.env, &self.token0_address) }
    pub fn token1_client(&self) -> token::Client { token::Client::new(&self.env, &self.token1_address) }
    pub fn mock_soroswap_pool_client(&self) -> MockSoroswapPoolClient { MockSoroswapPoolClient::new(&self.env, &self.mock_soroswap_pool_address) }
    pub fn mock_soroswap_router_client(&self) -> MockSoroswapRouterClient { MockSoroswapRouterClient::new(&self.env, &self.mock_soroswap_router_address) }
}

// Tests
#[test]
fn test_basic_soroswap_setup() {
    let setup = SoroswapTestSetup::new();

    assert_ne!(setup.owner, setup.multisig);
    assert_ne!(setup.token0_address, setup.token1_address);
    assert_ne!(setup.lobster_id, Address::generate(&setup.env));

    let token0 = setup.token0_client();
    let token1 = setup.token1_client();
    assert_eq!(token0.balance(&setup.owner), 1000000);
    assert_eq!(token1.balance(&setup.owner), 1000000);
}

#[test]
fn test_deposit_functionality_soroswap() {
    let setup = SoroswapTestSetup::new();
    let lobster = setup.lobster_client();
    let token0 = setup.token0_client();
    let token1 = setup.token1_client();

    lobster.deposit(&setup.owner, &1000i128, &2000i128);
    assert_eq!(token0.balance(&setup.owner), 999000);
    assert_eq!(token1.balance(&setup.owner), 998000);
    assert_eq!(token0.balance(&setup.lobster_id), 1000);
    assert_eq!(token1.balance(&setup.lobster_id), 2000);
}

#[test]
fn test_add_liquidity_soroswap() {
    let setup = SoroswapTestSetup::new();
    let lobster = setup.lobster_client();
    let token0 = setup.token0_client();
    let token1 = setup.token1_client();

    // deposit into lobster
    lobster.deposit(&setup.owner, &1000i128, &2000i128);
    assert_eq!(token0.balance(&setup.lobster_id), 1000);
    assert_eq!(token1.balance(&setup.lobster_id), 2000);

    // call add_liquidity_soroswap
    lobster.add_liquidity_soroswap(
        &setup.owner,
        &500i128,
        &250i128,
        &0i128,
        &0i128,
        &999999999u64,
        &setup.mock_soroswap_router_address,
    );

    // mock does not actually move balances; ensure no panic
    assert_eq!(token0.balance(&setup.lobster_id), 1000);
    assert_eq!(token1.balance(&setup.lobster_id), 2000);
}

#[test]
fn test_withdraw_soroswap_basic() {
    let setup = SoroswapTestSetup::new();
    let lobster = setup.lobster_client();

    lobster.deposit(&setup.owner, &1000i128, &2000i128);

    // Use add_liquidity to set state before withdrawing
    lobster.add_liquidity_soroswap(
        &setup.owner,
        &500i128,
        &250i128,
        &0i128,
        &0i128,
        &999999999u64,
        &setup.mock_soroswap_router_address,
    );

    // Withdraw from soroswap router
    lobster.withdraw_soroswap(
        &setup.owner,
        &0i128,
        &0i128,
        &setup.mock_soroswap_pool_address,
        &setup.mock_soroswap_router_address,
        &999999999u64,
    );
}

#[test]
fn test_get_lp_soroswap_balance() {
    let setup = SoroswapTestSetup::new();
    let lobster = setup.lobster_client();

    lobster.deposit(&setup.owner, &1000i128, &2000i128);
    let lp_balance = lobster.get_lp_soroswap(&setup.mock_soroswap_pool_address);
    assert_eq!(lp_balance, 1000);
}


