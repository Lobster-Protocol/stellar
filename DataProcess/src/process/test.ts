import { queryPoolData, calculateAllMetrics } from './querySwaps';

async function main() {
  try {
    const token0 = 'CBKZSM5NS3JJ5C4OVQBXBIYPTNQAZIX7BGS62LA7VPBV6UBX734P6D6U';
    const token1 = 'CDSEE7QX6NKWTQFZW4UJXHJKJKPMSMMZBPDGYBUWYYYM4XYJ3AHUNFTZ';

    const poolData = await queryPoolData(token0, token1, 'soroswap');

    const metrics = await calculateAllMetrics(poolData);

    console.log('Done.');
  } catch (e) {
    console.error('Processor error:', e);
    process.exit(1);
  }
}

main();