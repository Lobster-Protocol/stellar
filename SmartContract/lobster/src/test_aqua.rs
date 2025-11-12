// SmartContract/lobster/src/test_aqua.rs
#![allow(dead_code)]
#![cfg(test)]

use crate::{Lobster, LobsterClient};
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger, LedgerInfo},
    token, vec, symbol_short, Address, Env, String, Symbol, Val, IntoVal,
};

// Storage key for LP token address
const LP_TOKEN_KEY: Symbol = symbol_short!("LP_TOKEN");

// Mock Aquarius Pool Contract
#[contract]
pub struct MockAquariusPool;

#[contractimpl]
impl MockAquariusPool {
    /// Return token addresses used by the pool (Aquarius API)
    pub fn get_tokens(env: Env) -> soroban_sdk::Vec<Address> {
        // Generate deterministic addresses for tests
        let token0_address = Address::generate(&env);
        let token1_address = Address::generate(&env);

        let mut v: soroban_sdk::Vec<Address> = soroban_sdk::Vec::new(&env);
        v.push_back(token0_address);
        v.push_back(token1_address);
        v
    }

    /// Return pool reserves as Aquarius expects (Vec<u128>)
    pub fn get_reserves(_env: Env) -> soroban_sdk::Vec<u128> {
        // Use predictable mock reserves
        let env = _env.clone();
        let mut v: soroban_sdk::Vec<u128> = soroban_sdk::Vec::new(&env);
        v.push_back(1000u128);
        v.push_back(2000u128);
        v
    }

    /// Aquarius deposit signature: (to, amounts, min_mint_amount) -> (amounts, shares)
    pub fn deposit(_env: Env, _to: Address, amounts: soroban_sdk::Vec<u128>, _min_mint_amount: u128) -> (soroban_sdk::Vec<u128>, u128) {
        // Echo back provided amounts and return fixed shares for predictability
        (amounts, 1000u128)
    }

    /// Aquarius withdraw signature: (user, share_amount, min_amounts) -> amounts
    pub fn withdraw(env: Env, _user: Address, share_amount: u128, min_amounts: soroban_sdk::Vec<u128>) -> soroban_sdk::Vec<u128> {
        // Produce amounts based on min constraints, bump a bit if zero for realism
        let mut out: soroban_sdk::Vec<u128> = soroban_sdk::Vec::new(&env);
        let a0 = if min_amounts.get(0).unwrap_or(0) == 0 { 500u128 } else { min_amounts.get(0).unwrap() + 10u128 };
        let a1 = if min_amounts.get(1).unwrap_or(0) == 0 { 1000u128 } else { min_amounts.get(1).unwrap() + 20u128 };
        let _ = share_amount; // unused in mock
        out.push_back(a0);
        out.push_back(a1);
        out
    }

    /// Aquarius LP token address provider
    pub fn share_id(env: Env) -> Address {
        if let Some(lp_token) = env.storage().persistent().get(&LP_TOKEN_KEY) {
            lp_token
        } else {
            let string = String::from_str(&env, "CD6J56LNQZIZQCH2X6PCX4VSROIK2IDL3MIVPB3AQXN7XLMKQ36L7Q5P");
            Address::from_string(&string)
        }
    }

    /// Set LP token address for tests
    pub fn set_lp_token_address(env: Env, lp_token: Address) {
        env.storage().persistent().set(&LP_TOKEN_KEY, &lp_token);
    }
}

// Mock LP Token Contract for Aquarius
#[contract]
pub struct MockLpToken;

#[contractimpl]
impl MockLpToken {
    pub fn balance(_env: Env, _account: Address) -> i128 {
        1000i128
    }

    pub fn burn(_env: Env, _from: Address, _amount: i128) {
        // no-op in mock
    }
}

// Helpers
pub fn create_mock_lp_token(env: &Env) -> MockLpTokenClient {
    let lp_token_id = env.register(MockLpToken {}, ());
    MockLpTokenClient::new(env, &lp_token_id)
}

pub fn create_token_contract_aqua<'a>(e: &Env, admin: &Address) -> (token::Client<'a>, token::StellarAssetClient<'a>) {
    let sac = e.register_stellar_asset_contract_v2(admin.clone());
    (token::Client::new(e, &sac.address()), token::StellarAssetClient::new(e, &sac.address()))
}

pub fn create_mock_aquarius_pool(env: &Env) -> MockAquariusPoolClient {
    MockAquariusPoolClient::new(env, &env.register(MockAquariusPool {}, ()))
}

// Test setup struct for Aquarius-specific tests
pub struct AquariusTestSetup {
    pub env: Env,
    pub owner: Address,
    pub multisig: Address,
    pub token0_address: Address,
    pub token1_address: Address,
    pub lobster_id: Address,
    pub mock_aquarius_pool_address: Address,
    pub mock_lp_token_address: Address,
}

impl AquariusTestSetup {
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
        let (token0, token0_admin) = create_token_contract_aqua(&env, &token_admin);
        let (token1, token1_admin) = create_token_contract_aqua(&env, &token_admin);
        token0_admin.mint(&owner, &1000000);
        token1_admin.mint(&owner, &1000000);

        // Deploy lobster with initialization args
        let deploy_args: soroban_sdk::Vec<Val> = vec![
            &env,
            owner.clone().into_val(&env),
            multisig.clone().into_val(&env),
            token0.address.into_val(&env),
            token1.address.into_val(&env),
            100u32.into_val(&env),
        ];

        let lobster_id = env.register(Lobster, deploy_args);

        // Mock pool and LP token
        let mock_aquarius_pool = create_mock_aquarius_pool(&env);
        let mock_aquarius_pool_address = mock_aquarius_pool.address.clone();

        let mock_lp_token = create_mock_lp_token(&env);
        let mock_lp_token_address = mock_lp_token.address.clone();

        // Wire LP token into pool
        mock_aquarius_pool.set_lp_token_address(&mock_lp_token_address);

        AquariusTestSetup {
            env,
            owner,
            multisig,
            token0_address: token0.address,
            token1_address: token1.address,
            lobster_id,
            mock_aquarius_pool_address,
            mock_lp_token_address,
        }
    }

    pub fn lobster_client(&self) -> LobsterClient { LobsterClient::new(&self.env, &self.lobster_id) }
    pub fn token0_client(&self) -> token::Client { token::Client::new(&self.env, &self.token0_address) }
    pub fn token1_client(&self) -> token::Client { token::Client::new(&self.env, &self.token1_address) }
    pub fn mock_aquarius_pool_client(&self) -> MockAquariusPoolClient { MockAquariusPoolClient::new(&self.env, &self.mock_aquarius_pool_address) }
}

// Tests
#[test]
fn test_basic_aquarius_setup() {
    let setup = AquariusTestSetup::new();

    assert_ne!(setup.owner, setup.multisig);
    assert_ne!(setup.token0_address, setup.token1_address);
    assert_ne!(setup.lobster_id, Address::generate(&setup.env));

    let token0 = setup.token0_client();
    let token1 = setup.token1_client();
    assert_eq!(token0.balance(&setup.owner), 1000000);
    assert_eq!(token1.balance(&setup.owner), 1000000);
}

#[test]
fn test_deposit_functionality_aquarius() {
    let setup = AquariusTestSetup::new();
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
fn test_add_liquidity_aquarius() {
    let setup = AquariusTestSetup::new();
    let lobster = setup.lobster_client();
    let token0 = setup.token0_client();
    let token1 = setup.token1_client();

    lobster.deposit(&setup.owner, &1000i128, &2000i128);
    assert_eq!(token0.balance(&setup.lobster_id), 1000);
    assert_eq!(token1.balance(&setup.lobster_id), 2000);

    lobster.add_liquidity_aquarius(
        &setup.owner,
        &500i128,
        &250i128,
        &setup.mock_aquarius_pool_address,
    );

    // Mock doesn't actually transfer out in tests; ensure call didn't panic
    assert_eq!(token0.balance(&setup.lobster_id), 1000);
    assert_eq!(token1.balance(&setup.lobster_id), 2000);
}

#[test]
fn test_withdraw_aquarius_basic() {
    let setup = AquariusTestSetup::new();
    let lobster = setup.lobster_client();

    lobster.deposit(&setup.owner, &1000i128, &2000i128);
    lobster.add_liquidity_aquarius(&setup.owner, &500i128, &250i128, &setup.mock_aquarius_pool_address);

    lobster.withdraw_aquarius(
        &setup.owner,
        &setup.mock_aquarius_pool_address,
        &0u128,
        &0u128,
    );
}

#[test]
fn test_withdraw_aquarius_get_lp_balance() {
    let setup = AquariusTestSetup::new();
    let lobster = setup.lobster_client();

    lobster.deposit(&setup.owner, &1000i128, &2000i128);

    let (_lp_balance_before, _lp_token_before) = lobster.get_lp_aquarius(&setup.mock_aquarius_pool_address);

    lobster.add_liquidity_aquarius(&setup.owner, &500i128, &250i128, &setup.mock_aquarius_pool_address);

    let (lp_balance_after, lp_token_after) = lobster.get_lp_aquarius(&setup.mock_aquarius_pool_address);
    assert_eq!(lp_token_after, setup.mock_lp_token_address);
    assert_eq!(lp_balance_after, 1000);
}
