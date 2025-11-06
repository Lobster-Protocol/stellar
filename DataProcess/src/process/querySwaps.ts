// TODO: Import required dependencies
import Decimal from 'decimal.js';
import { AMMFormulas } from '../formulas/amm';
import { AMMConfig } from '../types';
import { QUERY_SWAP_AQUARIUS_ENTITIES, QUERY_SWAP_PHOENIX_ENTITIES, QUERY_SWAP_EVENT_ENTITIES } from '../types/queries';
// import { Database } from '../utils/database';
// import { QUERY_SWAP_EVENT_ENTITIES, QUERY_ADD_LIQUIDITY_EVENT_ENTITIES, QUERY_SYNC_EVENT_ENTITIES } from '../types/queries';
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

        // Step 1 - Query all pool data for the past year
        const poolData = await queryPoolData(token0Address, token1Address, protocol);

        // Step 2 - Process and calculate all AMM metrics
        const calculatedMetrics = await calculateAllMetrics(poolData, config);

        // Step 3 - Save results to database
        await saveToDatabase(calculatedMetrics, protocol);

        console.log(`Data processing completed for pair: ${token0Address}/${token1Address}`);

        return calculatedMetrics;
    } catch (error) {
        console.error(`Error processing data for pair ${token0Address}/${token1Address}:`, error);
        throw error;
    }
}

// Helper function for timestamp filtering
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
 * Step 1: Query all relevant data for the token pair from the past year
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

    const BATCH_SIZE = 100;
    let offset = 0;
    let allSwapEvents: any[] = [];
    let hasMore = true;

    // Query swap events in batches
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
                //orderDirection: "ASC"
            });

            // Check if we got data
            if (swapEvents?.swapEventEntities?.nodes) {
                allSwapEvents.push(...swapEvents.swapEventEntities.nodes);

                // Check if we got less than batch size (last page)
                hasMore = swapEvents.swapEventEntities.nodes.length === BATCH_SIZE;
                offset += BATCH_SIZE;

                console.log(`Fetched ${swapEvents.swapEventEntities.nodes.length} swap events (total: ${allSwapEvents.length})`);

                // Add delay to avoid rate limiting
                if (hasMore) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            } else {
                console.log('No swap events found or invalid response structure');
                hasMore = false;
            }
        } catch (error) {
            console.error(`Error fetching swap events at offset ${offset}:`, error);
            hasMore = false;
        }
    }

    console.log(`Total swap events fetched: ${allSwapEvents.length}`);

    const pooladdress = allSwapEvents[0].contract;
    return {
        swapEvents: allSwapEvents,
        pooladdress: pooladdress,
        token0Address,
        token1Address
    };
}


/**
 * Step 2: Calculate all AMM metrics using the formulas
 */
export async function calculateAllMetrics(
    poolData: PoolData,
    config?: AMMConfig
) {
    console.log('Calculating AMM metrics...');

    // Initialize AMM formulas with config
    const ammFormulas = new AMMFormulas();

    // TODO: Group data by time periods (daily, weekly, monthly)
    // const dailyData = groupDataByDay(poolData);
    // const weeklyData = groupDataByWeek(poolData);
    // const monthlyData = groupDataByMonth(poolData);

    // TODO: Calculate calculateSpotPrice
    const spotPriceList = [];
    for (let index = 0; index < poolData.swapEvents.length; index++) {
        const spotPrice = await ammFormulas.calculateSpotPrice(new Decimal(poolData.swapEvents[index].reserveBefore0), new Decimal(poolData.swapEvents[index].reserveBefore1));
        spotPriceList.push(spotPrice)
    }
    console.log("SpotPriceList", spotPriceList);



    // TODO: Calculate NormalizedTVL
    const normalizedTVLList = [];
    for (let index = 0; index < poolData.swapEvents.length; index++) {
        const normalizedTVL = await ammFormulas.getNormalizedTVL(new Decimal(poolData.swapEvents[index].reserveBefore0), new Decimal(poolData.swapEvents[index].reserveBefore1));
        normalizedTVLList.push(normalizedTVL)
    }
    console.log("NormalizedTVLList", normalizedTVLList);

    // TODO: Calculate GlobalToken0Exposure
    const globalToken0ExposureList = [];
    for (let index = 0; index < poolData.swapEvents.length; index++) {
        const globalToken0Exposure = await ammFormulas.getGlobalToken0Exposure(new Decimal(poolData.swapEvents[index].reserveBefore0), new Decimal(poolData.swapEvents[index].reserveBefore1));
        globalToken0ExposureList.push(globalToken0Exposure)
    }
    console.log("GlobalToken0ExposureList", globalToken0ExposureList);

    // TODO: Calculate AveragePrice
    const averagePriceList = [];
    for (let index = 1; index < poolData.swapEvents.length; index++) {
        const averagePrice = await ammFormulas.calculateAveragePrice(spotPriceList[index - 1], spotPriceList[index]);
        averagePriceList.push(averagePrice);
    }
    console.log("AveragePriceList", averagePriceList);

    // TODO: Calculate NormalizedVolume
    const normalizedVolumeList = [];
    for (let index = 1; index < poolData.swapEvents.length; index++) {
        const normalizedVolume = await ammFormulas.calculateNormalizedVolume(new Decimal(poolData.swapEvents[index].amount0), new Decimal(poolData.swapEvents[index].amount1), averagePriceList[index - 1]);
        normalizedVolumeList.push(normalizedVolume);
    }
    console.log("NormalizedVolumeList", normalizedVolumeList);

    // TODO: Calculate CapturedFees
    const capturedFeesList = [];
    for (let index = 1; index < poolData.swapEvents.length; index++) {
        const capturedFees = await ammFormulas.calculateCapturedFees(new Decimal(poolData.swapEvents[index].amount0), new Decimal(poolData.swapEvents[index].amount1), averagePriceList[index - 1]);
        capturedFeesList.push(capturedFees);
    }
    console.log("CapturedFeesList", capturedFeesList);

    // TODO: Calculate calculatePoolFeeRate
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


    // TODO: Calculate calculateProfit
    const profit = await ammFormulas.calculateProfit(
        capturedFeesList,
        normalizedTVLList.slice(1)  // Remove first element to match capturedFeesList
    );
    console.log('Cumulative Profit:', profit);

    //const profitList = [];
    // for (let index = 1; index < capturedFeesList.length; index++) {
    //     const cumProfit = await ammFormulas.calculateProfit(
    //         capturedFeesList.slice(0, index),
    //         normalizedTVLList.slice(1, index + 1)
    //     );
    //     profitList.push(cumProfit);
    // }
    const profitList = ammFormulas.calculateProfitSeries(capturedFeesList,   normalizedTVLList.slice(1)
);

    console.log("ProfitList", profitList);

    // TODO: Calculate calculatePercentLossBalanced
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


    // TODO: Calculate calculatePnL
    const pnl = await ammFormulas.calculatePnL(profit, percentLossBalancedList[percentLossBalancedList.length - 1]);
    console.log("Final PnL:", pnl);

    const pnlList = [];
    for (let index = 0; index < profitList.length; index++) {
        const pnl = await ammFormulas.calculatePnL(profitList[index], percentLossBalancedList[index]);
        pnlList.push(pnl);
    }
    console.log("PnlList", pnlList);


    // TODO: Calculate Annualization Factor
    const avgTimeStellarBlock = new Decimal(5); // Stellar blocks are ~5 seconds on average
    const windowSize = poolData.swapEvents.length; // Look back  periods (adjust as needed)

    // Get block numbers from your data
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

    // TODO: Calculate APR
    const aprList = [];
    for (let index = 0; index < pnlList.length; index++) {
        const apr = await ammFormulas.calculateAPR(pnlList[index], annualizationFactorList[index]);
        aprList.push(apr);
    }
    console.log('APRList:', aprList);


    // TODO: Calculate calculatePeriodReturn
    const periodReturnList = [];    
    for (let index = 1; index < pnlList.length; index++) {
        const periodReturn = await ammFormulas.calculatePeriodReturn(pnlList[index], pnlList[index - 1]);
        periodReturnList.push(periodReturn);
    }
    console.log('Period ReturnList:', periodReturnList);

    // // TODO: Calculate calculateAverageReturn
    // const windowSizeAverageReturn = 10; // choose your window
    // const averageReturnList: Decimal[] = [];
    
    // for (let i = windowSizeAverageReturn; i <= periodReturnList.length; i++) {
    //   const window = periodReturnList.slice(i - windowSizeAverageReturn, i);
    //   const avg = await ammFormulas.calculateAverageReturn(window, new Decimal(windowSizeAverageReturn));
    //   averageReturnList.push(avg);
    // }
    const averageReturnList = ammFormulas.calculateAverageReturnSeries(periodReturnList, 10);
    console.log('Average ReturnList:', averageReturnList);

    // // TODO: Calculate calculateReturnStdDev
    // const returnStdDevList = [];
    // for (let index = 0; index < periodReturnList.length; index++) {
    //     const returnStdDev = await ammFormulas.calculateReturnStdDev(periodReturnList, new Decimal(periodReturnList.length), averageReturnList[index]);
    //     returnStdDevList.push(returnStdDev);
    // }
    const returnStdDevList = ammFormulas.calculateReturnStdDevSeries(periodReturnList);
     console.log('Return Std Dev List:', returnStdDevList);

    // // TODO: Calculate calculateSharpeRatio
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

    // TODO: Calculate calculateInstantaneousVolatility
    const instantaneousVolatilityList = [];
    for (let index = 1; index < spotPriceList.length; index++) {
        const instantaneousVolatility = await ammFormulas.calculateInstantaneousVolatility(spotPriceList[index], spotPriceList[index - 1]);
        instantaneousVolatilityList.push(instantaneousVolatility);
    }
    console.log('Instantaneous Volatility List:', instantaneousVolatilityList);

    // // TODO: Calculate calculateAverageVolatility  
    // const averageVolatilityList = [];
    // for (let index = 0; index < instantaneousVolatilityList.length; index++) {
    //     const averageVolatility = await ammFormulas.calculateAverageVolatility(instantaneousVolatilityList.slice(0, index+1), new Decimal(index+1));
    //     averageVolatilityList.push(averageVolatility);
    // }

    const averageVolatilityList = ammFormulas.calculateAverageVolatilitySeries(instantaneousVolatilityList);
    console.log('Average Volatility List:', averageVolatilityList);

    // // TODO: Calculate calculateVolatilityVariance
    //const volatilityVarianceList = [];
    // for (let index = 1; index < instantaneousVolatilityList.length; index++) {
    //     const volWindow = instantaneousVolatilityList.slice(0, index);
    //     const volatilityVariance = await ammFormulas.calculateVolatilityVariance(volWindow, new Decimal(index), averageVolatilityList[index]);
    //     volatilityVarianceList.push(volatilityVariance);
    // }
    const volatilityVarianceList = ammFormulas.calculateVolatilityVarianceSeries(instantaneousVolatilityList);

    console.log('Volatility Variance List:', volatilityVarianceList);

    // TODO: Calculate calculateAverageTVL
    // const averageTVLList = [];
    // for (let index = 1; index < normalizedTVLList.length; index++) {
    //     const averageTVL = await ammFormulas.calculateAverageTVL(normalizedTVLList.slice(0, index), new Decimal(index));
    //     averageTVLList.push(averageTVL);
    // }
    const averageTVLList = ammFormulas.calculateAverageTVLSeries(normalizedTVLList);
    console.log('Average TVL List:', averageTVLList);

    // TODO: Calculate calculateTVLVariance
    // const tvlVarianceList = [];
    // for (let index = 1; index < normalizedTVLList.length; index++) {
    //     const tvlVariance = await ammFormulas.calculateTVLVariance(normalizedTVLList.slice(0, index), new Decimal(index), averageTVLList[index]);
    //     tvlVarianceList.push(tvlVariance);
    // }
    const tvlVarianceList = ammFormulas.calculateTVLVarianceSeries(normalizedTVLList);

    console.log('TVL Variance List:', tvlVarianceList);

    // TODO: Calculate calculateEfficiency
    const efficiencyList = [];
    for (let index = 0; index < 1; index++) {
        const efficiency = await ammFormulas.calculateEfficiency(turnoverFactor, globalToken0ExposureList[globalToken0ExposureList.length-1]);
        efficiencyList.push(efficiency);
    }
    console.log('Efficiency List:', efficiencyList);

    // TODO: Calculate calculateStability
    const stabilityList = [];
    for (let index = 0; index < 1; index++) {
        const stability = await ammFormulas.calculateStability(volatilityVarianceList[volatilityVarianceList.length-1], averageVolatilityList[averageVolatilityList.length-1], tvlVarianceList[tvlVarianceList.length-1], averageTVLList[averageTVLList.length-1]);
        stabilityList.push(stability);
    }
    console.log('Stability List:', stabilityList);

    // TODO: Calculate arbitrage conditions
    // const arbitrageConditions = calculateArbitrageConditions(poolData, ammFormulas);

    // Upload metrics to S3 as NDJSON.gz

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
 * Step 3: Save calculated metrics to database
 */
export async function saveToDatabase(metrics: any, protocol: string): Promise<void> {
    console.log('Saving metrics to database...');
    
    const key = `${protocol}/${metrics.token0Address}_${metrics.token1Address}.latest.json.gz`;
    await uploadJsonGz(process.env.S3_BUCKET || 'lobster', key, metrics);


    console.log('Metrics saved to database successfully');
}