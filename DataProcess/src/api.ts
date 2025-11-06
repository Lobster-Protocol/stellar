import express from 'express';
import { gzipSync, gunzipSync } from 'zlib';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

import { queryPoolData, processPoolData } from './process/querySwaps';

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

const PORT = Number(process.env.PORT || 8085);
app.get('/health', (_req, res) => res.json({ ok: true }));

const server = app.listen(PORT, () => {
  console.log(`DataProcess API listening on :${PORT}`);
});

// // Ensure the event loop stays active even if something releases server refs
// try { process.stdin.resume(); } catch {}

