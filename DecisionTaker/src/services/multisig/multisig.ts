import * as StellarSdk from "@stellar/stellar-sdk";
import 'dotenv/config';


async function callAddLiquidityWithMultisig(
    contractId: string,
    caller: string,
    amount0: number,
    amount1: number,
    amount0Min: number,
    amount1Min: number,
    deadlineLedger: number,
    routerAddress: string,
    ed25519SecretKeyHex: string[],  // Array of hex secret keys (64 chars each)
    feepayerSecret: string,
    signatureExpirationLedger: number,
    networkPassphrase: string,
    rpcUrl: string
) {
    const server = new StellarSdk.rpc.Server(rpcUrl, {
        allowHttp: rpcUrl.startsWith("http://"),
    });

    const feepayerKeypair = StellarSdk.Keypair.fromSecret(feepayerSecret);
    
    const ed25519Keypairs = ed25519SecretKeyHex.map(hexKey => 
        StellarSdk.Keypair.fromRawEd25519Seed(Buffer.from(hexKey, "hex"))
    );
    
    console.log(`Created ${ed25519Keypairs.length} keypairs for signing`);
    ed25519Keypairs.forEach((kp, i) => {
        console.log(`  Signer ${i + 1} public key:`, Buffer.from(kp.rawPublicKey()).toString('hex'));
    });
    
    const feepayerAccount = await server.getAccount(feepayerKeypair.publicKey());
    const networkId = StellarSdk.hash(Buffer.from(networkPassphrase));

    console.log("\nBuilding contract operation...");
    const contract = new StellarSdk.Contract(contractId);
    const operation = contract.call(
        "add_liquidity_soroswap",
        StellarSdk.nativeToScVal(caller, { type: "address" }),
        StellarSdk.nativeToScVal(amount0, { type: "i128" }),
        StellarSdk.nativeToScVal(amount1, { type: "i128" }),
        StellarSdk.nativeToScVal(amount0Min, { type: "i128" }),
        StellarSdk.nativeToScVal(amount1Min, { type: "i128" }),
        StellarSdk.nativeToScVal(deadlineLedger, { type: "u64" }),
        StellarSdk.nativeToScVal(routerAddress, { type: "address" })
    );

    console.log("\nBuilding transaction...");
    const transaction = new StellarSdk.TransactionBuilder(feepayerAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase,
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

                    console.log(`  Signing auth entry ${authCount} with ${ed25519Keypairs.length} signers:`);
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
                    console.log("    Payload hash:", Buffer.from(payloadHash).toString('hex'));

                    const signatures: StellarSdk.xdr.ScVal[] = [];
                    
                    for (let i = 0; i < ed25519Keypairs.length; i++) {
                        const keypair = ed25519Keypairs[i];
                        const signature = keypair.sign(payloadHash);
                        
                        console.log(`    Signer ${i + 1}:`);
                        console.log("      Public key:", Buffer.from(keypair.rawPublicKey()).toString('hex'));
                        console.log("      Signature:", Buffer.from(signature).toString('hex'));
                        
                        const signatureMap = StellarSdk.xdr.ScVal.scvMap([
                            new StellarSdk.xdr.ScMapEntry({
                                key: StellarSdk.xdr.ScVal.scvSymbol("public_key"),
                                val: StellarSdk.xdr.ScVal.scvBytes(keypair.rawPublicKey()),
                            }),
                            new StellarSdk.xdr.ScMapEntry({
                                key: StellarSdk.xdr.ScVal.scvSymbol("signature"),
                                val: StellarSdk.xdr.ScVal.scvBytes(signature),
                            }),
                        ]);
                        
                        signatures.push(signatureMap);
                    }

                    addressCreds.signatureExpirationLedger(signatureExpirationLedger);
                    
                    // the account contract expects a Vec<AccSignature>
                    const signaturesVec = StellarSdk.xdr.ScVal.scvVec(signatures);
                    addressCreds.signature(signaturesVec);
                    
                    console.log(`    Auth entry signed with ${ed25519Keypairs.length} signatures`);
                }
            }
        }
    }

    console.log(`Signed ${authCount} auth entries`);

    console.log("\nRebuilding transaction...");
    const modifiedEnvelope = StellarSdk.xdr.TransactionEnvelope.envelopeTypeTx(txe);
    const signedAuthTx = StellarSdk.TransactionBuilder.fromXDR(
        modifiedEnvelope.toXDR("base64"),
        networkPassphrase
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

function secretKeyToHex(secretKey: string): string {
    const keypair = StellarSdk.Keypair.fromSecret(secretKey);
    
    // rawSecretKey() is the 32-byte ed25519 seed
    const rawSecretKey = keypair.rawSecretKey();
    
    const hexSecret = Buffer.from(rawSecretKey).toString('hex');
    
    return hexSecret;
}

async function example() {

    const secretKey = process.env.FEEPAYER_SECRET ?? 'S...';
    let ed25519SecretKeyHex: string;
    
    if (secretKey.startsWith('S') && secretKey.length >= 56) {
        ed25519SecretKeyHex = secretKeyToHex(secretKey);
    } else if (/^[0-9a-fA-F]{64}$/.test(secretKey)) {
        ed25519SecretKeyHex = secretKey;
        console.log("Secret key is already in hex format");
    } else {
        throw new Error("Invalid secret key format. Expected Stellar secret key (S...) or hex (64 chars)");
    }   
    
    const ed25519Keypair = StellarSdk.Keypair.fromRawEd25519Seed(
        Buffer.from(ed25519SecretKeyHex, "hex")
    );
    
    console.log("Public key (hex):", Buffer.from(ed25519Keypair.rawPublicKey()).toString('hex'));
    const feepayerSecret = process.env.FEEPAYER_SECRET ?? '';

    const signerSecretsHex = (process.env.MULTISIG_SIGNER_SECRETS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => (s.startsWith('S') ? secretKeyToHex(s) : s));
    if (!signerSecretsHex.length) {
        throw new Error("MULTISIG_SIGNER_SECRETS is required (comma-separated signer seeds, S... secrets or 64 hex characters each)");
    }

    await callAddLiquidityWithMultisig(
        "CB3DSOGNE4LJICMUOZAUHD32I4EAGKYJA6DCSE6QYCYV5TBDHZYGU6DC",  // contract ID
        "CB7562EGV5GN7LQTTL3SGZX7QV4TWETXKSPWJPHT4ERM544J3AM62I6B",  // caller address
        6000000,  // amount0
        6000000,  // amount1
        0,  // amount0_min
        0,  // amount1_min
        99999999999,  // deadline_ledger
        "CCKGGR3WQT3DJX7AW5YZLYBW5TP2HK6WSRLI4TFXVLSOALW4EBWWZ6Z4",  // router_address
        signerSecretsHex,
        feepayerSecret,
        1523352,  // signature expiration ledger
        "Test SDF Network ; September 2015",
        "https://soroban-testnet.stellar.org"
    );
}

async function main() {


    console.log("Setting up configuration...");

    const feepayerSecret = process.env.FEEPAYER_SECRET ?? '';
    const ed25519SecretKeyHex = process.env.ED25519_SECRET_KEY ?? '';

    const ASSET_ADDRESS = 'CDXQBYTJQXYARWT3GJ7RMNENAFVGYFYEFXEC5DQ6K4UK2UTDI4DMW7R2';
    const MINT_TO = 'GBDLTYLVIFS44CA2OX6RFGYESHY5U25BM2YSU6XAQLLDKJ65CBIVZHRL';
    const MINT_AMOUNT = 123;
    const SIGNATURE_EXPIRATION_LEDGER = 1509275;
    const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
    const RPC_URL = 'https://soroban-testnet.stellar.org';


    if (!feepayerSecret) {
        throw new Error('FEEPAYER_SECRET environment variable is required');
    }
    if (!ed25519SecretKeyHex) {
        throw new Error('ED25519_SECRET_KEY environment variable is required (32-byte ed25519 seed, 64 hex characters)');
    }

    console.log("Configuration:");
    console.log("  Asset Address:", ASSET_ADDRESS);
    console.log("  Mint To:", MINT_TO);
    console.log("  Mint Amount:", MINT_AMOUNT);
    console.log("  RPC URL:", RPC_URL);

    console.log("\nCreating RPC server...");
    const server = new StellarSdk.rpc.Server(RPC_URL, {
        allowHttp: RPC_URL.startsWith("http://"),
    });
    console.log("RPC server created");

    console.log("\nCreating keypairs...");
    const feepayerKeypair = StellarSdk.Keypair.fromSecret(feepayerSecret);
    const ed25519Keypair = StellarSdk.Keypair.fromRawEd25519Seed(
        Buffer.from(ed25519SecretKeyHex, "hex")
    );
    console.log("  Feepayer public key:", feepayerKeypair.publicKey());
    console.log("  Ed25519 public key:", Buffer.from(ed25519Keypair.rawPublicKey()).toString('hex'));
    console.log("Keypairs created");

    console.log("\nFetching feepayer account...");
    const feepayerAccount = await server.getAccount(feepayerKeypair.publicKey());
    console.log("  Account sequence:", feepayerAccount.sequenceNumber());
    console.log("Feepayer account fetched");

    console.log("\nBuilding contract operation...");
    const contract = new StellarSdk.Contract(ASSET_ADDRESS);
    const operation = contract.call(
        "mint",
        StellarSdk.nativeToScVal(MINT_TO, { type: "address" }),
        StellarSdk.nativeToScVal(MINT_AMOUNT, { type: "i128" })
    );
    console.log("  Contract ID:", ASSET_ADDRESS);
    console.log("  Method: mint");
    console.log("  To:", MINT_TO);
    console.log("  Amount:", MINT_AMOUNT);
    console.log("Contract operation built");

    console.log("\nBuilding transaction...");
    const transaction = new StellarSdk.TransactionBuilder(feepayerAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
    })
        .addOperation(operation)
        .setTimeout(StellarSdk.TimeoutInfinite)
        .build();

    console.log("  Transaction XDR length:", transaction.toXDR().length);
    console.log("Transaction built");

    console.log("\nSimulating transaction to get auth entries...");
    const simulateResponse = await server.simulateTransaction(transaction);

    if (StellarSdk.rpc.Api.isSimulationError(simulateResponse)) {
        throw new Error(`Simulation failed: ${JSON.stringify(simulateResponse)}`);
    }

    if (!simulateResponse.result) {
        throw new Error("Simulation result is missing");
    }

    console.log("  Simulation successful");
    console.log("  Auth entries:", simulateResponse.result.auth?.length || 0);
    console.log("Simulation complete");


    console.log("\nPreparing transaction (adding footprint)...");
    const preparedTransaction = await server.prepareTransaction(
        transaction,
    );

    if (!preparedTransaction) {
        throw new Error("Failed to prepare transaction");
    }

    console.log("  Prepared transaction XDR length:", preparedTransaction.toXDR().length);
    console.log("Transaction prepared");

    console.log("\nSigning auth entries with ed25519...");
    const networkId = StellarSdk.hash(Buffer.from(NETWORK_PASSPHRASE));
    console.log("  Network ID:", Buffer.from(networkId).toString('hex'));

    const txe = preparedTransaction.toEnvelope().v1();

    const operations = txe.tx().operations();
    let authCount = 0;

    for (const op of operations) {
        if (op.body().switch() === StellarSdk.xdr.OperationType.invokeHostFunction()) {
            const invokeOp = op.body().invokeHostFunctionOp();
            const auths = invokeOp.auth();

            console.log(`  Found ${auths.length} auth entries in operation`);

            for (const auth of auths) {
                const creds = auth.credentials();

                if (creds.switch() === StellarSdk.xdr.SorobanCredentialsType.sorobanCredentialsAddress()) {
                    authCount++;
                    const addressCreds = creds.address();
                    const invocation = auth.rootInvocation();

                    console.log(`  Signing auth entry ${authCount}:`);
                    console.log("    Nonce:", addressCreds.nonce().toString());
                    console.log("    Signature expiration ledger:", SIGNATURE_EXPIRATION_LEDGER);

                    const payload = StellarSdk.xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
                        new StellarSdk.xdr.HashIdPreimageSorobanAuthorization({
                            networkId: networkId,
                            nonce: addressCreds.nonce(),
                            signatureExpirationLedger: SIGNATURE_EXPIRATION_LEDGER,
                            invocation: invocation,
                        })
                    );

                    // the signature covers the hash of the preimage XDR, not the XDR itself
                    const payloadXdr = payload.toXDR();
                    const payloadHash = StellarSdk.hash(payloadXdr);
                    console.log("    Payload XDR length:", payloadXdr.length);
                    console.log("    Payload hash:", Buffer.from(payloadHash).toString('hex'));

                    const signature = ed25519Keypair.sign(payloadHash);
                    console.log("    Signature length:", signature.length);
                    console.log("    Signature (hex):", Buffer.from(signature).toString('hex'));
                    console.log("    Public key (hex):", Buffer.from(ed25519Keypair.rawPublicKey()).toString('hex'));

                    addressCreds.signatureExpirationLedger(SIGNATURE_EXPIRATION_LEDGER);

                    const signatureMap = StellarSdk.xdr.ScVal.scvMap([
                        new StellarSdk.xdr.ScMapEntry({
                            key: StellarSdk.xdr.ScVal.scvSymbol("public_key"),
                            val: StellarSdk.xdr.ScVal.scvBytes(ed25519Keypair.rawPublicKey()),
                        }),
                        new StellarSdk.xdr.ScMapEntry({
                            key: StellarSdk.xdr.ScVal.scvSymbol("signature"),
                            val: StellarSdk.xdr.ScVal.scvBytes(signature),
                        }),
                    ]);

                    addressCreds.signature(signatureMap);
                    console.log("    Auth entry signed");

                    const updatedCreds = addressCreds;
                    console.log("    Signature expiration ledger set:", updatedCreds.signatureExpirationLedger());
                }
            }
        }
    }

    console.log(`Signed ${authCount} auth entries`);

    // the signatures were written into txe, so the transaction is rebuilt from it
    console.log("\nRebuilding transaction with signed auth...");

    const modifiedEnvelope = StellarSdk.xdr.TransactionEnvelope.envelopeTypeTx(txe);
    const signedAuthTx = StellarSdk.TransactionBuilder.fromXDR(
        modifiedEnvelope.toXDR("base64"),
        NETWORK_PASSPHRASE
    );

    console.log("\nSimulating transaction with signed auth...");
    const simulateResponse2 = await server.simulateTransaction(signedAuthTx);

    if (StellarSdk.rpc.Api.isSimulationError(simulateResponse2)) {
        throw new Error(`Second simulation failed: ${JSON.stringify(simulateResponse2)}`);
    }


    console.log("  Second simulation successful");
    console.log("Second simulation complete");

    console.log("\nPreparing transaction again...");
    const preparedTx2 = await server.prepareTransaction(
        signedAuthTx,
    );

    if (!preparedTx2) {
        throw new Error("Failed to prepare transaction after auth signing");
    }
    console.log("Transaction prepared again");

    console.log("\nSigning transaction with feepayer...");
    preparedTx2.sign(feepayerKeypair);
    console.log("Transaction signed with feepayer");

    console.log("\nSending transaction...");
    const sendResponse = await server.sendTransaction(preparedTx2);

    console.log("  Send status:", sendResponse.status);
    console.log("  Transaction hash:", sendResponse.hash);


    const getResponse = await server.getTransaction(sendResponse.hash);
    console.log("  Final status:", getResponse.status);
    console.log("Transaction confirmed!");
    return getResponse;



}

example().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});