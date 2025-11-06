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
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CDCRRUTFS3AKPC56LPDQHXLVNJAZTLIJLROJSU5WVKVPUZA2IK6TQVPB",
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
  12: {message:"InvalidFeeValue"}
}

export interface Client {
  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin, wasm_hash, fee_bps}: {admin: string, wasm_hash: Buffer, fee_bps: u32}, options?: {
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
   */
  create_pool: ({user, token0, token1, salt}: {user: string, token0: string, token1: string, salt: Buffer}, options?: {
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
   * Announce a fee change. This starts the 2-week delay period.
   * Access: admin only
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
   * Execute the announced fee change after the delay period has passed.
   * Access: admin only
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
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAAAAAAAAAAAAADExvYnN0ZXJQb29scwAAAAQAAAA6VGhlIGFkZHJlc3Mgb2YgdGhlIGxvYnN0ZXIgY29udHJhY3QgZm9yIHRoZSBsaXF1aWRpdHkgcG9vbAAAAAAAD2xvYnN0ZXJfYWRkcmVzcwAAAAATAAAAJFRoZSBhZGRyZXNzIG9mIHRoZSBvd25lciBvZiB0aGUgcG9vbAAAAAVvd25lcgAAAAAAABMAAAAzVGhlIGFzc2V0IEEgaW4gdGhlIHBvb2wgdG9nZXRoZXIgd2l0aCBhc3NldCBhbW91bnRzAAAAAAZ0b2tlbjAAAAAAABMAAAAzVGhlIGFzc2V0IEIgaW4gdGhlIHBvb2wgdG9nZXRoZXIgd2l0aCBhc3NldCBhbW91bnRzAAAAAAZ0b2tlbjEAAAAAABM=",
        "AAAAAQAAAAAAAAAAAAAAEFBlbmRpbmdGZWVDaGFuZ2UAAAADAAAAK1RoZSB0aW1lc3RhbXAgd2hlbiB0aGUgY2hhbmdlIHdhcyBhbm5vdW5jZWQAAAAAFmFubm91bmNlbWVudF90aW1lc3RhbXAAAAAAAAYAAABEVGhlIHRpbWVzdGFtcCB3aGVuIHRoZSBjaGFuZ2UgY2FuIGJlIGV4ZWN1dGVkIChhbm5vdW5jZW1lbnQgKyBkZWxheSkAAAATZXhlY3V0aW9uX3RpbWVzdGFtcAAAAAAGAAAAIVRoZSBuZXcgZmVlIHZhbHVlIGluIGJhc2lzIHBvaW50cwAAAAAAAAtuZXdfZmVlX2JwcwAAAAAE",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAl3YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHZmVlX2JwcwAAAAAEAAAAAA==",
        "AAAAAAAAAAAAAAALY3JlYXRlX3Bvb2wAAAAABAAAAAAAAAAEdXNlcgAAABMAAAAAAAAABnRva2VuMAAAAAAAEwAAAAAAAAAGdG9rZW4xAAAAAAATAAAAAAAAAARzYWx0AAAD7gAAACAAAAABAAAAEw==",
        "AAAAAAAAAAAAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAAAAAAANZ2V0X3dhc21faGFzaAAAAAAAAAAAAAABAAAD7gAAACA=",
        "AAAAAAAAAAAAAAAOZ2V0X3Bvb2xfY291bnQAAAAAAAAAAAABAAAABg==",
        "AAAAAAAAAAAAAAAOZ2V0X3Bvb2xfYnlfaWQAAAAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAQAAA+gAAAfQAAAADExvYnN0ZXJQb29scw==",
        "AAAAAAAAAAAAAAATZ2V0X3Bvb2xfYnlfYWRkcmVzcwAAAAABAAAAAAAAAARhZGRyAAAAEwAAAAEAAAPoAAAH0AAAAAxMb2JzdGVyUG9vbHM=",
        "AAAAAAAAAAAAAAARZ2V0X3Bvb2xzX2J5X3VzZXIAAAAAAAABAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAPqAAAH0AAAAAxMb2JzdGVyUG9vbHM=",
        "AAAAAAAAAAAAAAATZ2V0X3Bvb2xzX2J5X3Rva2VucwAAAAACAAAAAAAAAAZ0b2tlbjAAAAAAABMAAAAAAAAABnRva2VuMQAAAAAAEwAAAAEAAAPqAAAH0AAAAAxMb2JzdGVyUG9vbHM=",
        "AAAAAAAAAAAAAAAJc2V0X2FkbWluAAAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAANc2V0X3dhc21faGFzaAAAAAAAAAEAAAAAAAAACXdhc21faGFzaAAAAAAAA+4AAAAgAAAAAA==",
        "AAAAAAAAAE5Bbm5vdW5jZSBhIGZlZSBjaGFuZ2UuIFRoaXMgc3RhcnRzIHRoZSAyLXdlZWsgZGVsYXkgcGVyaW9kLgpBY2Nlc3M6IGFkbWluIG9ubHkAAAAAABNhbm5vdW5jZV9mZWVfY2hhbmdlAAAAAAEAAAAAAAAAC25ld19mZWVfYnBzAAAAAAQAAAAA",
        "AAAAAAAAAFZFeGVjdXRlIHRoZSBhbm5vdW5jZWQgZmVlIGNoYW5nZSBhZnRlciB0aGUgZGVsYXkgcGVyaW9kIGhhcyBwYXNzZWQuCkFjY2VzczogYWRtaW4gb25seQAAAAAAEmV4ZWN1dGVfZmVlX2NoYW5nZQAAAAAAAAAAAAA=",
        "AAAABAAAAAAAAAAAAAAADUNvbnRyYWN0RXJyb3IAAAAAAAAMAAAAAAAAABJBbHJlYWR5SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAADk5vdEluaXRpYWxpemVkAAAAAAACAAAAAAAAAA1BbHJlYWR5RXhpc3RzAAAAAAAAAwAAAAAAAAARUG9vbEFscmVhZHlFeGlzdHMAAAAAAAAEAAAAAAAAAAxQb29sTm90Rm91bmQAAAAFAAAAAAAAAAxQb29sTm90T3duZWQAAAAGAAAAAAAAAA1Qb29sTm90QWN0aXZlAAAAAAAABwAAAAAAAAAMUG9vbE5vdFZhbGlkAAAACAAAAAAAAAAQSW5pdGlhbGl6ZUZhaWxlZAAAAAkAAAAAAAAAFUZlZUNoYW5nZU5vdEFubm91bmNlZAAAAAAAAAoAAAAAAAAAEUZlZUNoYW5nZU5vdFJlYWR5AAAAAAAACwAAAAAAAAAPSW52YWxpZEZlZVZhbHVlAAAAAAw=" ]),
      options
    )
  }
  public readonly fromJSON = {
    initialize: this.txFromJSON<null>,
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