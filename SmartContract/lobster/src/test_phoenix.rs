// SmartContract/lobster/src/test_phoenix.rs
#![allow(dead_code)]
#![cfg(test)]

use crate::{Asset, Lobster, LobsterClient, PoolResponse};
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger, LedgerInfo},
    token, symbol_short, Address, Env, String, Symbol, Vec, Val, vec, IntoVal,
};

// Storage key for LP token address
const LP_TOKEN_KEY: Symbol = symbol_short!("LP_TOKEN");

// Mock Phoenix Pool Contract
#[contract]
pub struct MockPhoenixPool;

#[contractimpl]
impl MockPhoenixPool {
    /// Mock implementation of query_pool_info
    /// Returns a predictable PoolResponse for testing
    pub fn query_pool_info(env: Env) -> PoolResponse {
        // Generate consistent addresses for testing
        let token0_address = Address::generate(&env);
        let token1_address = Address::generate(&env);

        PoolResponse {
            asset_a: Asset {
                address: token0_address,
                amount: 1000i128, // Mock reserve amount
            },
            asset_b: Asset {
                address: token1_address,
                amount: 2000i128, // Mock reserve amount
            },
            asset_lp_share: Asset {
                address: Address::generate(&env), // Mock LP token address
                amount: 100i128,                  // Mock LP token supply
            },
            stake_address: Address::generate(&env), // Mock stake contract address
        }
    }

    /// Mock implementation of provide_liquidity
    /// Returns success without doing anything
    pub fn provide_liquidity(
        _env: Env,
        _recipient: Address,
        _amount_a: i128,
        _amount_a_min: i128,
        _amount_b: i128,
        _amount_b_min: i128,
        _slippage: i64,
        _deadline: u64,
        _auto_unstake: bool,
    ) {
        // Mock implementation - just return success
    }

    /// Mock implementation of query_share_token_address
    /// Returns the LP token address from storage, or generates a default one
    pub fn query_share_token_address(env: Env) -> Address {
        // Try to get LP token address from storage
        if let Some(lp_token) = env.storage().persistent().get(&LP_TOKEN_KEY) {
            lp_token
        } else {
            // Fallback: generate a default address
            let string = String::from_str(&env, "CD6J56LNQZIZQCH2X6PCX4VSROIK2IDL3MIVPB3AQXN7XLMKQ36L7Q5P");
            Address::from_string(&string)
        }
    }

    /// Set the LP token address (for testing purposes)
    pub fn set_lp_token_address(env: Env, lp_token: Address) {
        env.storage().persistent().set(&LP_TOKEN_KEY, &lp_token);
    }

    /// Mock implementation of withdraw_liquidity
    /// Returns predictable amounts for testing
    pub fn withdraw_liquidity(
        _env: Env,
        _recipient: Address,
        _share_amount: i128,
        min_a: i128,
        min_b: i128,
        _deadline: u64,
        _auto_unstake: Option<crate::AutoUnstakeInfo>,
    ) -> (i128, i128) {
        // Mock implementation - return based on min amounts
        // Return minimum amounts plus a small buffer for realistic behavior
        let amount_a = if min_a == 0 { 500i128 } else { min_a + 10 };
        let amount_b = if min_b == 0 { 1000i128 } else { min_b + 20 };
        
        (amount_a, amount_b)
    }
}

// Mock LP Token Contract
#[contract]
pub struct MockLpToken;

#[contractimpl]
impl MockLpToken {
    /// Mock implementation of balance
    /// Returns a predictable balance for testing
    pub fn balance(_env: Env, _account: Address) -> i128 {
        // Return a mock balance
        1000i128
    }
}

// Update your helper function
pub fn create_mock_lp_token(env: &Env) -> MockLpTokenClient {
    // Register the mock LP token contract
    let lp_token_id = env.register(MockLpToken {}, ());
    MockLpTokenClient::new(env, &lp_token_id)
}

// Helper functions for creating contracts
pub fn create_token_contract<'a>(
    e: &Env,
    admin: &Address,
) -> (token::Client<'a>, token::StellarAssetClient<'a>) {
    let sac = e.register_stellar_asset_contract_v2(admin.clone());
    (
        token::Client::new(e, &sac.address()),
        token::StellarAssetClient::new(e, &sac.address()),
    )
}

pub fn create_mock_phoenix_pool(env: &Env) -> MockPhoenixPoolClient {
    MockPhoenixPoolClient::new(env, &env.register(MockPhoenixPool {}, ()))
}

// Test setup struct for Phoenix-specific tests
pub struct PhoenixTestSetup {
    pub env: Env,
    pub owner: Address,
    pub multisig: Address,
    pub token0_address: Address,
    pub token1_address: Address,
    pub lobster_id: Address,
    pub mock_phoenix_pool_address: Address,
    pub mock_lp_token_address: Address,
}

impl PhoenixTestSetup {
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

        // Create tokens
        let (token0, token0_admin) = create_token_contract(&env, &token_admin);
        let (token1, token1_admin) = create_token_contract(&env, &token_admin);

        // Stellar asset tokens don't need initialization

        // Mint tokens to owner first
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

        // Create mock Phoenix pool
        let mock_phoenix_pool = create_mock_phoenix_pool(&env);
        let mock_phoenix_pool_address = mock_phoenix_pool.address.clone();

        // Create mock LP token
        let mock_lp_token = create_mock_lp_token(&env);
        let mock_lp_token_address = mock_lp_token.address.clone();

        // Set the LP token address in the mock pool so it returns the correct address
        mock_phoenix_pool.set_lp_token_address(&mock_lp_token_address);

        PhoenixTestSetup {
            env,
            owner,
            multisig,
            token0_address: token0.address,
            token1_address: token1.address,
            lobster_id,
            mock_phoenix_pool_address,
            mock_lp_token_address,
        }
    }

    pub fn lobster_client(&self) -> LobsterClient {
        LobsterClient::new(&self.env, &self.lobster_id)
    }

    pub fn token0_client(&self) -> token::Client {
        token::Client::new(&self.env, &self.token0_address)
    }

    pub fn token1_client(&self) -> token::Client {
        token::Client::new(&self.env, &self.token1_address)
    }

    pub fn mock_phoenix_pool_client(&self) -> MockPhoenixPoolClient {
        MockPhoenixPoolClient::new(&self.env, &self.mock_phoenix_pool_address)
    }
}

// Test cases
#[test]
fn test_basic_phoenix_setup() {
    let setup = PhoenixTestSetup::new();

    // Test that the setup works
    assert_ne!(setup.owner, setup.multisig);
    assert_ne!(setup.token0_address, setup.token1_address);
    assert_ne!(setup.lobster_id, Address::generate(&setup.env));

    // Test that tokens were initialized
    let token0 = setup.token0_client();
    let token1 = setup.token1_client();

    assert_eq!(token0.balance(&setup.owner), 1000000);
    assert_eq!(token1.balance(&setup.owner), 1000000);
}

#[test]
fn test_deposit_functionality() {
    let setup = PhoenixTestSetup::new();
    let lobster = setup.lobster_client();
    let token0 = setup.token0_client();
    let token1 = setup.token1_client();

    // Test deposit functionality
    lobster.deposit(&setup.owner, &1000i128, &2000i128);

    // Verify tokens were deposited (owner balance decreased, contract balance increased)
    assert_eq!(token0.balance(&setup.owner), 999000); // 1000000 - 1000
    assert_eq!(token1.balance(&setup.owner), 998000); // 1000000 - 2000
    assert_eq!(token0.balance(&setup.lobster_id), 1000);
    assert_eq!(token1.balance(&setup.lobster_id), 2000);
}

#[test]
fn test_multiple_deposits() {
    let setup = PhoenixTestSetup::new();
    let lobster = setup.lobster_client();
    let token0 = setup.token0_client();
    let token1 = setup.token1_client();

    // Multiple deposits
    lobster.deposit(&setup.owner, &1000i128, &2000i128);
    lobster.deposit(&setup.owner, &500i128, &1000i128);
    lobster.deposit(&setup.owner, &250i128, &500i128);

    // Verify cumulative balances
    assert_eq!(token0.balance(&setup.lobster_id), 1750);
    assert_eq!(token1.balance(&setup.lobster_id), 3500);
    assert_eq!(token0.balance(&setup.owner), 998250);
    assert_eq!(token1.balance(&setup.owner), 996500);
}

#[test]
fn test_token_ordering_logic() {
    let setup = PhoenixTestSetup::new();

    // Test that we can compare token addresses
    // This is important for the correct_token_order function
    let token0_addr = setup.token0_address;
    let token1_addr = setup.token1_address;

    // Verify addresses are different
    assert_ne!(token0_addr, token1_addr);

    // Test address comparison (this is what correct_token_order uses)
    let ordered = if token0_addr < token1_addr {
        (token0_addr, token1_addr)
    } else {
        (token1_addr, token0_addr)
    };

    // Verify ordering works
    assert!(ordered.0 < ordered.1);
}

#[test]
fn test_add_liquidity_phoenix() {
    let setup = PhoenixTestSetup::new();
    let lobster = setup.lobster_client();
    let token0 = setup.token0_client();
    let token1 = setup.token1_client();

    // First deposit tokens to lobster contract
    lobster.deposit(&setup.owner, &1000i128, &2000i128);

    // Verify tokens were deposited
    assert_eq!(token0.balance(&setup.lobster_id), 1000);
    assert_eq!(token1.balance(&setup.lobster_id), 2000);

    // Test adding liquidity to Phoenix pool
    // Pool has ratio 1000:2000, so we need to match that ratio
    lobster.add_liquidity_phoenix(
        &setup.owner,
        &500i128, // amount0 - smaller amount
        &250i128, // amount1 - smaller amount (2x amount0 to match pool ratio)
        &0i128,   // amount0_min - much smaller than calculated amount (25)
        &0i128,   // amount1_min - much smaller than calculated amount
        &setup.mock_phoenix_pool_address,
        &999999999u64, // deadline
        &500i64,       // slippage
    );

    // Verify that the pool was set as active
    // Note: The actual implementation would set storage values
    // For now, we just verify the function call succeeded without panicking

    // Check that tokens were transferred to the pool (mock doesn't actually transfer)
    // In a real test, you'd verify the pool received the tokens
    assert_eq!(token0.balance(&setup.lobster_id), 1000); // Still has original balance
    assert_eq!(token1.balance(&setup.lobster_id), 2000); // Still has original balance
}

#[test]
fn test_withdraw_phoenix_basic() {
    let setup = PhoenixTestSetup::new();
    let lobster = setup.lobster_client();
    let token0 = setup.token0_client();
    let token1 = setup.token1_client();

    // Step 1: Deposit tokens to lobster contract
    lobster.deposit(&setup.owner, &1000i128, &2000i128);
    assert_eq!(token0.balance(&setup.lobster_id), 1000);
    assert_eq!(token1.balance(&setup.lobster_id), 2000);

    // Step 2: Add liquidity to Phoenix pool
    lobster.add_liquidity_phoenix(
        &setup.owner,
        &500i128,
        &250i128,
        &0i128,
        &0i128,
        &setup.mock_phoenix_pool_address,
        &999999999u64,
        &500i64,
    );

    // Step 3: Withdraw liquidity from Phoenix pool
    lobster.withdraw_phoenix(
        &setup.owner,
        &setup.mock_phoenix_pool_address,
        &0i128,              // amount0_min
        &0i128,              // amount1_min  
        &999999999u64,       // deadline
    );

    // Verify withdraw completed successfully
    // In a real test, you'd verify the amounts returned
}


#[test]
fn test_withdraw_phoenix_get_lp_balance() {
    let setup = PhoenixTestSetup::new();
    let lobster = setup.lobster_client();

    // Setup
    lobster.deposit(&setup.owner, &1000i128, &2000i128);
    
    // Get LP balance before adding liquidity
    let (_lp_balance_before, _lp_token_before) = lobster.get_lp_phoenix(&setup.mock_phoenix_pool_address);
    
    lobster.add_liquidity_phoenix(
        &setup.owner,
        &500i128,
        &250i128,
        &0i128,
        &0i128,
        &setup.mock_phoenix_pool_address,
        &999999999u64,
        &500i64,
    );

    // Get LP balance after adding liquidity
    let (lp_balance_after, lp_token_after) = lobster.get_lp_phoenix(&setup.mock_phoenix_pool_address);
    
    // Verify LP token address is consistent
    assert_eq!(lp_token_after, setup.mock_lp_token_address);
    
    // Verify LP balance (mock returns 1000)
    assert_eq!(lp_balance_after, 1000);
}
