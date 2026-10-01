import * as StellarSdk from "@stellar/stellar-sdk";
import 'dotenv/config';

export type SignerConfig = {
  secretKeyHex?: string;  // For local signing
  apiUrl?: string;        // For external signing (e.g., "http://localhost:4001")
};

export type MultisigConfig = {
  contractId: string;
  caller: string;
  signers: SignerConfig[];  // Array of signer configs (local or external)
  feepayerSecret: string;
  signatureExpirationLedger: number;
  networkPassphrase: string;
  rpcUrl: string;
  multisigType?: '1-of-n' | 'n-of-n';  // Default: 'n-of-n'
};

export type AddLiquiditySoroswapParams = {
  amount0: number;
  amount1: number;
  amount0Min: number;
  amount1Min: number;
  deadlineLedger: number;
  routerAddress: string;
};

export type AddLiquidityPhoenixParams = {
  amount0: number;
  amount1: number;
  amount0Min: number;
  amount1Min: number;
  deadline: number;
  poolAddress: string;
  slippage: number;
};

export type AddLiquidityAquariusParams = {
  amount0: number;
  amount1: number;
  poolAddress: string;
};

export type WithdrawSoroswapParams = {
  amount0Min: number;
  amount1Min: number;
  deadline: number;
  poolAddress: string;
  routerAddress: string;
};

export type WithdrawPhoenixParams = {
  amount0Min: number;
  amount1Min: number;
  deadline: number;
  poolAddress: string;
};

export type WithdrawAquariusParams = {
  amount0Min: number;
  amount1Min: number;
  poolAddress: string;
};

function createKeypairsFromSecrets(secretKeysHex: string[]): StellarSdk.Keypair[] {
  return secretKeysHex.map(hexKey => 
    StellarSdk.Keypair.fromRawEd25519Seed(Buffer.from(hexKey, "hex"))
  );
}

async function getSignerPublicKey(signer: SignerConfig): Promise<Buffer> {
  if (signer.secretKeyHex) {
    const keypair = StellarSdk.Keypair.fromRawEd25519Seed(Buffer.from(signer.secretKeyHex, "hex"));
    return Buffer.from(keypair.rawPublicKey());
  } else if (signer.apiUrl) {
    const response = await fetch(`${signer.apiUrl}/health`);
    if (!response.ok) {
      throw new Error(`Failed to get public key from signer API: ${response.statusText}`);
    }
    const data = await response.json();
    return Buffer.from(data.publicKey, 'hex');
  } else {
    throw new Error('Signer must have either secretKeyHex or apiUrl');
  }
}

async function signPayloadHash(
  signer: SignerConfig,
  payloadHash: Buffer,
  index?: number
): Promise<{ publicKey: Buffer; signature: Buffer }> {
  if (signer.secretKeyHex) {
    const keypair = StellarSdk.Keypair.fromRawEd25519Seed(Buffer.from(signer.secretKeyHex, "hex"));
    const signature = keypair.sign(payloadHash);
    return {
      publicKey: Buffer.from(keypair.rawPublicKey()),
      signature: Buffer.from(signature)
    };
  } else if (signer.apiUrl) {
    const payloadHashHex = Buffer.from(payloadHash).toString('hex');
    const response = await fetch(`${signer.apiUrl}/sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payloadHash: payloadHashHex,
        index: index
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to sign via API: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return {
      publicKey: Buffer.from(data.publicKey, 'hex'),
      signature: Buffer.from(data.signature, 'hex')
    };
  } else {
    throw new Error('Signer must have either secretKeyHex or apiUrl');
  }
}

// 1-of-n puts one signature map in the credentials, n-of-n a Vec of them sorted by public key
async function signAuthEntries(
  preparedTransaction: StellarSdk.Transaction,
  signers: SignerConfig[],
  networkId: Buffer,
  signatureExpirationLedger: number,
  multisigType: '1-of-n' | 'n-of-n' = 'n-of-n'
): Promise<StellarSdk.Transaction> {
  const txe = preparedTransaction.toEnvelope().v1();
  const operations = txe.tx().operations();
  let authCount = 0;

  for (const op of operations) {
    if (op.body().switch() === StellarSdk.xdr.OperationType.invokeHostFunction()) {
      const invokeOp = op.body().invokeHostFunctionOp();
      const auths = invokeOp.auth();

      for (const auth of auths) {
        const creds = auth.credentials();
        
        if (creds.switch() === StellarSdk.xdr.SorobanCredentialsType.sorobanCredentialsAddress()) {
          authCount++;
          const addressCreds = creds.address();
          const invocation = auth.rootInvocation();

          console.log(`  Signing auth entry ${authCount} with ${signers.length} signers:`);
          console.log("    Nonce:", addressCreds.nonce().toString());
          console.log("    Signature expiration ledger:", signatureExpirationLedger);

          // every signer signs the same payload
          const payload = StellarSdk.xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
            new StellarSdk.xdr.HashIdPreimageSorobanAuthorization({
              networkId: networkId,
              nonce: addressCreds.nonce(),
              signatureExpirationLedger: signatureExpirationLedger,
              invocation: invocation,
            })
          );

          const payloadXdr = payload.toXDR();
          const payloadHash = StellarSdk.hash(payloadXdr);
          const payloadHashHex = Buffer.from(payloadHash).toString('hex');
          console.log("    Payload hash:", payloadHashHex);

          if (multisigType === '1-of-n') {
            // the first signer that answers is enough
            let signatureResult: { publicKey: Buffer; signature: Buffer } | null = null;
            let signerIndex = -1;
            
            for (let i = 0; i < signers.length; i++) {
              const signer = signers[i];
              try {
                const result = await signPayloadHash(signer, payloadHash, i);
                signatureResult = result;
                signerIndex = i;
                
                const signerType = signer.secretKeyHex ? 'local' : 'external';
                console.log(`    Using signer ${i + 1} (${signerType}):`);
                console.log("      Public key:", Buffer.from(result.publicKey).toString('hex'));
                console.log("      Signature:", Buffer.from(result.signature).toString('hex'));
                break;
              } catch (error: any) {
                console.warn(`    Failed to sign with signer ${i + 1}, trying the next one`);
              }
            }

            if (!signatureResult) {
              throw new Error('Failed to get signature from any signer');
            }

            const signatureMap = StellarSdk.xdr.ScVal.scvMap([
              new StellarSdk.xdr.ScMapEntry({
                key: StellarSdk.xdr.ScVal.scvSymbol("public_key"),
                val: StellarSdk.xdr.ScVal.scvBytes(signatureResult.publicKey),
              }),
              new StellarSdk.xdr.ScMapEntry({
                key: StellarSdk.xdr.ScVal.scvSymbol("signature"),
                val: StellarSdk.xdr.ScVal.scvBytes(signatureResult.signature),
              }),
            ]);

            addressCreds.signatureExpirationLedger(signatureExpirationLedger);
            addressCreds.signature(signatureMap);
            
            console.log(`    Auth entry signed with signer ${signerIndex + 1} (1-of-n multisig)`);
          } else {
            // n-of-n: every signer has to sign
            const signatureResults: Array<{ publicKey: Buffer; signature: Buffer; index: number }> = [];
            
            for (let i = 0; i < signers.length; i++) {
              const signer = signers[i];
              try {
                const result = await signPayloadHash(signer, payloadHash, i);
                signatureResults.push({
                  ...result,
                  index: i
                });
                
                const signerType = signer.secretKeyHex ? 'local' : 'external';
                console.log(`    Signer ${i + 1} (${signerType}):`);
                console.log("      Public key:", Buffer.from(result.publicKey).toString('hex'));
                console.log("      Signature:", Buffer.from(result.signature).toString('hex'));
              } catch (error: any) {
                console.error(`    Failed to sign with signer ${i + 1}:`, error.message);
                throw error;
              }
            }

            if (signatureResults.length !== signers.length) {
              throw new Error(`Expected ${signers.length} signatures but got ${signatureResults.length}`);
            }

            // the multisig contract requires the signatures sorted by public key
            signatureResults.sort((a, b) => {
              const aHex = Buffer.from(a.publicKey).toString('hex');
              const bHex = Buffer.from(b.publicKey).toString('hex');
              return aHex.localeCompare(bHex);
            });

            console.log("    Signatures ordered by public key:");
            signatureResults.forEach((result, idx) => {
              console.log(`      ${idx + 1}. ${Buffer.from(result.publicKey).toString('hex')}`);
            });

            const signatures: StellarSdk.xdr.ScVal[] = signatureResults.map(result => {
              return StellarSdk.xdr.ScVal.scvMap([
                new StellarSdk.xdr.ScMapEntry({
                  key: StellarSdk.xdr.ScVal.scvSymbol("public_key"),
                  val: StellarSdk.xdr.ScVal.scvBytes(result.publicKey),
                }),
                new StellarSdk.xdr.ScMapEntry({
                  key: StellarSdk.xdr.ScVal.scvSymbol("signature"),
                  val: StellarSdk.xdr.ScVal.scvBytes(result.signature),
                }),
              ]);
            });

            addressCreds.signatureExpirationLedger(signatureExpirationLedger);
            
            // the account contract expects a Vec<AccSignature>
            const signaturesVec = StellarSdk.xdr.ScVal.scvVec(signatures);
            addressCreds.signature(signaturesVec);
            
            console.log(`    Auth entry signed with ${signers.length} signatures (n-of-n multisig)`);
          }
        }
      }
    }
  }

  console.log(`Signed ${authCount} auth entries`);

  const modifiedEnvelope = StellarSdk.xdr.TransactionEnvelope.envelopeTypeTx(txe);
  const signedAuthTx = StellarSdk.TransactionBuilder.fromXDR(
    modifiedEnvelope.toXDR("base64"),
    preparedTransaction.networkPassphrase
  );

  // fromXDR is typed to return either kind; this envelope is never a fee bump
  if (signedAuthTx instanceof StellarSdk.FeeBumpTransaction) {
    throw new Error("Unexpected FeeBumpTransaction type");
  }

  return signedAuthTx;
}

export async function executeContractCallWithMultisig(
  config: MultisigConfig,
  methodName: string,
  buildOperation: (contract: StellarSdk.Contract) =>  StellarSdk.xdr.Operation<StellarSdk.Operation.InvokeHostFunction>
): Promise<StellarSdk.rpc.Api.SendTransactionResponse> {
  const server = new StellarSdk.rpc.Server(config.rpcUrl, {
    allowHttp: config.rpcUrl.startsWith("http://"),
  });

  const feepayerKeypair = StellarSdk.Keypair.fromSecret(config.feepayerSecret);
  
  console.log(`Using ${config.signers.length} signers`);
  for (let i = 0; i < config.signers.length; i++) {
    const signer = config.signers[i];
    if (signer.secretKeyHex) {
      const keypair = StellarSdk.Keypair.fromRawEd25519Seed(Buffer.from(signer.secretKeyHex, "hex"));
      console.log(`  Signer ${i + 1} (local):`, Buffer.from(keypair.rawPublicKey()).toString('hex'));
    } else if (signer.apiUrl) {
      try {
        const publicKey = await getSignerPublicKey(signer);
        console.log(`  Signer ${i + 1} (external ${signer.apiUrl}):`, Buffer.from(publicKey).toString('hex'));
      } catch (error) {
        console.log(`  Signer ${i + 1} (external ${signer.apiUrl}): Failed to get public key`);
      }
    }
  }
  
  const feepayerAccount = await server.getAccount(feepayerKeypair.publicKey());
  const networkId = StellarSdk.hash(Buffer.from(config.networkPassphrase));

  console.log(`\nBuilding contract operation: ${methodName}...`);
  const contract = new StellarSdk.Contract(config.contractId);
  const operation = buildOperation(contract);

  console.log("\nBuilding transaction...");
  const transaction = new StellarSdk.TransactionBuilder(feepayerAccount, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(StellarSdk.TimeoutInfinite)
    .build();

  console.log("\nSimulating transaction...");
  const simulateResponse = await server.simulateTransaction(transaction);
  
  if (StellarSdk.rpc.Api.isSimulationError(simulateResponse)) {
    throw new Error(`Simulation failed: ${JSON.stringify(simulateResponse)}`);
  }

  console.log("\nPreparing transaction...");
  const preparedTransaction = await server.prepareTransaction(transaction);
  if (!preparedTransaction) {
    throw new Error("Failed to prepare transaction");
  }

  console.log("\nSigning auth entries with multiple signers...");
  const signedAuthTx = await signAuthEntries(
    preparedTransaction,
    config.signers,
    networkId,
    config.signatureExpirationLedger,
    config.multisigType ?? 'n-of-n'
  );

  console.log("\nSimulating with signed auth...");
  const simulateResponse2 = await server.simulateTransaction(signedAuthTx);
  if (StellarSdk.rpc.Api.isSimulationError(simulateResponse2)) {
    throw new Error(`Second simulation failed: ${JSON.stringify(simulateResponse2)}`);
  }

  console.log("\nPreparing and signing...");
  const preparedTx2 = await server.prepareTransaction(signedAuthTx);
  if (!preparedTx2) {
    throw new Error("Failed to prepare transaction");
  }
  preparedTx2.sign(feepayerKeypair);

  console.log("\nSending transaction...");
  const sendResponse = await server.sendTransaction(preparedTx2);

  console.log("  Send status:", sendResponse.status);
  console.log("  Transaction hash:", sendResponse.hash);
  
  return sendResponse;
}

export async function addLiquiditySoroswapWithMultisig(
  config: MultisigConfig,
  params: AddLiquiditySoroswapParams
): Promise<StellarSdk.rpc.Api.SendTransactionResponse> {
  return executeContractCallWithMultisig(
    config,
    "add_liquidity_soroswap",
    (contract) => contract.call(
      "add_liquidity_soroswap",
      StellarSdk.nativeToScVal(config.caller, { type: "address" }),
      StellarSdk.nativeToScVal(params.amount0, { type: "i128" }),
      StellarSdk.nativeToScVal(params.amount1, { type: "i128" }),
      StellarSdk.nativeToScVal(params.amount0Min, { type: "i128" }),
      StellarSdk.nativeToScVal(params.amount1Min, { type: "i128" }),
      StellarSdk.nativeToScVal(params.deadlineLedger, { type: "u64" }),
      StellarSdk.nativeToScVal(params.routerAddress, { type: "address" })
    )
  );
}

export async function addLiquidityPhoenixWithMultisig(
  config: MultisigConfig,
  params: AddLiquidityPhoenixParams
): Promise<StellarSdk.rpc.Api.SendTransactionResponse> {
  return executeContractCallWithMultisig(
    config,
    "add_liquidity_phoenix",
    (contract) => contract.call(
      "add_liquidity_phoenix",
      StellarSdk.nativeToScVal(config.caller, { type: "address" }),
      StellarSdk.nativeToScVal(params.amount0, { type: "i128" }),
      StellarSdk.nativeToScVal(params.amount1, { type: "i128" }),
      StellarSdk.nativeToScVal(params.amount0Min, { type: "i128" }),
      StellarSdk.nativeToScVal(params.amount1Min, { type: "i128" }),
      StellarSdk.nativeToScVal(params.poolAddress, { type: "address" }),
      StellarSdk.nativeToScVal(params.deadline, { type: "u64" }),
      StellarSdk.nativeToScVal(params.slippage, { type: "i64" })
    )
  );
}


export async function addLiquidityAquariusWithMultisig(
  config: MultisigConfig,
  params: AddLiquidityAquariusParams
): Promise<StellarSdk.rpc.Api.SendTransactionResponse> {
  return executeContractCallWithMultisig(
    config,
    "add_liquidity_aquarius",
    (contract) => contract.call(
      "add_liquidity_aquarius",
      StellarSdk.nativeToScVal(config.caller, { type: "address" }),
      StellarSdk.nativeToScVal(params.amount0, { type: "i128" }),
      StellarSdk.nativeToScVal(params.amount1, { type: "i128" }),
      StellarSdk.nativeToScVal(params.poolAddress, { type: "address" }),

    )
  );
}

export async function withdrawSoroswapWithMultisig(
  config: MultisigConfig,
  params: WithdrawSoroswapParams
): Promise<StellarSdk.rpc.Api.SendTransactionResponse> {
  return executeContractCallWithMultisig(
    config,
    "withdraw_soroswap",
    (contract) => contract.call(
      "withdraw_soroswap",
      StellarSdk.nativeToScVal(config.caller, { type: "address" }),
      StellarSdk.nativeToScVal(params.amount0Min, { type: "i128" }),
      StellarSdk.nativeToScVal(params.amount1Min, { type: "i128" }),
      StellarSdk.nativeToScVal(params.poolAddress, { type: "address" }),
      StellarSdk.nativeToScVal(params.routerAddress, { type: "address" }),
      StellarSdk.nativeToScVal(params.deadline, { type: "u64" })
    )
  );
}

export async function withdrawPhoenixWithMultisig(
  config: MultisigConfig,
  params: WithdrawPhoenixParams
): Promise<StellarSdk.rpc.Api.SendTransactionResponse> {
  return executeContractCallWithMultisig(
    config,
    "withdraw_phoenix",
    (contract) => contract.call(
      "withdraw_phoenix",
      StellarSdk.nativeToScVal(config.caller, { type: "address" }),
      StellarSdk.nativeToScVal(params.poolAddress, { type: "address" }),
      StellarSdk.nativeToScVal(params.amount0Min, { type: "i128" }),
      StellarSdk.nativeToScVal(params.amount1Min, { type: "i128" }),
      StellarSdk.nativeToScVal(params.deadline, { type: "u64" }),
    )
  );
}

export async function withdrawAquariusWithMultisig(
  config: MultisigConfig,
  params: WithdrawAquariusParams
): Promise<StellarSdk.rpc.Api.SendTransactionResponse> {
  return executeContractCallWithMultisig(
    config,
    "withdraw_aquarius",
    (contract) => contract.call(
      "withdraw_aquarius",
      StellarSdk.nativeToScVal(config.caller, { type: "address" }),
      StellarSdk.nativeToScVal(params.poolAddress, { type: "address" }),
      StellarSdk.nativeToScVal(params.amount0Min, { type: "u128" }),
      StellarSdk.nativeToScVal(params.amount1Min, { type: "u128" }),
    )
  );
}
