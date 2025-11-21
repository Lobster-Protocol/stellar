import express from 'express';
import { gzipSync, gunzipSync } from 'zlib';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

import { queryPoolData, processPoolData } from './process/querySwaps';
import { querySubquery } from './utils/graphql';
import {
  QUERY_NEW_PAIR_EVENT_ENTITIES,
  QUERY_NEW_PAIR_PHOENIX_ENTITIES,
  QUERY_NEW_PAIR_AQUARIUS_ENTITIES,
} from './types/queries';

// Pool repertory imports
const NETWORK = process.env.NETWORK || 'testnet';
const isTestnet = NETWORK === 'testnet';

let soroswapPools: any[] = [];
let phoenixPools: any[] = [];
let aquariusPools: any[] = [];

try {
  if (isTestnet) {
    soroswapPools = require('./pool_repertory/soroswap_pools_testnet').soroswapPools;
    phoenixPools = require('./pool_repertory/phoenix_pools_testnet').phoenixPools;
    aquariusPools = require('./pool_repertory/aquarius_pools_testnet').aquariusPools;
  } else {
    soroswapPools = require('./pool_repertory/soroswap_pools').soroswapPools;
    phoenixPools = require('./pool_repertory/phoenix_pools').phoenixPools;
    aquariusPools = require('./pool_repertory/aquarius_pools').aquariusPools;
  }
} catch (err) {
  console.warn('Could not load pool repertory files:', err);
}

const app = express();
app.use(express.json({ limit: '10mb' }));

// Global safety nets: don't crash the process on unexpected errors
process.on('uncaughtException', (err) => {
  console.error('uncaughtException', err);
});
process.on('unhandledRejection', (reason: any) => {
  console.error('unhandledRejection', reason);
});

const s3 = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT || 'http://127.0.0.1:9000',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || 'lobster',
    secretAccessKey: process.env.S3_SECRET_KEY || 'lobster-secret-123'
  }
});

const BUCKET = process.env.S3_BUCKET || 'lobster';

// POST /process { token0, token1, protocol }
// Runs processing in background; returns 202 immediately
app.post('/process', (req: any, res: any) => {
  const { token0, token1, protocol } = req.body || {};
  if (!token0 || !token1 || !protocol) return res.status(400).json({ error: 'token0, token1 and protocol required' });

  const proto = String(protocol).toLowerCase();
  if (proto !== 'soroswap' && proto !== 'phoenix' && proto !== 'aquarius') {
    return res.status(400).json({ error: 'protocol must be one of: soroswap, phoenix, aquarius' });}

  (async () => {
    console.log('Starting background processing', { token0, token1, protocol: proto });
    try {
      const metrics = await processPoolData(token0, token1, protocol);
      const lists = metrics?.lists || {};
      const last: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(lists)) {
        if (Array.isArray(v)) last[k] = v[v.length - 1];
        else last[k] = v; // for scalars like turnoverFactor
      }
      res.json({
        calculatedAt: metrics.calculatedAt,
        token0Address: metrics.token0Address,
        token1Address: metrics.token1Address,
        pooladdress: metrics.pooladdress,
        last
      });
      console.log('Background processing finished', { token0, token1, protocol: proto });
    } catch (err: any) {
      console.error('Background processing failed', { token0, token1, protocol: proto, err });
    }
  })();
  res.status(202).json({ accepted: true });
});

// POST /process/sync { token0, token1, protocol }
// Runs processing synchronously; helpful for debugging API vs script behavior
// app.post('/process/sync', async (req: any, res: any) => {
//   try {
//     const { token0, token1, protocol } = req.body || {};
//     if (!token0 || !token1 || !protocol) return res.status(400).json({ error: 'token0, token1 and protocol required' });
//     const proto = String(protocol).toLowerCase();
//     const runner =
//       proto === 'soroswap' ? processSoroswap :
//       proto === 'phoenix' ? processPhoenix :
//       proto === 'aquarius' ? processAquarius : null;
//     if (!runner) return res.status(400).json({ error: 'protocol must be one of: soroswap, phoenix, aquarius' });
//     await runner(token0, token1);
//     res.json({ ok: true });
//   } catch (err: any) {
//     console.error('process/sync failed', err);
//     res.status(500).json({ error: err?.message || 'processing failed' });
//   }
// });

async function getLatestMetrics(token0: string, token1: string, protocol: string) {
  const key = `${protocol}/${token0}_${token1}.latest.json.gz`;
  const obj: any = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    (obj.Body as NodeJS.ReadableStream)
      .on('data', (c: Buffer) => chunks.push(c))
      .on('end', () => resolve())
      .on('error', reject);
  });
  const gz = Buffer.concat(chunks);
  const json = gunzipSync(gz).toString('utf8');
  return JSON.parse(json);
}

// GET /data?token0=..&token1=..
app.get('/data', async (req: any, res: any) => {
  try {
    const token0 = req.query.token0?.toString();
    const token1 = req.query.token1?.toString();
    const protocol = req.query.protocol?.toString();
    if (!token0 || !token1 || !protocol) return res.status(400).json({ error: 'token0, token1 and protocol required' });
    const metrics = await getLatestMetrics(token0, token1, protocol);
    res.json(metrics);
  } catch (err: any) {
    console.error('get data error', err);
    res.status(500).json({ error: err?.message || 'fetch failed' });
  }
});

// GET /data/last?token0=..&token1=..
app.get('/data/last', async (req: any, res: any) => {
  try {
    const token0 = req.query.token0?.toString();
    const token1 = req.query.token1?.toString();
    const protocol = req.query.protocol?.toString();
    if (!token0 || !token1 || !protocol) return res.status(400).json({ error: 'token0, token1 and protocol required' });
    const metrics = await getLatestMetrics(token0, token1, protocol);
    const lists = metrics?.lists || {};
    const last: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(lists)) {
      if (Array.isArray(v)) last[k] = v[v.length - 1];
      else last[k] = v; // for scalars like turnoverFactor
    }
    res.json({
      calculatedAt: metrics.calculatedAt,
      token0Address: metrics.token0Address,
      token1Address: metrics.token1Address,
      pooladdress: metrics.pooladdress,
      last
    });
  } catch (err: any) {
    console.error('get last error', err);
    res.status(500).json({ error: err?.message || 'fetch failed' });
  }
});

// Helper function to fetch pairs from SubQuery
async function fetchPairsFromQuery(query: string, rootKey: string): Promise<Array<{ token0: string; token1: string }>> {
  const BATCH_SIZE = 1000;
  let offset = 0;
  const pairs: Array<{ token0: string; token1: string }> = [];
  const seen = new Set<string>();
  let hasMore = true;

  while (hasMore) {
    try {
      const data: any = await querySubquery(query, {
        first: BATCH_SIZE,
        offset,
      });

      const nodes: any[] = data?.[rootKey]?.nodes || [];
      for (const n of nodes) {
        const t0 = n.token_0 || n.token0;
        const t1 = n.token_1 || n.token1;
        if (!t0 || !t1) continue;
        const key = `${t0}_${t1}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ token0: t0, token1: t1 });
      }

      hasMore = nodes.length === BATCH_SIZE;
      offset += BATCH_SIZE;
    } catch (err) {
      console.error(`Error fetching pairs from ${rootKey}:`, err);
      hasMore = false;
    }
  }

  return pairs;
}

// POST /processAll
// Options:
//   - source: "query" (default) - Query all pairs from SubQuery
//   - source: "repertory" - Use pool_repertory files
//   - concurrency: number (default: 3) - Number of concurrent processing jobs
app.post('/processAll', async (req: any, res: any) => {
  const source = (req.body?.source || req.query?.source || 'query').toLowerCase();
  const concurrency = Number(req.body?.concurrency || req.query?.concurrency || 3);
  
  if (source !== 'query' && source !== 'repertory') {
    return res.status(400).json({ error: 'source must be "query" or "repertory"' });
  }

  // Return immediately and process in background
  res.status(202).json({ 
    accepted: true, 
    source,
    message: 'Processing all pools in background'
  });

  (async () => {
    try {
      console.log(`[processAll] Starting processing with source: ${source}`);
      let allPairs: Array<{ token0: string; token1: string; protocol: string }> = [];

      if (source === 'query') {
        // Option 1: Query from SubQuery
        console.log('[processAll] Fetching pairs from SubQuery...');
        const [soroswapPairs, phoenixPairs, aquariusPairs] = await Promise.all([
          fetchPairsFromQuery(QUERY_NEW_PAIR_EVENT_ENTITIES, 'newPairEventEntities')
            .catch(e => { console.error('[processAll] Soroswap fetch error', e); return []; }),
          fetchPairsFromQuery(QUERY_NEW_PAIR_PHOENIX_ENTITIES, 'newPairPhoenixEntities')
            .catch(e => { console.error('[processAll] Phoenix fetch error', e); return []; }),
          fetchPairsFromQuery(QUERY_NEW_PAIR_AQUARIUS_ENTITIES, 'newPairAquariusEntities')
            .catch(e => { console.error('[processAll] Aquarius fetch error', e); return []; }),
        ]);

        allPairs = [
          ...soroswapPairs.map(p => ({ ...p, protocol: 'soroswap' })),
          ...phoenixPairs.map(p => ({ ...p, protocol: 'phoenix' })),
          ...aquariusPairs.map(p => ({ ...p, protocol: 'aquarius' })),
        ];

        console.log(`[processAll] Fetched ${soroswapPairs.length} Soroswap, ${phoenixPairs.length} Phoenix, ${aquariusPairs.length} Aquarius pairs`);
      } else {
        // Option 2: Use pool_repertory files
        console.log('[processAll] Loading pairs from pool_repertory...');
        allPairs = [
          ...soroswapPools.map(p => ({ token0: p.token_a, token1: p.token_b, protocol: 'soroswap' })),
          ...phoenixPools.map(p => ({ token0: p.token_a, token1: p.token_b, protocol: 'phoenix' })),
          ...aquariusPools.map(p => ({ token0: p.token_a, token1: p.token_b, protocol: 'aquarius' })),
        ];
        console.log(`[processAll] Loaded ${soroswapPools.length} Soroswap, ${phoenixPools.length} Phoenix, ${aquariusPools.length} Aquarius pairs from repertory`);
      }

      console.log(`[processAll] Total pairs to process: ${allPairs.length}`);
      console.log(`[processAll] Processing with concurrency: ${concurrency}`);

      // Process pairs in batches with concurrency limit
      const results = {
        success: 0,
        failed: 0,
        errors: [] as Array<{ token0: string; token1: string; protocol: string; error: string }>,
      };

      let connectionErrorDetected = false;

      for (let i = 0; i < allPairs.length; i += concurrency) {
        // Stop processing if we detect a connection error
        if (connectionErrorDetected) {
          console.log(`[processAll] Stopping processing - SubQuery connection issue detected`);
          break;
        }
        const batch = allPairs.slice(i, i + concurrency);
        const batchResults = await Promise.allSettled(
          batch.map(({ token0, token1, protocol }) =>
            processPoolData(token0, token1, protocol)
              .then(() => {
                results.success++;
                console.log(`[processAll] ✓ Processed ${token0.substring(0, 8)}.../${token1.substring(0, 8)}... (${protocol})`);
              })
              .catch((err: any) => {
                const errorMsg = err?.message || String(err);
                
                // Check if it's a "no data" error - handle gracefully
                if (errorMsg.includes('No swap events found')) {
                  // Don't count as failed, just skip silently with a brief message
                  console.log(`[processAll] ⊘ Skipped ${token0.substring(0, 8)}.../${token1.substring(0, 8)}... (${protocol}): No data available`);
                } else if (errorMsg.includes('SubQuery connection failed') || errorMsg.includes('Cannot connect to SubQuery')) {
                  // Connection error - log once and mark to stop processing
                  if (!connectionErrorDetected) {
                    console.error(`[processAll] ✗ Connection error: ${errorMsg}`);
                    console.error(`[processAll] SubQuery endpoint is not reachable. Please check your SUBQUERY_URL setting.`);
                    connectionErrorDetected = true;
                  }
                  results.failed++;
                  results.errors.push({ token0, token1, protocol, error: 'SubQuery connection failed' });
                } else {
                  // Real error - count as failed
                  results.failed++;
                  results.errors.push({ token0, token1, protocol, error: errorMsg });
                  console.error(`[processAll] ✗ Failed ${token0.substring(0, 8)}.../${token1.substring(0, 8)}... (${protocol}):`, errorMsg);
                }
              })
          )
        );
      }

      console.log(`[processAll] Completed: ${results.success} success, ${results.failed} failed`);
      if (results.errors.length > 0) {
        console.log(`[processAll] First 10 errors:`, results.errors.slice(0, 10));
      }
    } catch (err: any) {
      console.error('[processAll] Fatal error:', err);
    }
  })();
});

const PORT = Number(process.env.PORT || 8085);

// Health check endpoint with dependency checks
app.get('/health', async (_req, res) => {
  const health: any = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'DataProcess API',
    version: '1.0.0',
    checks: {
      api: { status: 'ok' },
      subquery: { status: 'unknown' },
      s3: { status: 'unknown' },
    },
  };

  // Check SubQuery connection
  try {
    const subqueryUrl = process.env.SUBQUERY_URL || 'http://localhost:3000';
    const testQuery = '{ __typename }';
    const response = await fetch(subqueryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: testQuery }),
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    
    if (response.ok) {
      health.checks.subquery = {
        status: 'ok',
        endpoint: subqueryUrl,
      };
    } else {
      health.checks.subquery = {
        status: 'error',
        endpoint: subqueryUrl,
        error: `HTTP ${response.status}`,
      };
      health.status = 'degraded';
    }
  } catch (error: any) {
    health.checks.subquery = {
      status: 'error',
      endpoint: process.env.SUBQUERY_URL || 'http://localhost:3000',
      error: error?.message || 'Connection failed',
    };
    health.status = 'degraded';
  }

  // Check S3/MinIO connection
  try {
    const { HeadBucketCommand } = await import('@aws-sdk/client-s3');
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    health.checks.s3 = {
      status: 'ok',
      endpoint: process.env.S3_ENDPOINT || 'http://127.0.0.1:9000',
      bucket: BUCKET,
    };
  } catch (error: any) {
    health.checks.s3 = {
      status: 'error',
      endpoint: process.env.S3_ENDPOINT || 'http://127.0.0.1:9000',
      bucket: BUCKET,
      error: error?.message || 'Connection failed',
    };
    health.status = 'degraded';
  }

  // Return appropriate HTTP status
  const httpStatus = health.status === 'ok' ? 200 : 503;
  res.status(httpStatus).json(health);
});

// Simple health check (lightweight, no dependency checks)
app.get('/health/live', (_req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'DataProcess API',
  });
});

// Readiness check (includes dependency checks)
app.get('/health/ready', async (_req, res) => {
  const checks: any = {
    api: true,
    subquery: false,
    s3: false,
  };

  // Check SubQuery
  try {
    const subqueryUrl = process.env.SUBQUERY_URL || 'http://localhost:3000';
    const response = await fetch(subqueryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
      signal: AbortSignal.timeout(3000),
    });
    checks.subquery = response.ok;
  } catch {
    checks.subquery = false;
  }

  // Check S3
  try {
    const { HeadBucketCommand } = await import('@aws-sdk/client-s3');
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    checks.s3 = true;
  } catch {
    checks.s3 = false;
  }

  const ready = checks.api && checks.subquery && checks.s3;
  res.status(ready ? 200 : 503).json({
    ready,
    checks,
    timestamp: new Date().toISOString(),
  });
});

const server = app.listen(PORT, () => {
  console.log(`DataProcess API listening on :${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Live check: http://localhost:${PORT}/health/live`);
  console.log(`Ready check: http://localhost:${PORT}/health/ready`);
});

// // Ensure the event loop stays active even if something releases server refs
// try { process.stdin.resume(); } catch {}

