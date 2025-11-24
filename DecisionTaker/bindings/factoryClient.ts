import { Client as ClientFactory, networks as factoryNetworks } from './factory.js';
import { TransactionBuilder, Keypair } from '@stellar/stellar-sdk';

type SignFn = (txXdr: string) => Promise<{ signedTxXdr: string; signerAddress: string }>

function makeSigner(networkPassphrase: string, keypair: Keypair): SignFn {
  return async (txXdr: string) => {
    const tx = TransactionBuilder.fromXDR(txXdr, networkPassphrase);
    tx.sign(keypair);
    return { signedTxXdr: tx.toXDR(), signerAddress: keypair.publicKey() };
  };
}

async function extractRetval(simulationResult: any) {
  const sim = (simulationResult?.simulation ?? simulationResult) as any;
  return sim?.result?.retval ?? null;
}

export class FactoryClient {
  public readonly factory: ClientFactory;
  private readonly keypair: Keypair;

  constructor(secret: string, factoryId: string, opts?: { rpcUrl?: string }) {
    const rpcUrl = opts?.rpcUrl ?? process.env.RPC_URL ?? 'https://soroban-testnet.stellar.org';
    this.keypair = Keypair.fromSecret(secret);

    const custom_testnet = {
			networkPassphrase: "Test SDF Network ; September 2015",
			contractId: factoryId,
		}
    this.factory = new ClientFactory({
      ...custom_testnet,
      rpcUrl,
      publicKey: this.keypair.publicKey(),
      signTransaction: makeSigner(factoryNetworks.testnet.networkPassphrase, this.keypair)
    });
  }

  // Writes
  create_pool(params: Parameters<ClientFactory['create_pool']>[0]) {
    return this.factory.create_pool(params);
  }
  set_admin(new_admin: string) {
    return this.factory.set_admin({ new_admin });
  }
  set_wasm_hash(wasm_hash: Buffer) {
    return this.factory.set_wasm_hash({ wasm_hash });
  }
  announce_fee_change(new_fee_bps: number) {
    return this.factory.announce_fee_change({ new_fee_bps: new_fee_bps as any });
  }
  execute_fee_change() {
    return this.factory.execute_fee_change();
  }

  // Reads
  async get_admin() {
    const tx = await this.factory.get_admin();
    const sim = await tx.simulate();
    return extractRetval(sim);
  }
  async get_wasm_hash() {
    const tx = await this.factory.get_wasm_hash();
    const sim = await tx.simulate();
    return extractRetval(sim);
  }
  async get_pool_count(): Promise<bigint> {
    const tx = await this.factory.get_pool_count();
    if (tx.result !== undefined && tx.result !== null) return BigInt(tx.result.toString());
    const sim = await tx.simulate();
    const retval = await extractRetval(sim);
    return BigInt((retval?._value ?? retval ?? 0).toString());
  }
  async get_pool_by_id(id: bigint) {
    const tx = await this.factory.get_pool_by_id({ id });
    const sim = await tx.simulate();
    const result = (sim.result as any);
    return result;
  }
  async get_pool_by_address(addr: string) {
    const tx = await this.factory.get_pool_by_address({ addr });
    const sim = await tx.simulate();
    return extractRetval(sim);
  }
  async get_pools_by_user(user: string) {
    const tx = await this.factory.get_pools_by_user({ user });
    const sim = await tx.simulate();
    return extractRetval(sim);
  }
  async get_pools_by_tokens(token0: string, token1: string) {
    const tx = await this.factory.get_pools_by_tokens({ token0, token1 });
    const sim = await tx.simulate();
    return extractRetval(sim);
  }
}


