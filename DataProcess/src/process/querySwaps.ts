import Decimal from 'decimal.js';
import { AMMFormulas } from '../formulas/amm';
import { AMMConfig } from '../types';
import { QUERY_SWAP_AQUARIUS_ENTITIES, QUERY_SWAP_PHOENIX_ENTITIES, QUERY_SWAP_EVENT_ENTITIES } from '../types/queries';
import { querySubquery } from '../utils/graphql';
import { uploadJsonGz } from '../utils/bd';

export interface PoolData {
    swapEvents: any[];
    pooladdress: string;
    token0Address: string;
    token1Address: string;
}


export async function processPoolData(
    token0Address: string,
    token1Address: string,
    protocol: string,
    config?: AMMConfig
): Promise<Awaited<ReturnType<typeof calculateAllMetrics>>> {
    try {
        console.log(`Starting data processing for pair: ${token0Address}/${token1Address}`);

        const poolData = await queryPoolData(token0Address, token1Address, protocol);

        const calculatedMetrics = await calculateAllMetrics(poolData, config);

        await saveToDatabase(calculatedMetrics, protocol);

        console.log(`Data processing completed for pair: ${token0Address}/${token1Address}`);

        return calculatedMetrics;
    } catch (error: any) {
        const errorMessage = error?.message || String(error);
        // New or inactive pools have no swaps; rethrow without logging so callers can skip them
        if (errorMessage.includes('No swap events found')) {
            throw error;
        }
        
        if (errorMessage.includes('Cannot connect to SubQuery')) {
            throw new Error(`SubQuery connection failed. Please ensure SubQuery is running and SUBQUERY_URL is correct.`);
        }
        
        console.error(`Error processing data for pair ${token0Address}/${token1Address}:`, errorMessage);
        throw error;
    }
}

const getTimestampFilters = {
    pastYear: () => ({
        timestamp: {
            greaterThan: (Math.floor(Date.now() / 1000) - (365 * 24 * 60 * 60)).toString()
        }
    }),

    pastDays: (days: number) => ({
        timestamp: {
            greaterThan: (Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60)).toString()
        }
    })
};

/**
 * Query all swap events for the token pair from the past year
 */
export async function queryPoolData(
    token0Address: string,
    token1Address: string, 
    query: string
): Promise<PoolData> {
    console.log('Querying pool data...');

    const protocol =
      query === 'soroswap' ? QUERY_SWAP_EVENT_ENTITIES :
      query === 'phoenix' ? QUERY_SWAP_PHOENIX_ENTITIES :
      query === 'aquarius' ? QUERY_SWAP_AQUARIUS_ENTITIES : '';

    const responseKey = 
      query === 'soroswap' ? 'swapEventEntities' :
      query === 'phoenix' ? 'swapPhoenixEntities' :
      query === 'aquarius' ? 'swapAquariusEntities' : 'swapEventEntities';

    const BATCH_SIZE = 100;
    let offset = 0;
    let allSwapEvents: any[] = [];
    let hasMore = true;

    while (hasMore) {
        try {
            const swapEvents: any = await querySubquery(protocol, {
                filter: {
                    and: [
                        getTimestampFilters.pastYear(),
                        { token0: { equalTo: token0Address } },
                        { token1: { equalTo: token1Address } }
                    ]
                },
                first: BATCH_SIZE,
                offset: offset,
                orderBy: "TIMESTAMP_ASC",
            });

            const nodes = swapEvents?.[responseKey]?.nodes;
            if (nodes && Array.isArray(nodes) && nodes.length > 0) {
                allSwapEvents.push(...nodes);

                hasMore = nodes.length === BATCH_SIZE;
                offset += BATCH_SIZE;

                console.log(`Fetched ${nodes.length} swap events (total: ${allSwapEvents.length})`);

                // Add delay to avoid rate limiting
                if (hasMore) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            } else {
                console.log('No swap events found or invalid response structure');
                hasMore = false;
            }
        } catch (error: any) {
            const errorMsg = error?.message || String(error);
            if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('fetch failed')) {
                throw new Error(`Cannot connect to SubQuery endpoint. Please check SUBQUERY_URL (currently: ${process.env.SUBQUERY_URL || 'http://localhost:3000'})`);
            }
            console.error(`Error fetching swap events at offset ${offset}:`, errorMsg);
            hasMore = false;
        }
    }

    console.log(`Total swap events fetched: ${allSwapEvents.length}`);

    if (allSwapEvents.length === 0) {
        throw new Error(`No swap events found for pair ${token0Address.substring(0, 8)}.../${token1Address.substring(0, 8)}... (${query}). The pool may be new or inactive.`);
    }

    const pooladdress = allSwapEvents[0].contract;
    return {
        swapEvents: allSwapEvents,
        pooladdress: pooladdress,
        token0Address,
        token1Address
    };
}


/**
 * Calculate all AMM metrics using the formulas
 */
export async function calculateAllMetrics(
    poolData: PoolData,
    config?: AMMConfig
) {
    console.log('Calculating AMM metrics...');

    const ammFormulas = new AMMFormulas();

    const spotPriceList = [];
    for (let index = 0; index < poolData.swapEvents.length; index++) {
        const spotPrice = await ammFormulas.calculateSpotPrice(new Decimal(poolData.swapEvents[index].reserveBefore0), new Decimal(poolData.swapEvents[index].reserveBefore1));
        spotPriceList.push(spotPrice)
    }
    console.log("SpotPriceList", spotPriceList);



    const normalizedTVLList = [];
    for (let index = 0; index < poolData.swapEvents.length; index++) {
        const normalizedTVL = await ammFormulas.getNormalizedTVL(new Decimal(poolData.swapEvents[index].reserveBefore0), new Decimal(poolData.swapEvents[index].reserveBefore1));
        normalizedTVLList.push(normalizedTVL)
    }
    console.log("NormalizedTVLList", normalizedTVLList);

    const globalToken0ExposureList = [];
    for (let index = 0; index < poolData.swapEvents.length; index++) {
        const globalToken0Exposure = await ammFormulas.getGlobalToken0Exposure(new Decimal(poolData.swapEvents[index].reserveBefore0), new Decimal(poolData.swapEvents[index].reserveBefore1));
        globalToken0ExposureList.push(globalToken0Exposure)
    }
    console.log("GlobalToken0ExposureList", globalToken0ExposureList);

    const averagePriceList = [];
    for (let index = 1; index < poolData.swapEvents.length; index++) {
        const averagePrice = await ammFormulas.calculateAveragePrice(spotPriceList[index - 1], spotPriceList[index]);
        averagePriceList.push(averagePrice);
    }
    console.log("AveragePriceList", averagePriceList);

    const normalizedVolumeList = [];
    for (let index = 1; index < poolData.swapEvents.length; index++) {
        const normalizedVolume = await ammFormulas.calculateNormalizedVolume(new Decimal(poolData.swapEvents[index].amount0), new Decimal(poolData.swapEvents[index].amount1), averagePriceList[index - 1]);
        normalizedVolumeList.push(normalizedVolume);
    }
    console.log("NormalizedVolumeList", normalizedVolumeList);

    const capturedFeesList = [];
    for (let index = 1; index < poolData.swapEvents.length; index++) {
        const capturedFees = await ammFormulas.calculateCapturedFees(new Decimal(poolData.swapEvents[index].amount0), new Decimal(poolData.swapEvents[index].amount1), averagePriceList[index - 1]);
        capturedFeesList.push(capturedFees);
    }
    console.log("CapturedFeesList", capturedFeesList);

    const poolFeeRateList = [];
    for (let index = 0; index < capturedFeesList.length; index++) {
        const poolFeeRate = await ammFormulas.calculatePoolFeeRate(capturedFeesList[index], normalizedVolumeList[index]);
        poolFeeRateList.push(poolFeeRate);
    }
    console.log("PoolFeeRateList", poolFeeRateList);

    // Calculate turnover factor using all available data
    const turnoverFactor = await ammFormulas.calculateTurnoverFactor(
        normalizedVolumeList,
        new Decimal(normalizedVolumeList.length),
        normalizedTVLList[normalizedTVLList.length - 1] // Last TVL
    );
    console.log('Overall Turnover Factor:', turnoverFactor);


    const profit = await ammFormulas.calculateProfit(
        capturedFeesList,
        normalizedTVLList.slice(1)  // Remove first element to match capturedFeesList
    );
    console.log('Cumulative Profit:', profit);

    const profitList = ammFormulas.calculateProfitSeries(capturedFeesList,   normalizedTVLList.slice(1)
);

    console.log("ProfitList", profitList);

    const percentLossBalancedList = [];
    const initialReserve0 = new Decimal(poolData.swapEvents[0].reserveBefore0);
    const initialReserve1 = new Decimal(poolData.swapEvents[0].reserveBefore1);
    const initialPrice = initialReserve1.div(initialReserve0);

    for (let index = 1; index < poolData.swapEvents.length; index++) {

        const currentReserve0 = new Decimal(poolData.swapEvents[index].reserveBefore0);
        const currentReserve1 = new Decimal(poolData.swapEvents[index].reserveBefore1);
        const currentPrice = currentReserve1.div(currentReserve0);

        const percentLossBalanced = await ammFormulas.calculatePercentLossBalanced(
            initialPrice,    // P(t0) = initialReserve1 / initialReserve0
            currentPrice     // P(t) = currentReserve1 / currentReserve0
        );
        percentLossBalancedList.push(percentLossBalanced);
    }
    console.log("PercentLossBalancedList", percentLossBalancedList);


    const pnl = await ammFormulas.calculatePnL(profit, percentLossBalancedList[percentLossBalancedList.length - 1]);
    console.log("Final PnL:", pnl);

    const pnlList = [];
    for (let index = 0; index < profitList.length; index++) {
        const pnl = await ammFormulas.calculatePnL(profitList[index], percentLossBalancedList[index]);
        pnlList.push(pnl);
    }
    console.log("PnlList", pnlList);


    const avgTimeStellarBlock = new Decimal(5); // Stellar blocks are ~5 seconds on average
    const windowSize = poolData.swapEvents.length;

    const currentBlock = new Decimal(poolData.swapEvents[poolData.swapEvents.length - 1].block);
    const firstBlock = new Decimal(poolData.swapEvents[0].block);

    const annualizationFactorList = [];
    for (let index = 0; index < pnlList.length; index++) {
    const annualizationFactor = await ammFormulas.getAnnualizationFactor(
        avgTimeStellarBlock,
        currentBlock,
        firstBlock
    );
    annualizationFactorList.push(annualizationFactor);
    }

    console.log('Annualization FactorList:', annualizationFactorList);

    const aprList = [];
    for (let index = 0; index < pnlList.length; index++) {
        const apr = await ammFormulas.calculateAPR(pnlList[index], annualizationFactorList[index]);
        aprList.push(apr);
    }
    console.log('APRList:', aprList);


    const periodReturnList = [];    
    for (let index = 1; index < pnlList.length; index++) {
        const periodReturn = await ammFormulas.calculatePeriodReturn(pnlList[index], pnlList[index - 1]);
        periodReturnList.push(periodReturn);
    }
    console.log('Period ReturnList:', periodReturnList);

    const averageReturnList = ammFormulas.calculateAverageReturnSeries(periodReturnList, 10);
    console.log('Average ReturnList:', averageReturnList);

    const returnStdDevList = ammFormulas.calculateReturnStdDevSeries(periodReturnList);
     console.log('Return Std Dev List:', returnStdDevList);

    const sharpeRatioList = [];
    const alignedLength = Math.min(
        averageReturnList.length,
        returnStdDevList.length,
        annualizationFactorList.length
      );    for (let index = 1; index < alignedLength; index++) {
        const sharpeRatio = await ammFormulas.calculateSharpeRatio(averageReturnList[index], returnStdDevList[index], annualizationFactorList[index]);
        sharpeRatioList.push(sharpeRatio);
    }
    console.log('Sharpe Ratio List:', sharpeRatioList);

    const instantaneousVolatilityList = [];
    for (let index = 1; index < spotPriceList.length; index++) {
        const instantaneousVolatility = await ammFormulas.calculateInstantaneousVolatility(spotPriceList[index], spotPriceList[index - 1]);
        instantaneousVolatilityList.push(instantaneousVolatility);
    }
    console.log('Instantaneous Volatility List:', instantaneousVolatilityList);

    const averageVolatilityList = ammFormulas.calculateAverageVolatilitySeries(instantaneousVolatilityList);
    console.log('Average Volatility List:', averageVolatilityList);

    const volatilityVarianceList = ammFormulas.calculateVolatilityVarianceSeries(instantaneousVolatilityList);

    console.log('Volatility Variance List:', volatilityVarianceList);

    const averageTVLList = ammFormulas.calculateAverageTVLSeries(normalizedTVLList);
    console.log('Average TVL List:', averageTVLList);

    const tvlVarianceList = ammFormulas.calculateTVLVarianceSeries(normalizedTVLList);

    console.log('TVL Variance List:', tvlVarianceList);

    const efficiencyList = [];
    for (let index = 0; index < 1; index++) {
        const efficiency = await ammFormulas.calculateEfficiency(turnoverFactor, globalToken0ExposureList[globalToken0ExposureList.length-1]);
        efficiencyList.push(efficiency);
    }
    console.log('Efficiency List:', efficiencyList);

    const stabilityList = [];
    for (let index = 0; index < 1; index++) {
        const stability = await ammFormulas.calculateStability(volatilityVarianceList[volatilityVarianceList.length-1], averageVolatilityList[averageVolatilityList.length-1], tvlVarianceList[tvlVarianceList.length-1], averageTVLList[averageTVLList.length-1]);
        stabilityList.push(stability);
    }
    console.log('Stability List:', stabilityList);

    const element = {
        calculatedAt: new Date(),
        token0Address: poolData.token0Address,
        token1Address: poolData.token1Address,
        pooladdress: poolData.pooladdress,
        lists: {
            spotPriceList,
            normalizedTVLList,
            globalToken0ExposureList,
            averagePriceList,
            normalizedVolumeList,
            capturedFeesList,
            poolFeeRateList,
            turnoverFactor,
            profit,
            profitList,
            percentLossBalancedList,
            pnl,
            pnlList,
            annualizationFactorList,
            aprList,
            periodReturnList,
            instantaneousVolatilityList,
            averageVolatilityList,
            volatilityVarianceList,
            averageTVLList,
            tvlVarianceList,
            efficiencyList,
            stabilityList
        }
    };
    return element;
}

/**
 * Save calculated metrics to database
 */
export async function saveToDatabase(metrics: any, protocol: string): Promise<void> {
    console.log('Saving metrics to database...');
    
    const key = `${protocol}/${metrics.token0Address}_${metrics.token1Address}.latest.json.gz`;
    await uploadJsonGz(process.env.S3_BUCKET || 'lobster', key, metrics);


    console.log('Metrics saved to database successfully');
}