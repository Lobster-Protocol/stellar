import { Client as ClientToken, networks as tokenNetworks } from './token';
import { TransactionBuilder, Keypair } from '@stellar/stellar-sdk';

type SignFn = (txXdr: string) => Promise<{ signedTxXdr: string; signerAddress: string }>

function makeSigner(networkPassphrase: string, keypair: Keypair): SignFn {
	return async (txXdr: string) => {
		const tx = TransactionBuilder.fromXDR(txXdr, networkPassphrase);
		tx.sign(keypair);
		return {
			signedTxXdr: tx.toXDR(),
			signerAddress: keypair.publicKey()
		};
	};
}

async function extractRetval(simulationResult: any) {
	const sim = (simulationResult?.simulation ?? simulationResult) as any;
	return sim?.result?.retval ?? null;
}

export class TokenClient {
	public readonly token: ClientToken;
	private readonly keypair: Keypair;

	constructor(secret: string, contractId: string, opts?: { rpcUrl?: string }) {
		const rpcUrl = opts?.rpcUrl ?? process.env.RPC_URL ?? 'https://soroban-testnet.stellar.org';
		this.keypair = Keypair.fromSecret(secret);

		const custom_testnet = {
			networkPassphrase: "Test SDF Network ; September 2015",
			contractId: contractId,
		}

		this.token = new ClientToken({
			...custom_testnet,
			rpcUrl,
			publicKey: this.keypair.publicKey(),
			signTransaction: makeSigner(custom_testnet.networkPassphrase, this.keypair)
		});
	}

	// Writes (return assembled transactions)
	approve(params: Parameters<ClientToken['approve']>[0]) {
		return this.token.approve(params);
	}
	transfer(params: Parameters<ClientToken['transfer']>[0]) {
		return this.token.transfer(params);
	}
	transfer_from(params: Parameters<ClientToken['transfer_from']>[0]) {
		return this.token.transfer_from(params);
	}
	burn(params: Parameters<ClientToken['burn']>[0]) {
		return this.token.burn(params);
	}
	burn_from(params: Parameters<ClientToken['burn_from']>[0]) {
		return this.token.burn_from(params);
	}
	initialize(params: Parameters<ClientToken['initialize']>[0]) {
		return this.token.initialize(params);
	}
	deposit(params: Parameters<ClientToken['deposit']>[0]) {
		return this.token.deposit(params);
	}
	swap(params: Parameters<ClientToken['swap']>[0]) {
		return this.token.swap(params);
	}
	withdraw(params: Parameters<ClientToken['withdraw']>[0]) {
		return this.token.withdraw(params);
	}
	skim(params: Parameters<ClientToken['skim']>[0]) {
		return this.token.skim(params);
	}
	sync() {
		return this.token.sync();
	}

	// Reads (simulate and return retval)
	async total_supply() {
		const tx = await this.token.total_supply();
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async allowance(params: Parameters<ClientToken['allowance']>[0]) {
		const tx = await this.token.allowance(params);
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async balance(params: Parameters<ClientToken['balance']>[0]) {
		const tx = await this.token.balance(params);
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async decimals() {
		const tx = await this.token.decimals();
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async name() {
		const tx = await this.token.name();
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async symbol() {
		const tx = await this.token.symbol();
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async token_0() {
		const tx = await this.token.token_0();
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async token_1() {
		const tx = await this.token.token_1();
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async factory() {
		const tx = await this.token.factory();
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async get_reserves() {
		const tx = await this.token.get_reserves();
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async k_last() {
		const tx = await this.token.k_last();
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
}