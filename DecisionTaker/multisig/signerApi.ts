import 'dotenv/config';
import express from 'express';
import { Keypair } from '@stellar/stellar-sdk';

const PORT = Number(process.env.SIGNER_API_PORT || 4001);

const signerSecretHex = process.env.SIGNER_SECRET_HEX;

if (!signerSecretHex) {
  throw new Error(
    'SIGNER_SECRET_HEX environment variable is required (32-byte ed25519 seed in hex format)'
  );
}

if (!/^[0-9a-fA-F]{64}$/.test(signerSecretHex)) {
  throw new Error(
    'SIGNER_SECRET_HEX must be a 64-character hex string representing the 32-byte ed25519 seed'
  );
}

const signerKeypair = Keypair.fromRawEd25519Seed(Buffer.from(signerSecretHex, 'hex'));
const signerPublicKeyHex = Buffer.from(signerKeypair.rawPublicKey()).toString('hex');

const app = express();
app.use(express.json());

type SignRequestBody = {
  payloadHash: string;
  index?: number;
};

app.post('/sign', (req, res) => {
  const { payloadHash, index }: SignRequestBody = req.body ?? {};

  if (!payloadHash || typeof payloadHash !== 'string') {
    return res.status(400).json({ error: 'payloadHash is required (hex string)' });
  }

  if (!/^[0-9a-fA-F]{64}$/.test(payloadHash)) {
    return res
      .status(400)
      .json({ error: 'payloadHash must be a 64-character hex string representing the hash' });
  }

  const payloadHashBuffer = Buffer.from(payloadHash, 'hex');
  const signature = signerKeypair.sign(payloadHashBuffer);
  const signatureHex = Buffer.from(signature).toString('hex');

  console.log("");
  console.log("New signature request");
  
  console.log('signatureHex =>', signatureHex);

  console.log('Waiting for next signature');
  console.log("");
  
  return res.json({
    index,
    publicKey: signerPublicKeyHex,
    signature: signatureHex,
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', publicKey: signerPublicKeyHex });
});

app.listen(PORT, () => {
  console.log(`Multisig signer API listening on http://0.0.0.0:${PORT}`);
  console.log(`Signer public key (hex): ${signerPublicKeyHex}`);

  console.log('Ready to sign ');
});


