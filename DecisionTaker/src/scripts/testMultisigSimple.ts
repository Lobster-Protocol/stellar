import 'dotenv/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import { executeContractCallWithMultisig, type MultisigConfig } from '../services/operations/multisigPoolOperations.js';
import { Keypair, rpc } from '@stellar/stellar-sdk';

async function getCurrentLedger(rpcUrl: string): Promise<number> {
  const server = new rpc.Server(rpcUrl, {
    allowHttp: rpcUrl.startsWith('http://'),
  });
  const ledger = await server.getLatestLedger();
  return ledger.sequence;
}

function secretToHex(secret: string): string {
  const isHexSeed = /^[0-9a-fA-F]{64}$/;
  if (isHexSeed.test(secret)) {
    return secret.toLowerCase();
  }
  if (secret.startsWith('S')) {
    const keypair = Keypair.fromSecret(secret);
    return Buffer.from(keypair.rawSecretKey()).toString('hex');
  }
  throw new Error('Invalid secret format. Expected Stellar secret (S...) or hex (64 chars)');
}

async function main() {

  const feepayerSecret = process.env.FEEPAYER_SECRET ?? process.env.SECRET ?? '';
  if (!feepayerSecret) {
    throw new Error('FEEPAYER_SECRET or SECRET environment variable is required');
  }

  // the multisig account is the caller; FEEPAYER_SECRET only pays the fees
  const caller = process.env.CALLER_ADDRESS ?? 'CBX5O4ZTTZQRU2BSIR7MP56I7Y6NX2BXEAQBOM7TH32KJYU7UTN5JCOH';

  const rpcUrl = process.env.RPC_URL ?? 'https://soroban-testnet.stellar.org';
  const networkPassphrase = process.env.NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015';
  
  const currentLedger = await getCurrentLedger(rpcUrl);
  const signatureExpirationLedger = currentLedger + 100;

  const contractId = process.env.CONTRACT_ID ?? 'CCTRCILPS7AH4OQ5UYQDMI26TGSNVAGJG45ORF6JJH24QECO4UZK5RPM';
  if (!contractId) {
    throw new Error('CONTRACT_ID environment variable is required');
  }

  const signers: Array<{ secretKeyHex?: string; apiUrl?: string }> = [];

  // MULTISIG_SIGNER_SECRETS entries can be hex seeds or Stellar secrets
  const localSecrets = (process.env.MULTISIG_SIGNER_SECRETS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const secret of localSecrets) {
    try {
      const hexSecret = secretToHex(secret);
      signers.push({ secretKeyHex: hexSecret });
      
      const keypair = Keypair.fromRawEd25519Seed(Buffer.from(hexSecret, 'hex'));
      console.log(`Added local signer: ${keypair.publicKey()} (hex: ${Buffer.from(keypair.rawPublicKey()).toString('hex')})`);
    } catch (error) {
      console.warn(`Skipping invalid local signer secret: ${error}`);
    }
  }

  const apiUrls = (process.env.MULTISIG_SIGNER_APIS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const apiUrl of apiUrls) {
    signers.push({ apiUrl });
    console.log(`Added external signer: ${apiUrl}`);
  }

  if (signers.length === 0) {
    throw new Error('No signers configured. Set MULTISIG_SIGNER_SECRETS and/or MULTISIG_SIGNER_APIS');
  }

  const multisigType = (process.env.MULTISIG_TYPE ?? 'n-of-n') as '1-of-n' | 'n-of-n';
  if (multisigType !== '1-of-n' && multisigType !== 'n-of-n') {
    throw new Error('MULTISIG_TYPE must be either "1-of-n" or "n-of-n"');
  }

  const config: MultisigConfig = {
    contractId,
    caller,
    signers,
    feepayerSecret,
    signatureExpirationLedger,
    networkPassphrase,
    rpcUrl,
    multisigType,
  };

  console.log('\nMultisig config');
  console.log('Contract ID:', contractId);
  console.log('Caller (multisig account):', caller);
  console.log('Feepayer (pays TX fees):', Keypair.fromSecret(feepayerSecret).publicKey());
  console.log('Multisig Type:', multisigType);
  console.log('Signers:', signers.length);
  console.log('Signature Expiration Ledger:', signatureExpirationLedger);
  console.log('RPC URL:', rpcUrl);
  console.log('Network:', networkPassphrase);
  console.log('');

  const amount0 = Number.parseInt(process.env.AMOUNT0 ?? '1000', 10);
  const amount1 = Number.parseInt(process.env.AMOUNT1 ?? '5000', 10);
  const amount0Min = Number.parseInt(process.env.AMOUNT0_MIN ?? '40', 10);
  const amount1Min = Number.parseInt(process.env.AMOUNT1_MIN ?? '40', 10);
  const deadlineLedger = Number.parseInt(process.env.DEADLINE_LEDGER ?? '99999999999', 10);
  const routerAddress = process.env.SOROSWAP_ROUTER ?? process.env.ROUTER_ADDRESS ?? '';
  
  if (!routerAddress) {
    throw new Error('SOROSWAP_ROUTER or ROUTER_ADDRESS environment variable is required');
  }

  console.log('\nAdd liquidity parameters');
  console.log('Amount 0:', amount0);
  console.log('Amount 1:', amount1);
  console.log('Amount 0 Min:', amount0Min);
  console.log('Amount 1 Min:', amount1Min);
  console.log('Deadline Ledger:', deadlineLedger);
  console.log('Router Address:', routerAddress);

  console.log('');

  const poolAddress = process.env.POOL_ADDRESS ?? 'CBW6PPCXSPOYVQAMWGEC5C2DHVYVGEPTNTC6IWO7QO7WCFJXDXNTMTXJ';
  const slippage = process.env.SLIPPAGE ?? '500';

  try {
    const response = await executeContractCallWithMultisig(
      config,
      'add_liquidity_phoenix',
      (contract) => contract.call(
        'add_liquidity_phoenix',
        StellarSdk.nativeToScVal(config.caller, { type: 'address' }),
        StellarSdk.nativeToScVal(amount0, { type: 'i128' }),
        StellarSdk.nativeToScVal(amount1, { type: 'i128' }),
        StellarSdk.nativeToScVal(amount0Min, { type: 'i128' }),
        StellarSdk.nativeToScVal(amount1Min, { type: 'i128' }),
        StellarSdk.nativeToScVal(poolAddress, { type: "address" }),
        StellarSdk.nativeToScVal(deadlineLedger, { type: 'u64' }),
        StellarSdk.nativeToScVal(slippage, { type: 'i64' })
      )
    );

    console.log('\nTransaction sent');
    console.log('Status:', response.status);
    console.log('Hash:', response.hash);
  } catch (error) {
    console.error('\nContract call failed:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

