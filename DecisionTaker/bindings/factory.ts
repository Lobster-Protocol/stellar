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
  public: {
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    contractId: "CABBLSQONKYI6DKJEBZCTCZ6EFZO6ZRKFH5BPYT3LCKWIOMLW32CCARP",
  },
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CBC5UCJE5BBBCTYO7ZVBZRAIUQKRVXX5FFYFFHWGVFJVBBKMZQ7QYQMA",
  }
} as const


export interface LobsterPools {
  /**
 * The address of the lobster contract for the liquidity pool
 */
lobster_address: string;
  /**
 * The address of the owner of the pool
 */
owner: string;
  /**
 * The asset A in the pool together with asset amounts
 */
token0: string;
  /**
 * The asset B in the pool together with asset amounts
 */
token1: string;
}


export interface PendingFeeChange {
  /**
 * The timestamp when the change was announced
 */
announcement_timestamp: u64;
  /**
 * The timestamp when the change can be executed (announcement + delay)
 */
execution_timestamp: u64;
  /**
 * The new fee value in basis points
 */
new_fee_bps: u32;
}

export const ContractError = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  3: {message:"AlreadyExists"},
  4: {message:"PoolAlreadyExists"},
  5: {message:"PoolNotFound"},
  6: {message:"PoolNotOwned"},
  7: {message:"PoolNotActive"},
  8: {message:"PoolNotValid"},
  9: {message:"InitializeFailed"},
  10: {message:"FeeChangeNotAnnounced"},
  11: {message:"FeeChangeNotReady"},
  12: {message:"InvalidFeeValue"},
  13: {message:"FeeChangeAlreadyPending"},
  14: {message:"InvalidPoolTokens"},
  15: {message:"ContractMathError"}
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
   * Construct and simulate a create_pool transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Creates a new Lobster pool for a user with the specified token pair.
   * Deploys a new Lobster contract instance deterministically and registers it.
   * 
   * # Parameters
   * - `user`: Address of the user who will own the pool
   * - `token0`: Address of the first token in the pair
   * - `token1`: Address of the second token in the pair
   * 
   * # Returns
   * The address of the newly deployed Lobster contract
   * 
   * # Panics
   * - If contract is not initialized
   * - If token0 and token1 are the same
   * - If a pool already exists for this user and token pair
   * - If reentrancy is detected
   */
  create_pool: ({user, token0, token1}: {user: string, token0: string, token1: string}, options?: {
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
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the address of the factory admin.
   * 
   * # Returns
   * The admin address stored during initialization
   * 
   * # Panics
   * If contract is not initialized
   */
  get_admin: (options?: {
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
   * Construct and simulate a get_wasm_hash transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the WASM hash used for deploying new Lobster contracts.
   * 
   * # Returns
   * The WASM hash (32 bytes) stored during initialization, or zero hash if not set
   */
  get_wasm_hash: (options?: {
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
  }) => Promise<AssembledTransaction<Buffer>>

  /**
   * Construct and simulate a get_pool_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the total number of pools created by this factory.
   * 
   * # Returns
   * Total count of pools created (starts at 0)
   */
  get_pool_count: (options?: {
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
  }) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a get_pool_by_id transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Retrieves pool information by its sequential ID.
   * 
   * # Parameters
   * - `id`: Sequential pool ID (1-indexed)
   * 
   * # Returns
   * `Some(LobsterPools)` if pool exists, `None` otherwise
   */
  get_pool_by_id: ({id}: {id: u64}, options?: {
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
  }) => Promise<AssembledTransaction<Option<LobsterPools>>>

  /**
   * Construct and simulate a get_pool_by_address transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Retrieves pool information by the Lobster contract address.
   * 
   * # Parameters
   * - `addr`: Address of the Lobster contract
   * 
   * # Returns
   * `Some(LobsterPools)` if pool exists, `None` otherwise
   */
  get_pool_by_address: ({addr}: {addr: string}, options?: {
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
  }) => Promise<AssembledTransaction<Option<LobsterPools>>>

  /**
   * Construct and simulate a get_pools_by_user transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Retrieves all pools owned by a specific user.
   * 
   * # Parameters
   * - `user`: Address of the user/owner
   * 
   * # Returns
   * Vector of all LobsterPools owned by the user (empty if none)
   */
  get_pools_by_user: ({user}: {user: string}, options?: {
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
  }) => Promise<AssembledTransaction<Array<LobsterPools>>>

  /**
   * Construct and simulate a get_pools_by_tokens transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Retrieves all pools for a specific token pair.
   * Checks both (token0, token1) and (token1, token0) orderings.
   * 
   * # Parameters
   * - `token0`: Address of the first token
   * - `token1`: Address of the second token
   * 
   * # Returns
   * Vector of all LobsterPools for this token pair (empty if none)
   */
  get_pools_by_tokens: ({token0, token1}: {token0: string, token1: string}, options?: {
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
  }) => Promise<AssembledTransaction<Array<LobsterPools>>>

  /**
   * Construct and simulate a set_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Updates the factory admin address.
   * 
   * # Parameters
   * - `new_admin`: New admin address to set
   * 
   * # Access
   * Only current admin
   * 
   * # Panics
   * - If contract is not initialized
   * - If caller is not the current admin
   */
  set_admin: ({new_admin}: {new_admin: string}, options?: {
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
   * Construct and simulate a set_wasm_hash transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Updates the WASM hash used for deploying new Lobster contracts.
   * 
   * # Parameters
   * - `wasm_hash`: New WASM hash (32 bytes) to use for deployments
   * 
   * # Access
   * Only admin
   * 
   * # Panics
   * - If contract is not initialized
   * - If caller is not the admin
   */
  set_wasm_hash: ({wasm_hash}: {wasm_hash: Buffer}, options?: {
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
   * Construct and simulate a announce_fee_change transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Announces a fee change, starting a 2-week delay period before execution.
   * This provides transparency and allows users to prepare for fee changes.
   * 
   * # Parameters
   * - `new_fee_bps`: New fee value in basis points (0-10000, where 10000 = 100%)
   * 
   * # Access
   * Only admin
   * 
   * # Panics
   * - If contract is not initialized
   * - If caller is not the admin
   * - If new_fee_bps exceeds 10000
   * - If a fee change is already pending
   */
  announce_fee_change: ({new_fee_bps}: {new_fee_bps: u32}, options?: {
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
   * Construct and simulate a execute_fee_change transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Executes the previously announced fee change after the 2-week delay period.
   * Updates the fee and clears the pending change.
   * 
   * # Access
   * Only admin
   * 
   * # Panics
   * - If contract is not initialized
   * - If caller is not the admin
   * - If no fee change has been announced
   * - If the delay period has not yet passed
   */
  execute_fee_change: (options?: {
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

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, wasm_hash, fee_bps}: {admin: string, wasm_hash: Buffer, fee_bps: u32},
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
    return ContractClient.deploy({admin, wasm_hash, fee_bps}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAAAAAAAAAAAAADExvYnN0ZXJQb29scwAAAAQAAAA6VGhlIGFkZHJlc3Mgb2YgdGhlIGxvYnN0ZXIgY29udHJhY3QgZm9yIHRoZSBsaXF1aWRpdHkgcG9vbAAAAAAAD2xvYnN0ZXJfYWRkcmVzcwAAAAATAAAAJFRoZSBhZGRyZXNzIG9mIHRoZSBvd25lciBvZiB0aGUgcG9vbAAAAAVvd25lcgAAAAAAABMAAAAzVGhlIGFzc2V0IEEgaW4gdGhlIHBvb2wgdG9nZXRoZXIgd2l0aCBhc3NldCBhbW91bnRzAAAAAAZ0b2tlbjAAAAAAABMAAAAzVGhlIGFzc2V0IEIgaW4gdGhlIHBvb2wgdG9nZXRoZXIgd2l0aCBhc3NldCBhbW91bnRzAAAAAAZ0b2tlbjEAAAAAABM=",
        "AAAAAQAAAAAAAAAAAAAAEFBlbmRpbmdGZWVDaGFuZ2UAAAADAAAAK1RoZSB0aW1lc3RhbXAgd2hlbiB0aGUgY2hhbmdlIHdhcyBhbm5vdW5jZWQAAAAAFmFubm91bmNlbWVudF90aW1lc3RhbXAAAAAAAAYAAABEVGhlIHRpbWVzdGFtcCB3aGVuIHRoZSBjaGFuZ2UgY2FuIGJlIGV4ZWN1dGVkIChhbm5vdW5jZW1lbnQgKyBkZWxheSkAAAATZXhlY3V0aW9uX3RpbWVzdGFtcAAAAAAGAAAAIVRoZSBuZXcgZmVlIHZhbHVlIGluIGJhc2lzIHBvaW50cwAAAAAAAAtuZXdfZmVlX2JwcwAAAAAE",
        "AAAAAAAAADFSZWVudHJhbmN5IGd1YXJkIGV4aXQ6IGNsZWFycyB0aGUgdGVtcG9yYXJ5IGZsYWcuAAAAAAAAD2V4aXRfcmVlbnRyYW5jeQAAAAAAAAAAAA==",
        "AAAAAAAAAZlJbml0aWFsaXplcyB0aGUgRmFjdG9yeSBjb250cmFjdCB3aXRoIGFkbWluLCBXQVNNIGhhc2ggZm9yIGRlcGxveW1lbnQsIGFuZCBmZWUgY29uZmlndXJhdGlvbi4KCiMgUGFyYW1ldGVycwotIGBhZG1pbmA6IFRoZSBhZGRyZXNzIG9mIHRoZSBmYWN0b3J5IGFkbWluIHdobyBjYW4gbWFuYWdlIHNldHRpbmdzCi0gYHdhc21faGFzaGA6IEhhc2ggb2YgdGhlIExvYnN0ZXIgY29udHJhY3QgV0FTTSBmb3IgZGV0ZXJtaW5pc3RpYyBkZXBsb3ltZW50Ci0gYGZlZV9icHNgOiBEZWZhdWx0IGZlZSBwZXJjZW50YWdlIGluIGJhc2lzIHBvaW50cyAoMC0xMDAwMCwgd2hlcmUgMTAwMDAgPSAxMDAlKQoKIyBQYW5pY3MKLSBJZiBjb250cmFjdCBpcyBhbHJlYWR5IGluaXRpYWxpemVkCi0gSWYgZmVlX2JwcyBleGNlZWRzIDEwMDAwAAAAAAAADV9fY29uc3RydWN0b3IAAAAAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACXdhc21faGFzaAAAAAAAA+4AAAAgAAAAAAAAAAdmZWVfYnBzAAAAAAQAAAAA",
        "AAAAAAAAAhpDcmVhdGVzIGEgbmV3IExvYnN0ZXIgcG9vbCBmb3IgYSB1c2VyIHdpdGggdGhlIHNwZWNpZmllZCB0b2tlbiBwYWlyLgpEZXBsb3lzIGEgbmV3IExvYnN0ZXIgY29udHJhY3QgaW5zdGFuY2UgZGV0ZXJtaW5pc3RpY2FsbHkgYW5kIHJlZ2lzdGVycyBpdC4KCiMgUGFyYW1ldGVycwotIGB1c2VyYDogQWRkcmVzcyBvZiB0aGUgdXNlciB3aG8gd2lsbCBvd24gdGhlIHBvb2wKLSBgdG9rZW4wYDogQWRkcmVzcyBvZiB0aGUgZmlyc3QgdG9rZW4gaW4gdGhlIHBhaXIKLSBgdG9rZW4xYDogQWRkcmVzcyBvZiB0aGUgc2Vjb25kIHRva2VuIGluIHRoZSBwYWlyCgojIFJldHVybnMKVGhlIGFkZHJlc3Mgb2YgdGhlIG5ld2x5IGRlcGxveWVkIExvYnN0ZXIgY29udHJhY3QKCiMgUGFuaWNzCi0gSWYgY29udHJhY3QgaXMgbm90IGluaXRpYWxpemVkCi0gSWYgdG9rZW4wIGFuZCB0b2tlbjEgYXJlIHRoZSBzYW1lCi0gSWYgYSBwb29sIGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIHVzZXIgYW5kIHRva2VuIHBhaXIKLSBJZiByZWVudHJhbmN5IGlzIGRldGVjdGVkAAAAAAALY3JlYXRlX3Bvb2wAAAAAAwAAAAAAAAAEdXNlcgAAABMAAAAAAAAABnRva2VuMAAAAAAAEwAAAAAAAAAGdG9rZW4xAAAAAAATAAAAAQAAABM=",
        "AAAAAAAAAIxSZXR1cm5zIHRoZSBhZGRyZXNzIG9mIHRoZSBmYWN0b3J5IGFkbWluLgoKIyBSZXR1cm5zClRoZSBhZG1pbiBhZGRyZXNzIHN0b3JlZCBkdXJpbmcgaW5pdGlhbGl6YXRpb24KCiMgUGFuaWNzCklmIGNvbnRyYWN0IGlzIG5vdCBpbml0aWFsaXplZAAAAAlnZXRfYWRtaW4AAAAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAJlSZXR1cm5zIHRoZSBXQVNNIGhhc2ggdXNlZCBmb3IgZGVwbG95aW5nIG5ldyBMb2JzdGVyIGNvbnRyYWN0cy4KCiMgUmV0dXJucwpUaGUgV0FTTSBoYXNoICgzMiBieXRlcykgc3RvcmVkIGR1cmluZyBpbml0aWFsaXphdGlvbiwgb3IgemVybyBoYXNoIGlmIG5vdCBzZXQAAAAAAAANZ2V0X3dhc21faGFzaAAAAAAAAAAAAAABAAAD7gAAACA=",
        "AAAAAAAAAHBSZXR1cm5zIHRoZSB0b3RhbCBudW1iZXIgb2YgcG9vbHMgY3JlYXRlZCBieSB0aGlzIGZhY3RvcnkuCgojIFJldHVybnMKVG90YWwgY291bnQgb2YgcG9vbHMgY3JlYXRlZCAoc3RhcnRzIGF0IDApAAAADmdldF9wb29sX2NvdW50AAAAAAAAAAAAAQAAAAY=",
        "AAAAAAAAAKZSZXRyaWV2ZXMgcG9vbCBpbmZvcm1hdGlvbiBieSBpdHMgc2VxdWVudGlhbCBJRC4KCiMgUGFyYW1ldGVycwotIGBpZGA6IFNlcXVlbnRpYWwgcG9vbCBJRCAoMS1pbmRleGVkKQoKIyBSZXR1cm5zCmBTb21lKExvYnN0ZXJQb29scylgIGlmIHBvb2wgZXhpc3RzLCBgTm9uZWAgb3RoZXJ3aXNlAAAAAAAOZ2V0X3Bvb2xfYnlfaWQAAAAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAQAAA+gAAAfQAAAADExvYnN0ZXJQb29scw==",
        "AAAAAAAAALRSZXRyaWV2ZXMgcG9vbCBpbmZvcm1hdGlvbiBieSB0aGUgTG9ic3RlciBjb250cmFjdCBhZGRyZXNzLgoKIyBQYXJhbWV0ZXJzCi0gYGFkZHJgOiBBZGRyZXNzIG9mIHRoZSBMb2JzdGVyIGNvbnRyYWN0CgojIFJldHVybnMKYFNvbWUoTG9ic3RlclBvb2xzKWAgaWYgcG9vbCBleGlzdHMsIGBOb25lYCBvdGhlcndpc2UAAAATZ2V0X3Bvb2xfYnlfYWRkcmVzcwAAAAABAAAAAAAAAARhZGRyAAAAEwAAAAEAAAPoAAAH0AAAAAxMb2JzdGVyUG9vbHM=",
        "AAAAAAAAAKdSZXRyaWV2ZXMgYWxsIHBvb2xzIG93bmVkIGJ5IGEgc3BlY2lmaWMgdXNlci4KCiMgUGFyYW1ldGVycwotIGB1c2VyYDogQWRkcmVzcyBvZiB0aGUgdXNlci9vd25lcgoKIyBSZXR1cm5zClZlY3RvciBvZiBhbGwgTG9ic3RlclBvb2xzIG93bmVkIGJ5IHRoZSB1c2VyIChlbXB0eSBpZiBub25lKQAAAAARZ2V0X3Bvb2xzX2J5X3VzZXIAAAAAAAABAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAPqAAAH0AAAAAxMb2JzdGVyUG9vbHM=",
        "AAAAAAAAARJSZXRyaWV2ZXMgYWxsIHBvb2xzIGZvciBhIHNwZWNpZmljIHRva2VuIHBhaXIuCkNoZWNrcyBib3RoICh0b2tlbjAsIHRva2VuMSkgYW5kICh0b2tlbjEsIHRva2VuMCkgb3JkZXJpbmdzLgoKIyBQYXJhbWV0ZXJzCi0gYHRva2VuMGA6IEFkZHJlc3Mgb2YgdGhlIGZpcnN0IHRva2VuCi0gYHRva2VuMWA6IEFkZHJlc3Mgb2YgdGhlIHNlY29uZCB0b2tlbgoKIyBSZXR1cm5zClZlY3RvciBvZiBhbGwgTG9ic3RlclBvb2xzIGZvciB0aGlzIHRva2VuIHBhaXIgKGVtcHR5IGlmIG5vbmUpAAAAAAATZ2V0X3Bvb2xzX2J5X3Rva2VucwAAAAACAAAAAAAAAAZ0b2tlbjAAAAAAABMAAAAAAAAABnRva2VuMQAAAAAAEwAAAAEAAAPqAAAH0AAAAAxMb2JzdGVyUG9vbHM=",
        "AAAAAAAAAMVVcGRhdGVzIHRoZSBmYWN0b3J5IGFkbWluIGFkZHJlc3MuCgojIFBhcmFtZXRlcnMKLSBgbmV3X2FkbWluYDogTmV3IGFkbWluIGFkZHJlc3MgdG8gc2V0CgojIEFjY2VzcwpPbmx5IGN1cnJlbnQgYWRtaW4KCiMgUGFuaWNzCi0gSWYgY29udHJhY3QgaXMgbm90IGluaXRpYWxpemVkCi0gSWYgY2FsbGVyIGlzIG5vdCB0aGUgY3VycmVudCBhZG1pbgAAAAAAAAlzZXRfYWRtaW4AAAAAAAABAAAAAAAAAAluZXdfYWRtaW4AAAAAAAATAAAAAA==",
        "AAAAAAAAAOlVcGRhdGVzIHRoZSBXQVNNIGhhc2ggdXNlZCBmb3IgZGVwbG95aW5nIG5ldyBMb2JzdGVyIGNvbnRyYWN0cy4KCiMgUGFyYW1ldGVycwotIGB3YXNtX2hhc2hgOiBOZXcgV0FTTSBoYXNoICgzMiBieXRlcykgdG8gdXNlIGZvciBkZXBsb3ltZW50cwoKIyBBY2Nlc3MKT25seSBhZG1pbgoKIyBQYW5pY3MKLSBJZiBjb250cmFjdCBpcyBub3QgaW5pdGlhbGl6ZWQKLSBJZiBjYWxsZXIgaXMgbm90IHRoZSBhZG1pbgAAAAAAAA1zZXRfd2FzbV9oYXNoAAAAAAAAAQAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAA",
        "AAAAAAAAAYxBbm5vdW5jZXMgYSBmZWUgY2hhbmdlLCBzdGFydGluZyBhIDItd2VlayBkZWxheSBwZXJpb2QgYmVmb3JlIGV4ZWN1dGlvbi4KVGhpcyBwcm92aWRlcyB0cmFuc3BhcmVuY3kgYW5kIGFsbG93cyB1c2VycyB0byBwcmVwYXJlIGZvciBmZWUgY2hhbmdlcy4KCiMgUGFyYW1ldGVycwotIGBuZXdfZmVlX2Jwc2A6IE5ldyBmZWUgdmFsdWUgaW4gYmFzaXMgcG9pbnRzICgwLTEwMDAwLCB3aGVyZSAxMDAwMCA9IDEwMCUpCgojIEFjY2VzcwpPbmx5IGFkbWluCgojIFBhbmljcwotIElmIGNvbnRyYWN0IGlzIG5vdCBpbml0aWFsaXplZAotIElmIGNhbGxlciBpcyBub3QgdGhlIGFkbWluCi0gSWYgbmV3X2ZlZV9icHMgZXhjZWVkcyAxMDAwMAotIElmIGEgZmVlIGNoYW5nZSBpcyBhbHJlYWR5IHBlbmRpbmcAAAATYW5ub3VuY2VfZmVlX2NoYW5nZQAAAAABAAAAAAAAAAtuZXdfZmVlX2JwcwAAAAAEAAAAAA==",
        "AAAAAAAAASZFeGVjdXRlcyB0aGUgcHJldmlvdXNseSBhbm5vdW5jZWQgZmVlIGNoYW5nZSBhZnRlciB0aGUgMi13ZWVrIGRlbGF5IHBlcmlvZC4KVXBkYXRlcyB0aGUgZmVlIGFuZCBjbGVhcnMgdGhlIHBlbmRpbmcgY2hhbmdlLgoKIyBBY2Nlc3MKT25seSBhZG1pbgoKIyBQYW5pY3MKLSBJZiBjb250cmFjdCBpcyBub3QgaW5pdGlhbGl6ZWQKLSBJZiBjYWxsZXIgaXMgbm90IHRoZSBhZG1pbgotIElmIG5vIGZlZSBjaGFuZ2UgaGFzIGJlZW4gYW5ub3VuY2VkCi0gSWYgdGhlIGRlbGF5IHBlcmlvZCBoYXMgbm90IHlldCBwYXNzZWQAAAAAABJleGVjdXRlX2ZlZV9jaGFuZ2UAAAAAAAAAAAAA",
        "AAAABAAAAAAAAAAAAAAADUNvbnRyYWN0RXJyb3IAAAAAAAAPAAAAAAAAABJBbHJlYWR5SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAADk5vdEluaXRpYWxpemVkAAAAAAACAAAAAAAAAA1BbHJlYWR5RXhpc3RzAAAAAAAAAwAAAAAAAAARUG9vbEFscmVhZHlFeGlzdHMAAAAAAAAEAAAAAAAAAAxQb29sTm90Rm91bmQAAAAFAAAAAAAAAAxQb29sTm90T3duZWQAAAAGAAAAAAAAAA1Qb29sTm90QWN0aXZlAAAAAAAABwAAAAAAAAAMUG9vbE5vdFZhbGlkAAAACAAAAAAAAAAQSW5pdGlhbGl6ZUZhaWxlZAAAAAkAAAAAAAAAFUZlZUNoYW5nZU5vdEFubm91bmNlZAAAAAAAAAoAAAAAAAAAEUZlZUNoYW5nZU5vdFJlYWR5AAAAAAAACwAAAAAAAAAPSW52YWxpZEZlZVZhbHVlAAAAAAwAAAAAAAAAF0ZlZUNoYW5nZUFscmVhZHlQZW5kaW5nAAAAAA0AAAAAAAAAEUludmFsaWRQb29sVG9rZW5zAAAAAAAADgAAAAAAAAARQ29udHJhY3RNYXRoRXJyb3IAAAAAAAAP" ]),
      options
    )
  }
  public readonly fromJSON = {
    exit_reentrancy: this.txFromJSON<null>,
        create_pool: this.txFromJSON<string>,
        get_admin: this.txFromJSON<string>,
        get_wasm_hash: this.txFromJSON<Buffer>,
        get_pool_count: this.txFromJSON<u64>,
        get_pool_by_id: this.txFromJSON<Option<LobsterPools>>,
        get_pool_by_address: this.txFromJSON<Option<LobsterPools>>,
        get_pools_by_user: this.txFromJSON<Array<LobsterPools>>,
        get_pools_by_tokens: this.txFromJSON<Array<LobsterPools>>,
        set_admin: this.txFromJSON<null>,
        set_wasm_hash: this.txFromJSON<null>,
        announce_fee_change: this.txFromJSON<null>,
        execute_fee_change: this.txFromJSON<null>
  }
}