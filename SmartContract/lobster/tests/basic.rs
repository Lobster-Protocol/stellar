// #![cfg(test)]
// use soroban_sdk::{testutils::Address as _, Address, Env, IntoVal};

// use lobster_contract::ContractClient;

// #[test]
// fn init_and_version() {
//     let env = Env::default();
//     env.mock_all_auths();

//     let owner = Address::generate(&env);
//     let wl = Address::generate(&env);
//     let token_a = Address::generate(&env);
//     let token_b = Address::generate(&env);

//     let contract_id = env.register_contract(None, lobster_contract::Contract);
//     let client = ContractClient::new(&env, &contract_id);

//     client.init(&owner, &wl, &(token_a, token_b));
//     let v = client.version();
//     assert!(v.to_string().starts_with("lobster-"));
// }