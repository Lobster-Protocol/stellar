"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
var express_1 = require("express");
var stellar_sdk_1 = require("@stellar/stellar-sdk");
var PORT = Number(process.env.SIGNER_API_PORT || 4001);
var signerSecretHex = process.env.SIGNER_SECRET_HEX;
if (!signerSecretHex) {
    throw new Error('SIGNER_SECRET_HEX environment variable is required (32-byte ed25519 seed in hex format)');
}
if (!/^[0-9a-fA-F]{64}$/.test(signerSecretHex)) {
    throw new Error('SIGNER_SECRET_HEX must be a 64-character hex string representing the 32-byte ed25519 seed');
}
var signerKeypair = stellar_sdk_1.Keypair.fromRawEd25519Seed(Buffer.from(signerSecretHex, 'hex'));
var signerPublicKeyHex = Buffer.from(signerKeypair.rawPublicKey()).toString('hex');
var app = (0, express_1.default)();
app.use(express_1.default.json());
app.post('/sign', function (req, res) {
    var _a;
    var _b = (_a = req.body) !== null && _a !== void 0 ? _a : {}, payloadHash = _b.payloadHash, index = _b.index;
    if (!payloadHash || typeof payloadHash !== 'string') {
        return res.status(400).json({ error: 'payloadHash is required (hex string)' });
    }
    if (!/^[0-9a-fA-F]{64}$/.test(payloadHash)) {
        return res
            .status(400)
            .json({ error: 'payloadHash must be a 64-character hex string representing the hash' });
    }
    var payloadHashBuffer = Buffer.from(payloadHash, 'hex');
    var signature = signerKeypair.sign(payloadHashBuffer);
    var signatureHex = Buffer.from(signature).toString('hex');
    return res.json({
        index: index,
        publicKey: signerPublicKeyHex,
        signature: signatureHex,
    });
});
app.get('/health', function (_req, res) {
    res.json({ status: 'ok', publicKey: signerPublicKeyHex });
});
app.listen(PORT, function () {
    console.log("Multisig signer API listening on http://0.0.0.0:".concat(PORT));
    console.log("Signer public key (hex): ".concat(signerPublicKeyHex));
});
