import { createWriteStream, readFileSync, unlinkSync } from 'fs';
import { createGzip } from 'zlib';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { tmpdir } from 'os';
import { join } from 'path';

const s3 = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT || 'http://127.0.0.1:9000',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || ''
  }
});

export async function uploadJsonGz(bucket: string, key: string, items: any | any[]) {
  const path = join(tmpdir(), `lobster-${Date.now()}-${Math.random().toString(36).slice(2)}.ndjson.gz`);
  const gz = createGzip();
  const ws = createWriteStream(path);
  gz.pipe(ws);
  const list = Array.isArray(items) ? items : [items];
  for (const item of list) gz.write(JSON.stringify(item) + '\n');
  gz.end();
  await new Promise<void>((resolve) => ws.on('close', () => resolve()));
  const Body = readFileSync(path);
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body }));
  try { unlinkSync(path); } catch {}
}

export async function downloadAndStream(bucket: string, key: string, onRow: (r: any) => void) {
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const { createGunzip } = await import('zlib');
  const readline = await import('readline');
  const resp: any = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const gunzip = createGunzip();
  const bodyStream = resp.Body as NodeJS.ReadableStream;
  const rl = readline.createInterface({ input: bodyStream.pipe(gunzip) as any });
  for await (const line of rl) onRow(JSON.parse(line));
}