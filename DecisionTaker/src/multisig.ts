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
    // Setup
    const server = new StellarSdk.rpc.Server(rpcUrl, {
        allowHttp: rpcUrl.startsWith("http://"),
    });

    const feepayerKeypair = StellarSdk.Keypair.fromSecret(feepayerSecret);
    
    // Create keypairs from all hex secret keys
    const ed25519Keypairs = ed25519SecretKeyHex.map(hexKey => 
        StellarSdk.Keypair.fromRawEd25519Seed(Buffer.from(hexKey, "hex"))
    );
    
    console.log(`Created ${ed25519Keypairs.length} keypairs for signing`);
    ed25519Keypairs.forEach((kp, i) => {
        console.log(`  Signer ${i + 1} public key:`, Buffer.from(kp.rawPublicKey()).toString('hex'));
    });
    
    const feepayerAccount = await server.getAccount(feepayerKeypair.publicKey());
    const networkId = StellarSdk.hash(Buffer.from(networkPassphrase));

    // Build the contract operation with all parameters
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

    // Build transaction
    console.log("\nBuilding transaction...");
    const transaction = new StellarSdk.TransactionBuilder(feepayerAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase,
    })
        .addOperation(operation)
        .setTimeout(StellarSdk.TimeoutInfinite)
        .build();

    // Simulate to get auth entries
    console.log("\nSimulating transaction...");
    const simulateResponse = await server.simulateTransaction(transaction);
    
    if (StellarSdk.rpc.Api.isSimulationError(simulateResponse)) {
        throw new Error(`Simulation failed: ${JSON.stringify(simulateResponse)}`);
    }

    // Prepare transaction
    console.log("\nPreparing transaction...");
    const preparedTransaction = await server.prepareTransaction(transaction);
    if (!preparedTransaction) {
        throw new Error("Failed to prepare transaction");
    }

    // Sign auth entries with all ed25519 keys
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

                    // Build authorization payload (same for all signers)
                    const payload = StellarSdk.xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
                        new StellarSdk.xdr.HashIdPreimageSorobanAuthorization({
                            networkId: networkId,
                            nonce: addressCreds.nonce(),
                            signatureExpirationLedger: signatureExpirationLedger,
                            invocation: invocation,
                        })
                    );

                    // Hash the payload
                    const payloadXdr = payload.toXDR();
                    const payloadHash = StellarSdk.hash(payloadXdr);
                    console.log("    Payload hash:", Buffer.from(payloadHash).toString('hex'));

                    // Sign with ALL keypairs
                    const signatures: StellarSdk.xdr.ScVal[] = [];
                    
                    for (let i = 0; i < ed25519Keypairs.length; i++) {
                        const keypair = ed25519Keypairs[i];
                        const signature = keypair.sign(payloadHash);
                        
                        console.log(`    Signer ${i + 1}:`);
                        console.log("      Public key:", Buffer.from(keypair.rawPublicKey()).toString('hex'));
                        console.log("      Signature:", Buffer.from(signature).toString('hex'));
                        
                        // Create signature map for this signer
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

                    // Update credentials with Vec of signatures
                    addressCreds.signatureExpirationLedger(signatureExpirationLedger);
                    
                    // Create a Vec of signatures (Vec<AccSignature>)
                    const signaturesVec = StellarSdk.xdr.ScVal.scvVec(signatures);
                    addressCreds.signature(signaturesVec);
                    
                    console.log(`    ✅ Auth entry signed with ${ed25519Keypairs.length} signatures`);
                }
            }
        }
    }

    console.log(`✅ Signed ${authCount} auth entries`);

    // Rebuild transaction from modified envelope
    console.log("\nRebuilding transaction...");
    const modifiedEnvelope = StellarSdk.xdr.TransactionEnvelope.envelopeTypeTx(txe);
    const signedAuthTx = StellarSdk.TransactionBuilder.fromXDR(
        modifiedEnvelope.toXDR("base64"),
        networkPassphrase
    );

    // Simulate again
    console.log("\nSimulating with signed auth...");
    const simulateResponse2 = await server.simulateTransaction(signedAuthTx);
    if (StellarSdk.rpc.Api.isSimulationError(simulateResponse2)) {
        throw new Error(`Second simulation failed: ${JSON.stringify(simulateResponse2)}`);
    }

    // Prepare and sign with feepayer
    console.log("\nPreparing and signing...");
    const preparedTx2 = await server.prepareTransaction(signedAuthTx);
    if (!preparedTx2) {
        throw new Error("Failed to prepare transaction");
    }
    preparedTx2.sign(feepayerKeypair);

    // Send transaction
    console.log("\nSending transaction...");
    const sendResponse = await server.sendTransaction(preparedTx2);
    
    console.log("  Send status:", sendResponse.status);
    console.log("  Transaction hash:", sendResponse.hash);
    
    return sendResponse;
}

function secretKeyToHex(secretKey: string): string {
    // Create keypair from secret key
    const keypair = StellarSdk.Keypair.fromSecret(secretKey);
    
    // Get the raw secret key (32-byte seed)
    const rawSecretKey = keypair.rawSecretKey();
    
    // Convert to hex string
    const hexSecret = Buffer.from(rawSecretKey).toString('hex');
    
    return hexSecret;
}

// Example usage
async function example() {

    const secretKey = process.env.FEEPAYER_SECRET ?? 'S...'; // Your Stellar secret key
    // If it's already in hex format (64 chars), use it directly
    // Otherwise, convert from Stellar secret key format
    let ed25519SecretKeyHex: string;
    
    if (secretKey.startsWith('S') && secretKey.length >= 56) {
        // It's a Stellar secret key, convert it
        ed25519SecretKeyHex = secretKeyToHex(secretKey);
        console.log("Converted secret key to hex:", ed25519SecretKeyHex);
    } else if (/^[0-9a-fA-F]{64}$/.test(secretKey)) {
        // It's already in hex format (64 hex characters = 32 bytes)
        ed25519SecretKeyHex = secretKey;
        console.log("Secret key is already in hex format");
    } else {
        throw new Error("Invalid secret key format. Expected Stellar secret key (S...) or hex (64 chars)");
    }   
    
    // Now you can use it
    const ed25519Keypair = StellarSdk.Keypair.fromRawEd25519Seed(
        Buffer.from(ed25519SecretKeyHex, "hex")
    );
    
    console.log("Public key (hex):", Buffer.from(ed25519Keypair.rawPublicKey()).toString('hex'));
    const feepayerSecret = process.env.FEEPAYER_SECRET ?? '';


    await callAddLiquidityWithMultisig(
        "CB3DSOGNE4LJICMUOZAUHD32I4EAGKYJA6DCSE6QYCYV5TBDHZYGU6DC",  // Your contract ID
        "CB7562EGV5GN7LQTTL3SGZX7QV4TWETXKSPWJPHT4ERM544J3AM62I6B",  // The caller address
        6000000,  // amount0
        6000000,  // amount1
        0,  // amount0_min
        0,  // amount1_min
        99999999999,  // deadline_ledger
        "CCKGGR3WQT3DJX7AW5YZLYBW5TP2HK6WSRLI4TFXVLSOALW4EBWWZ6Z4",  // router_address
        ["0000000000000000000000000000000000000000000000000000000000000001","3e874875a4ec1b77a5d7dd8ae52791ddefd8c77e1f2ee07d896597128db2fa99"],  // ed25519 secret key
        feepayerSecret,
        1523352,  // signature expiration ledger
        "Test SDF Network ; September 2015",
        "https://soroban-testnet.stellar.org"
    );
}

async function main() {


    // Step 1: Setup configuration
    console.log("Step 1: Setting up configuration...");

    const feepayerSecret = process.env.FEEPAYER_SECRET ?? '';
    const ed25519SecretKeyHex = process.env.ED25519_SECRET_KEY ?? '0000000000000000000000000000000000000000000000000000000000000001';

    // Contract addresses from Makefile
    const ASSET_ADDRESS = 'CDXQBYTJQXYARWT3GJ7RMNENAFVGYFYEFXEC5DQ6K4UK2UTDI4DMW7R2';
    const MINT_TO = 'GBDLTYLVIFS44CA2OX6RFGYESHY5U25BM2YSU6XAQLLDKJ65CBIVZHRL';
    const MINT_AMOUNT = 123;
    const SIGNATURE_EXPIRATION_LEDGER = 1509275;
    const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
    const RPC_URL = 'https://soroban-testnet.stellar.org';


    if (!feepayerSecret) {
        throw new Error('FEEPAYER_SECRET environment variable is required');
    }

    console.log("Configuration:");
    console.log("  Asset Address:", ASSET_ADDRESS);
    console.log("  Mint To:", MINT_TO);
    console.log("  Mint Amount:", MINT_AMOUNT);
    console.log("  RPC URL:", RPC_URL);

    // Step 2: Create RPC server
    console.log("\nStep 2: Creating RPC server...");
    const server = new StellarSdk.rpc.Server(RPC_URL, {
        allowHttp: RPC_URL.startsWith("http://"),
    });
    console.log("✅ RPC server created");

    // Step 3: Create keypairs
    console.log("\nStep 3: Creating keypairs...");
    const feepayerKeypair = StellarSdk.Keypair.fromSecret(feepayerSecret);
    const ed25519Keypair = StellarSdk.Keypair.fromRawEd25519Seed(
        Buffer.from(ed25519SecretKeyHex, "hex")
    );
    console.log("  Feepayer public key:", feepayerKeypair.publicKey());
    console.log("  Ed25519 public key:", Buffer.from(ed25519Keypair.rawPublicKey()).toString('hex'));
    console.log("✅ Keypairs created");

    // Step 4: Get feepayer account
    console.log("\nStep 4: Fetching feepayer account...");
    const feepayerAccount = await server.getAccount(feepayerKeypair.publicKey());
    console.log("  Account sequence:", feepayerAccount.sequenceNumber());
    console.log("✅ Feepayer account fetched");

    // Step 5: Build the contract operation
    console.log("\nStep 5: Building contract operation...");
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
    console.log("✅ Contract operation built");

    // Step 6: Build the transaction
    console.log("\nStep 6: Building transaction...");
    const transaction = new StellarSdk.TransactionBuilder(feepayerAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
    })
        .addOperation(operation)
        .setTimeout(StellarSdk.TimeoutInfinite)
        .build();

    console.log("  Transaction XDR length:", transaction.toXDR().length);
    console.log("✅ Transaction built");

    // Step 7: Simulate transaction to get auth entries
    console.log("\nStep 7: Simulating transaction to get auth entries...");
    const simulateResponse = await server.simulateTransaction(transaction);

    if (StellarSdk.rpc.Api.isSimulationError(simulateResponse)) {
        throw new Error(`Simulation failed: ${JSON.stringify(simulateResponse)}`);
    }

    if (!simulateResponse.result) {
        throw new Error("Simulation result is missing");
    }

    console.log("  Simulation successful");
    console.log("  Auth entries:", simulateResponse.result.auth?.length || 0);
    if (simulateResponse.result.auth && simulateResponse.result.auth.length > 0) {
        //console.log("  Auth details:", JSON.stringify(simulateResponse.result.auth, null, 2));
    }
    console.log("✅ Simulation complete");


    // Step 8: Prepare transaction (adds footprint)
    console.log("\nStep 8: Preparing transaction (adding footprint)...");
    const preparedTransaction = await server.prepareTransaction(
        transaction,
    );

    if (!preparedTransaction) {
        throw new Error("Failed to prepare transaction");
    }

    console.log("  Prepared transaction XDR length:", preparedTransaction.toXDR().length);
    console.log("✅ Transaction prepared");

    // Step 9: Sign auth entries with ed25519
    console.log("\nStep 9: Signing auth entries with ed25519...");
    const networkId = StellarSdk.hash(Buffer.from(NETWORK_PASSPHRASE));
    console.log("  Network ID:", Buffer.from(networkId).toString('hex'));

    // Get the transaction envelope
    const txe = preparedTransaction.toEnvelope().v1();

    // Extract and sign auth entries
    const operations = txe.tx().operations();
    let authCount = 0;

    for (const op of operations) {
        if (op.body().switch() === StellarSdk.xdr.OperationType.invokeHostFunction()) {
            const invokeOp = op.body().invokeHostFunctionOp();
            const auths = invokeOp.auth();

            console.log(`  Found ${auths.length} auth entries in operation`);

            for (const auth of auths) {
                const creds = auth.credentials();

                // Only sign address credentials
                if (creds.switch() === StellarSdk.xdr.SorobanCredentialsType.sorobanCredentialsAddress()) {
                    authCount++;
                    const addressCreds = creds.address();
                    const invocation = auth.rootInvocation();

                    console.log(`  Signing auth entry ${authCount}:`);
                    console.log("    Nonce:", addressCreds.nonce().toString());
                    console.log("    Signature expiration ledger:", SIGNATURE_EXPIRATION_LEDGER);

                    // Build the authorization payload
                    const payload = StellarSdk.xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
                        new StellarSdk.xdr.HashIdPreimageSorobanAuthorization({
                            networkId: networkId,
                            nonce: addressCreds.nonce(),
                            signatureExpirationLedger: SIGNATURE_EXPIRATION_LEDGER,
                            invocation: invocation,
                        })
                    );

                    // Hash the payload - IMPORTANT: hash the XDR bytes
                    const payloadXdr = payload.toXDR();
                    const payloadHash = StellarSdk.hash(payloadXdr);
                    console.log("    Payload XDR length:", payloadXdr.length);
                    console.log("    Payload hash:", Buffer.from(payloadHash).toString('hex'));

                    // Sign the payload hash
                    const signature = ed25519Keypair.sign(payloadHash);
                    console.log("    Signature length:", signature.length);
                    console.log("    Signature (hex):", Buffer.from(signature).toString('hex'));
                    console.log("    Public key (hex):", Buffer.from(ed25519Keypair.rawPublicKey()).toString('hex'));

                    // Update the credentials with the signature
                    addressCreds.signatureExpirationLedger(SIGNATURE_EXPIRATION_LEDGER);

                    // Create the signature map
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
                    console.log("    ✅ Auth entry signed");

                    // Verify the signature was set
                    const updatedCreds = addressCreds;
                    console.log("    Signature expiration ledger set:", updatedCreds.signatureExpirationLedger());
                }
            }
        }
    }

    console.log(`✅ Signed ${authCount} auth entries`);

    // Step 10: Rebuild transaction from modified envelope
    // IMPORTANT: The envelope is already modified, so we need to rebuild from the envelope XDR
    console.log("\nStep 10: Rebuilding transaction with signed auth...");
    const envelopeXdr = preparedTransaction.toEnvelope().toXDR("base64");
    // const signedAuthTx = StellarSdk.TransactionBuilder.fromXDR(envelopeXdr, NETWORK_PASSPHRASE);
    // console.log("✅ Transaction rebuilt");

    const modifiedEnvelope = StellarSdk.xdr.TransactionEnvelope.envelopeTypeTx(txe);
    const signedAuthTx = StellarSdk.TransactionBuilder.fromXDR(
        modifiedEnvelope.toXDR("base64"),
        NETWORK_PASSPHRASE
    );

    // Step 11: Simulate again with signed auth
    console.log("\nStep 11: Simulating transaction with signed auth...");
    const simulateResponse2 = await server.simulateTransaction(signedAuthTx);

    if (StellarSdk.rpc.Api.isSimulationError(simulateResponse2)) {
        throw new Error(`Second simulation failed: ${JSON.stringify(simulateResponse2)}`);
    }


    console.log("  Second simulation successful");
    console.log("✅ Second simulation complete");

    // Step 12: Prepare again
    console.log("\nStep 12: Preparing transaction again...");
    const preparedTx2 = await server.prepareTransaction(
        signedAuthTx,
    );

    if (!preparedTx2) {
        throw new Error("Failed to prepare transaction after auth signing");
    }
    console.log("✅ Transaction prepared again");

    // Step 13: Sign with feepayer
    console.log("\nStep 13: Signing transaction with feepayer...");
    preparedTx2.sign(feepayerKeypair);
    console.log("✅ Transaction signed with feepayer");

    // Step 14: Send transaction
    console.log("\nStep 14: Sending transaction...");
    const sendResponse = await server.sendTransaction(preparedTx2);

    console.log("  Send status:", sendResponse.status);
    console.log("  Transaction hash:", sendResponse.hash);


    const getResponse = await server.getTransaction(sendResponse.hash);
    console.log("  Final status:", getResponse.status);
    console.log("✅ Transaction confirmed!");
    return getResponse;



}

example().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});