import { Client as ClientLobster, networks as lobsterNetworks } from './lobster.js';
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

export class LobsterClient {
	public readonly lobster: ClientLobster;
	private readonly keypair: Keypair;

	constructor(secret: string, contractId: string, opts?: { rpcUrl?: string }) {
		const rpcUrl = opts?.rpcUrl ?? process.env.RPC_URL ?? 'https://soroban-testnet.stellar.org';
		this.keypair = Keypair.fromSecret(secret);

		// Determine network based on RPC URL
		const isTestnet = rpcUrl.includes('testnet') || rpcUrl.includes('futurenet');
		const network = isTestnet ? lobsterNetworks.testnet : (lobsterNetworks as any).unknown;
		const networkPassphrase = process.env.NETWORK_PASSPHRASE ?? network.networkPassphrase;

		const networkConfig = {
			networkPassphrase: networkPassphrase,
			contractId: contractId,
		}

		this.lobster = new ClientLobster({
			...networkConfig,
			rpcUrl,
			publicKey: this.keypair.publicKey(),
			signTransaction: makeSigner(networkPassphrase, this.keypair)
		});
	}

	// Writes (return assembled transactions)

	exit_reentrancy() {
		return this.lobster.exit_reentrancy();
	}
	deposit(params: Parameters<ClientLobster['deposit']>[0]) {
		return this.lobster.deposit(params);
	}
	add_liquidity_phoenix(params: Parameters<ClientLobster['add_liquidity_phoenix']>[0]) {
		return this.lobster.add_liquidity_phoenix(params);
	}
	add_liquidity_soroswap(params: Parameters<ClientLobster['add_liquidity_soroswap']>[0]) {
		return this.lobster.add_liquidity_soroswap(params);
	}
	add_liquidity_aquarius(params: Parameters<ClientLobster['add_liquidity_aquarius']>[0]) {
		return this.lobster.add_liquidity_aquarius(params);
	}
	withdraw_aquarius(params: Parameters<ClientLobster['withdraw_aquarius']>[0]) {
		return this.lobster.withdraw_aquarius(params);
	}
	withdraw_phoenix(params: Parameters<ClientLobster['withdraw_phoenix']>[0]) {
		return this.lobster.withdraw_phoenix(params);
	}
	withdraw_soroswap(params: Parameters<ClientLobster['withdraw_soroswap']>[0]) {
		return this.lobster.withdraw_soroswap(params);
	}
	withdraw_contract(params: Parameters<ClientLobster['withdraw_contract']>[0]) {
		return this.lobster.withdraw_contract(params);
	}


	// Reads (simulate and return retval)
	async get_owner() {
		const tx = await this.lobster.get_owner();
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async get_multisig() {
		const tx = await this.lobster.get_multisig();
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async get_token0() {
		const tx = await this.lobster.get_token0();
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async get_token1() {
		const tx = await this.lobster.get_token1();
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async get_deposit_amounts(params: Parameters<ClientLobster['get_deposit_amounts']>[0]) {
		const tx = await this.lobster.get_deposit_amounts(params);
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async get_lp_aquarius(params: Parameters<ClientLobster['get_lp_aquarius']>[0]) {
		const tx = await this.lobster.get_lp_aquarius(params);
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async get_lp_phoenix(params: Parameters<ClientLobster['get_lp_phoenix']>[0]) {
		const tx = await this.lobster.get_lp_phoenix(params);
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async get_lp_soroswap(params: Parameters<ClientLobster['get_lp_soroswap']>[0]) {
		const tx = await this.lobster.get_lp_soroswap(params);
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async get_reserves(params: Parameters<ClientLobster['get_reserves']>[0]) {
		const tx = await this.lobster.get_reserves(params);
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async get_prices_from_reserves(params: Parameters<ClientLobster['get_prices_from_reserves']>[0]) {
		const tx = await this.lobster.get_prices_from_reserves(params);
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async get_token_tvl_from_reserves(params: Parameters<ClientLobster['get_token_tvl_from_reserves']>[0]) {
		const tx = await this.lobster.get_token_tvl_from_reserves(params);
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async get_fee_cut(params: Parameters<ClientLobster['get_fee_cut']>[0]) {
		const tx = await this.lobster.get_fee_cut(params);
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async get_actual_pool() {
		const tx = await this.lobster.get_actual_pool();
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async get_actual_router() {
		const tx = await this.lobster.get_actual_router();
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async get_actual_share() {
		const tx = await this.lobster.get_actual_share();
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async get_active_protocol() {
		const tx = await this.lobster.get_active_protocol();
		const sim = await tx.simulate();
		return sim.result as any;
	}
	async get_amounts_from_phoenix(params: Parameters<ClientLobster['get_amounts_from_phoenix']>[0]) {
		const tx = await this.lobster.get_amounts_from_phoenix(params);
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async get_amounts_from_soroswap(params: Parameters<ClientLobster['get_amounts_from_soroswap']>[0]) {
		const tx = await this.lobster.get_amounts_from_soroswap(params);
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
	async get_amounts_from_aquarius(params: Parameters<ClientLobster['get_amounts_from_aquarius']>[0]) {
		const tx = await this.lobster.get_amounts_from_aquarius(params);
		const sim = await tx.simulate();
		return extractRetval(sim);
	}

	async get_amounts_tokens() {
		const tx = await this.lobster.get_amounts_tokens();
		const sim = await tx.simulate();
		return extractRetval(sim);
	}
}