import type { AssembledTransaction } from '@stellar/stellar-sdk/contract';

declare module '@stellar/stellar-sdk/contract' {
  interface Client {
    txFromJSON<T = unknown>(...args: unknown[]): AssembledTransaction<T>;
  }
}







