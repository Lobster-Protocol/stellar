import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Keypair } from '@stellar/stellar-sdk';
import { analyzePoolWithMultisig } from '../services/analysis/poolAnalyzerMultisig.js';
import { TokenClient } from '../../bindings/tokenClient.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ message: 'DecisionTaker API is running' });
});

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/run/all', async (req, res) => {
  try {
    const results = await analyzePoolWithMultisig({ type: 'all' });
    res.json({
      success: true,
      count: results.length,
      results
    });
  } catch (error: any) {
    console.error('Error running analysis on all pools:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

app.get('/api/run/user/:userAddress', async (req, res) => {
  try {
    const { userAddress } = req.params;
    if (!userAddress) {
      return res.status(400).json({
        success: false,
        error: 'User address is required'
      });
    }
    const results = await analyzePoolWithMultisig({ type: 'user', userAddress });
    res.json({
      success: true,
      userAddress,
      count: results.length,
      results
    });
  } catch (error: any) {
    console.error('Error running analysis on user pools:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

app.get('/api/run/pool/:poolId', async (req, res) => {
  try {
    const poolId = parseInt(req.params.poolId);
    if (isNaN(poolId) || poolId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid pool ID is required'
      });
    }
    const results = await analyzePoolWithMultisig({ type: 'poolId', poolId });
    res.json({
      success: true,
      poolId,
      result: results || null
    });
  } catch (error: any) {
    console.error('Error running analysis on pool:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

app.get('/api/feepayer/xlm-balance', async (req, res) => {
  try {
    const feepayerSecret = process.env.FEEPAYER_SECRET ?? process.env.SECRET ?? '';
    
    if (!feepayerSecret) {
      return res.status(400).json({
        success: false,
        error: 'FEEPAYER_SECRET or SECRET environment variable is required'
      });
    }

    const feepayerKeypair = Keypair.fromSecret(feepayerSecret);
    const feepayerAddress = feepayerKeypair.publicKey();

    const rpcUrl = process.env.RPC_URL ?? 'https://soroban-testnet.stellar.org';
    const isTestnet = rpcUrl.includes('testnet') || rpcUrl.includes('futurenet');
    
    // native XLM asset contract on each network
    const XLM_TOKEN_ADDRESS = isTestnet 
      ? 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC' // testnet
      : 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA'; // mainnet

    const tokenClient = new TokenClient(feepayerSecret, XLM_TOKEN_ADDRESS, { rpcUrl });
    const balanceResult = await tokenClient.balance({ id: feepayerAddress });
    const decimalsResult = await tokenClient.decimals();
    
    // the balance comes back either as an i128 (lo/hi parts) or as a plain value
    let balance = '0';
    if (balanceResult) {
      if (balanceResult._value?._attributes?.lo?._value !== undefined) {
        balance = balanceResult._value._attributes.lo._value.toString();
      } else if (balanceResult._value !== undefined) {
        balance = balanceResult._value.toString();
      }
    }

    // XLM has 7 decimals
    const decimals = decimalsResult?._value ?? 7;
    const balanceNumber = BigInt(balance);
    const decimalsDivisor = BigInt(10) ** BigInt(decimals);
    const humanReadableBalance = Number(balanceNumber) / Number(decimalsDivisor);

    res.json({
      success: true,
      feepayerAddress,
      xlmTokenAddress: XLM_TOKEN_ADDRESS,
      balance,
      decimals,
      humanReadableBalance,
      network: isTestnet ? 'testnet' : 'mainnet'
    });
  } catch (error: any) {
    console.error('Error getting FEEPAYER XLM balance:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

const port = Number(process.env.PORT || 3334);
const host = process.env.HOST || '0.0.0.0';

app.listen(port, () => {
  console.log(`DecisionTaker API listening on http://${host}:${port}`);
});





