// DataProcess/src/process/runSwapProcessor.ts
import { log } from 'node:console';
import { queryPoolData, calculateAllMetrics, saveToDatabase } from './querySwaps';

// Replace with a real pair or params your processor expects
async function main() {
  try {
    // example arguments — adjust as needed to match your function signature
    const token0 = 'CBKZSM5NS3JJ5C4OVQBXBIYPTNQAZIX7BGS62LA7VPBV6UBX734P6D6U';
    const token1 = 'CDSEE7QX6NKWTQFZW4UJXHJKJKPMSMMZBPDGYBUWYYYM4XYJ3AHUNFTZ';


    const poolData = await queryPoolData(token0, token1, 'soroswap'); // or whatever entry you exported
    //console.log(JSON.stringify(poolData, null, 2));

    //const bigList = expandList(poolData.swapEvents as any, 100000);


    const metrics = await calculateAllMetrics(poolData);
    //await saveToDatabase(metrics);

    console.log('Done.');
  } catch (e) {
    console.error('Processor error:', e);
    process.exit(1);
  }
}

// Function to expand the list
function expandList(list: any[], targetLength: number) {
  const result: { swapEvents: any[] } = { swapEvents: [] };
  while (result.swapEvents.length < targetLength) {
    // Add as much as possible without exceeding targetLength
    result.swapEvents.push(...list);

  }
  return result;
}

main();