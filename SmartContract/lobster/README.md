## Lobster Contract (Position Manager)

Scaffold for a single-user LP position manager that integrates with external DEX pools/routers and an analytics verifier.

### Modules
- `errors.rs`: unified error codes
- `types.rs`: shared structs (Config, Tokens, Position, OptimizationInstruction)
- `storage.rs`: instance storage helpers, nonce, reentrancy flag
- `guards.rs`: access control, whitelist, reentrancy helpers
- `events.rs`: event emitters
- `interfaces.rs`: thin wrappers for token/router/pool/analytics external calls
- `lib.rs`: public contract API stubs

### Public API (stubs)
- `init(owner, whitelist_signer, (token_a, token_b))`
- `set_multisig_threshold(threshold)`
- `deposit(amount_a, amount_b)`
- `withdraw(amount_lp)`
- `migrate(instr)` where `instr` contains target pool, slippage, signature, and deadlines
- `nonce(of)` for replay protection
- `version()`

### External contracts (to integrate)
- Token A/B: approve/transfer
- Router/Pool: add/remove liquidity, LP token discovery
- Analytics: signature verification of optimization instructions

### Security design (planned)
- Whitelist check via analytics signature verification
- Optional multisig (admin-controlled threshold)
- Reentrancy guard using temporary storage
- Strict integer checks and min/max constraints

### Next steps
- Implement approve/add_liquidity/remove_liquidity flows
- Implement instruction verification and replay protection
- Add events payload details and indexing keys
- Add comprehensive tests with mocks (happy path + edge cases)

### Testing
Use Soroban testutils:
```bash
cargo test -p lobster-contract
```