import { querySubquery } from '../utils/graphql';
import {
  QUERY_NEW_PAIR_EVENT_ENTITIES,
  QUERY_NEW_PAIR_PHOENIX_ENTITIES,
  QUERY_NEW_PAIR_AQUARIUS_ENTITIES,
} from '../types/queries';

// Minimal queries compatible with current schema (no OrderDirection type, camelCase fields)
const Q_SOROSWAP_NEW_PAIRS = `
  query ($first: Int, $offset: Int) {
    newPairEventEntities(first: $first, offset: $offset) {
      nodes { id token0 token1 timestamp }
    }
  }
`;

const Q_PHOENIX_NEW_PAIRS = `
  query ($first: Int, $offset: Int) {
    newPairPhoenixEntities(first: $first, offset: $offset) {
      nodes { id token0 token1 timestamp }
    }
  }
`;

const Q_AQUARIUS_NEW_PAIRS = `
  query ($first: Int, $offset: Int) {
    newPairAquariusEntities(first: $first, offset: $offset) {
      nodes { id token0 token1 timestamp }
    }
  }
`;


type TokenPair = { token0: string; token1: string };

async function fetchPairsByQuery(query: string, rootKey: string): Promise<TokenPair[]> {
  const BATCH_SIZE = 1000;
  let offset = 0;
  const pairs: TokenPair[] = [];
  const seen = new Set<string>();
  let hasMore = true;

  while (hasMore) {
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
  }

  return pairs;
}

async function fetchSoroswapPairs(): Promise<TokenPair[]> {
  return fetchPairsByQuery(Q_SOROSWAP_NEW_PAIRS, 'newPairEventEntities');
}

async function fetchPhoenixPairs(): Promise<TokenPair[]> {
  return fetchPairsByQuery(Q_PHOENIX_NEW_PAIRS, 'newPairPhoenixEntities');
}

async function fetchAquariusPairs(): Promise<TokenPair[]> {
  return fetchPairsByQuery(Q_AQUARIUS_NEW_PAIRS, 'newPairAquariusEntities');
}

export async function fetchAllPoolsOnce(): Promise<void> {
  console.log('[poolsPoller] Fetching pairs from all protocols...');
  const [soro, phoenix, aquarius] = await Promise.all([
    fetchSoroswapPairs().catch((e) => {
      console.error('[poolsPoller] Soroswap fetch error', e);
      return [] as TokenPair[];
    }),
    fetchPhoenixPairs().catch((e) => {
      console.error('[poolsPoller] Phoenix fetch error', e);
      return [] as TokenPair[];
    }),
    fetchAquariusPairs().catch((e) => {
      console.error('[poolsPoller] Aquarius fetch error', e);
      return [] as TokenPair[];
    }),
  ]);

  console.log(`[poolsPoller] Soroswap pairs: ${soro.length}`);
  console.log(`[poolsPoller] Phoenix pairs: ${phoenix.length}`);
  console.log(`[poolsPoller] Aquarius pairs: ${aquarius.length}`);

  const preview = (arr: TokenPair[]) => arr.slice(0, 5).map(p => `${p.token0.substring(0,6)}...-${p.token1.substring(0,6)}...`).join(', ');
  console.log(`[poolsPoller] Soroswap sample: ${preview(soro)}`);
  console.log(`[poolsPoller] Phoenix sample: ${preview(phoenix)}`);
  console.log(`[poolsPoller] Aquarius sample: ${preview(aquarius)}`);
}

function hours(n: number): number {
  return n * 60 * 60 * 1000;
}

async function main(): Promise<void> {
  // Safety nets
  process.on('uncaughtException', (err) => {
    console.error('[poolsPoller] uncaughtException', err);
  });
  process.on('unhandledRejection', (reason: any) => {
    console.error('[poolsPoller] unhandledRejection', reason);
  });


  await fetchAllPoolsOnce();

  const intervalMs = Number(process.env.POOL_POLL_INTERVAL_MS || hours(12));
  console.log(`[poolsPoller] Scheduling every ${Math.round(intervalMs / (60 * 60 * 1000))}h`);
  setInterval(() => {
    fetchAllPoolsOnce().catch((e) => console.error('[poolsPoller] run error', e));
  }, intervalMs);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[poolsPoller] fatal', e);
    process.exit(1);
  });
}

