import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { analyzePool } from './poolAnalyzer';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ message: 'DecisionTaker API is running' });
});

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Run analysis on all pools
app.get('/api/run/all', async (req, res) => {
  try {
    const results = await analyzePool({ type: 'all' });
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

// Run analysis on a specific user's pools
app.get('/api/run/user/:userAddress', async (req, res) => {
  try {
    const { userAddress } = req.params;
    if (!userAddress) {
      return res.status(400).json({
        success: false,
        error: 'User address is required'
      });
    }
    const results = await analyzePool({ type: 'user', userAddress });
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

// Run analysis on a specific pool by ID
app.get('/api/run/pool/:poolId', async (req, res) => {
  try {
    const poolId = parseInt(req.params.poolId);
    if (isNaN(poolId) || poolId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid pool ID is required'
      });
    }
    const results = await analyzePool({ type: 'poolId', poolId });
    res.json({
      success: true,
      poolId,
      result: results[0] || null
    });
  } catch (error: any) {
    console.error('Error running analysis on pool:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

app.listen(port, host, () => {
  console.log(`DecisionTaker API listening on http://${host}:${port}`);
});





