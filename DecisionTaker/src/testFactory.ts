import 'dotenv/config';
import { FactoryClient } from '../bindings/factoryClient';
import { LobsterClient } from '../bindings/lobsterClient';

import {
    Keypair,
    Networks,
    Operation,
    TransactionBuilder,
    BASE_FEE,
    xdr,
    StrKey
} from '@stellar/stellar-sdk';
import {
    rpc as StellarRpc
} from '@stellar/stellar-sdk';
import { TokenClient } from '../bindings/tokenClient';

type PoolChangeConditionParams = {
    arbitrageFee: number;          // annual arbitrage fee (e.g., 0.02 for 2%)
    userPositionToken0: number;    // user's position amount in token0
    APR_poolTarget: number;        // target pool APR (e.g., 0.15 for 15%)
    APR_poolActuelle: number;      // current pool APR (e.g., 0.10 for 10%)
    recoveryDay: number;           // threshold day to trigger change
};

export type PoolDecision = {
    shouldChange: boolean;
    currentPool: number; // 0: Soroswap, 1: Phoenix, 2: Aquarius
    targetPool: number | null; // 0: Soroswap, 1: Phoenix, 2: Aquarius, null if no change
};

/**
 * Determines whether the pool change condition is met.
 * Returns `true` if the calculated value exceeds the recoveryDay.
 */
export function shouldChangePool(params: PoolChangeConditionParams): boolean {
    const {
        arbitrageFee,
        userPositionToken0,
        APR_poolTarget,
        APR_poolActuelle,
        recoveryDay,
    } = params;

    // Prevent division by zero
    const aprDifference = APR_poolTarget - APR_poolActuelle;
    if (aprDifference <= 0 || userPositionToken0 === 0) return false;

    const result =
        (365 * arbitrageFee) / (userPositionToken0 * aprDifference);

    return result > recoveryDay;
}

/**
 * Get token price in USD from Soroswap API
 * @param asset - Token contract address
 * @param network - Network ('mainnet' or 'testnet'), defaults to 'mainnet'
 * @returns Price of token in USD, or null if error
 */
async function getTokenPriceUSD(
    asset: string,
    network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<number | null> {
    const apiKey = process.env.API_KEY ?? 'sk_062e947839d9f172572b34c6eb6a9798f3babbb053cdae85cd8550ea2225c92d';

    const baseUrl = 'https://api.soroswap.finance/price';
    const params = new URLSearchParams({
        network: network,
        asset: asset,
        referenceCurrency: 'USD'
    });
    const url = `${baseUrl}?${params.toString()}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        return data;
    } catch (error) {
        console.error('Error fetching token price:', error);
        return null;
    }
}

async function getDataLast(token0: string, token1: string, protocol: string): Promise<any> {
    const baseUrl = process.env.PROCESS_URL ?? 'http://localhost:8085/data/last';
    const params = new URLSearchParams({
        token0: token0,
        token1: token1,
        protocol: protocol
    });
    const url = `${baseUrl}?${params.toString()}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {}
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error making API call:', error);
        return []
    }
}

export async function executePoolMigration(
    clientLobster: LobsterClient,
    decision: PoolDecision,
    currentPool: number,
    poolAddresses: {
        soroswap: string;
        phoenix: string;
        aquarius: string;
    },
    // ... other params needed for withdraw/add_liquidity
): Promise<void> {
    if (!decision.shouldChange || decision.targetPool === null) {
        console.log('No pool change needed');
        return;
    }

    const keypair = Keypair.fromSecret(process.env.SECRET ?? '');
    const publicKey = keypair.publicKey();

    let tx;
    // 1. Withdraw from current pool
    switch (currentPool) {
        case 0: // Soroswap
            tx = await clientLobster.withdraw_soroswap({
                caller: publicKey,
                amount0_min: BigInt(0),
                amount1_min: BigInt(0),
                deadline: BigInt(99999999999),
                pool_address: poolAddresses.soroswap,
                router_address: process.env.SOROSWAP_ROUTER ?? '',
            });
            break;
        case 1: // Phoenix
            tx = await clientLobster.withdraw_phoenix({
                caller: publicKey,
                amount0_min: BigInt(0),
                amount1_min: BigInt(0),
                deadline: BigInt(99999999999),
                pool_address: poolAddresses.phoenix,
            });
            break;
        case 2: // Aquarius
            tx = await clientLobster.withdraw_aquarius({
                caller: publicKey,
                amount0_min: BigInt(0),
                amount1_min: BigInt(0),
                pool_address: poolAddresses.aquarius,
            });
            break;
    }

    console.log('Sending the withdraw transaction...');
    let result = await tx?.signAndSend();
    //console.log('result =>', JSON.stringify(result, null, 2));
    console.log('Withdraw done !');

    await new Promise(resolve => setTimeout(resolve, 10000));

    let balance = await clientLobster.get_amounts_tokens();
    let balance0 = balance._value[0]._value._attributes.lo._value.toString();
    let balance1 = balance._value[1]._value._attributes.lo._value.toString();

    let tx2;
    // 2. Add liquidity to target pool
    switch (decision.targetPool) {
        case 0: // Soroswap
            tx2 = await clientLobster.add_liquidity_soroswap({
                caller: publicKey,
                amount0: BigInt(balance0),
                amount1: BigInt(balance1),
                amount0_min: BigInt(0),
                amount1_min: BigInt(0),
                deadline_ledger: BigInt(99999999999),
                router_address: process.env.SOROSWAP_ROUTER ?? '',
            });
            break;
        case 1: // Phoenix
            tx2 = await clientLobster.add_liquidity_phoenix({
                caller: publicKey,
                amount0: BigInt(balance0),
                amount1: BigInt(balance1),
                amount0_min: BigInt(0),
                amount1_min: BigInt(0),
                pool_address: poolAddresses.phoenix,
                deadline: BigInt(99999999999),
                slippage: BigInt(500),
            });
            break;
        case 2: // Aquarius
            tx2 = await clientLobster.add_liquidity_aquarius({
                caller: publicKey,
                amount0: BigInt(balance0),
                amount1: BigInt(balance1),
                pool_address: poolAddresses.aquarius,
            });
            break;
    }

    console.log('Sending the add liquidity transaction...');
    let result2 = await tx2?.signAndSend();
    //console.log('result2 =>', JSON.stringify(result2, null, 2));
    console.log('Add liquidity done !');
    await new Promise(resolve => setTimeout(resolve, 1000));
}

export async function compareAndDecidePool(
    aprSoroswap: number,
    aprPhoenix: number,
    aprAquarius: number,
    actualPool: number,
    arbitrageFee: number,
    userPositionToken0: number,
    recoveryDay: number
): Promise<PoolDecision> {

    const baseDecision: PoolDecision = {
        shouldChange: false,
        currentPool: actualPool,
        targetPool: null,
    };

    switch (actualPool) {
        case 0: // Current pool is Soroswap
            console.log('Current pool: Soroswap, comparing with Phoenix and Aquarius');

            // Compare Soroswap vs Phoenix
            const shouldChangeToPhoenix = shouldChangePool({
                arbitrageFee,
                userPositionToken0,
                APR_poolTarget: aprPhoenix,
                APR_poolActuelle: aprSoroswap,
                recoveryDay
            });

            // Compare Soroswap vs Aquarius
            const shouldChangeToAquarius = shouldChangePool({
                arbitrageFee,
                userPositionToken0,
                APR_poolTarget: aprAquarius,
                APR_poolActuelle: aprSoroswap,
                recoveryDay
            });

            console.log('Should change to Phoenix?', shouldChangeToPhoenix);
            console.log('Should change to Aquarius?', shouldChangeToAquarius);

            // Determine best option
            if (shouldChangeToPhoenix && shouldChangeToAquarius) {
                const bestPool = aprPhoenix > aprAquarius ? 1 : 2;
                const bestPoolName = aprPhoenix > aprAquarius ? 'Phoenix' : 'Aquarius';
                baseDecision.shouldChange = true;
                baseDecision.targetPool = bestPool;
                console.log('Both options viable, choose higher APR:', bestPoolName);
            } else if (shouldChangeToPhoenix) {
                baseDecision.shouldChange = true;
                baseDecision.targetPool = 1;
                console.log('Recommend changing to Phoenix');
            } else if (shouldChangeToAquarius) {
                baseDecision.shouldChange = true;
                baseDecision.targetPool = 2;
                console.log('Recommend changing to Aquarius');
            } else {
                console.log('Stay with Soroswap');
            }
            break;

        case 1: // Current pool is Phoenix
            console.log('Current pool: Phoenix, comparing with Soroswap and Aquarius');

            // Compare Phoenix vs Soroswap
            const shouldChangeToSoroswapFromPhoenix = shouldChangePool({
                arbitrageFee,
                userPositionToken0,
                APR_poolTarget: aprSoroswap,
                APR_poolActuelle: aprPhoenix,
                recoveryDay
            });

            // Compare Phoenix vs Aquarius
            const shouldChangeToAquariusFromPhoenix = shouldChangePool({
                arbitrageFee,
                userPositionToken0,
                APR_poolTarget: aprAquarius,
                APR_poolActuelle: aprPhoenix,
                recoveryDay
            });

            console.log('Should change to Soroswap?', shouldChangeToSoroswapFromPhoenix);
            console.log('Should change to Aquarius?', shouldChangeToAquariusFromPhoenix);

            if (shouldChangeToSoroswapFromPhoenix && shouldChangeToAquariusFromPhoenix) {
                const bestPool = aprSoroswap > aprAquarius ? 0 : 2;
                const bestPoolName = aprSoroswap > aprAquarius ? 'Soroswap' : 'Aquarius';
                baseDecision.shouldChange = true;
                baseDecision.targetPool = bestPool;
                console.log('Both options viable, choose higher APR:', bestPoolName);
            } else if (shouldChangeToSoroswapFromPhoenix) {
                baseDecision.shouldChange = true;
                baseDecision.targetPool = 0;
                console.log('Recommend changing to Soroswap');
            } else if (shouldChangeToAquariusFromPhoenix) {
                baseDecision.shouldChange = true;
                baseDecision.targetPool = 2;
                console.log('Recommend changing to Aquarius');
            } else {
                console.log('Stay with Phoenix');
            }
            break;

        case 2: // Current pool is Aquarius
            console.log('Current pool: Aquarius, comparing with Soroswap and Phoenix');

            // Compare Aquarius vs Soroswap
            const shouldChangeToSoroswapFromAquarius = shouldChangePool({
                arbitrageFee,
                userPositionToken0,
                APR_poolTarget: aprSoroswap,
                APR_poolActuelle: aprAquarius,
                recoveryDay
            });

            // Compare Aquarius vs Phoenix
            const shouldChangeToPhoenixFromAquarius = shouldChangePool({
                arbitrageFee,
                userPositionToken0,
                APR_poolTarget: aprPhoenix,
                APR_poolActuelle: aprAquarius,
                recoveryDay
            });

            console.log('Should change to Soroswap?', shouldChangeToSoroswapFromAquarius);
            console.log('Should change to Phoenix?', shouldChangeToPhoenixFromAquarius);

            if (shouldChangeToSoroswapFromAquarius && shouldChangeToPhoenixFromAquarius) {
                const bestPool = aprSoroswap > aprPhoenix ? 0 : 1;
                const bestPoolName = aprSoroswap > aprPhoenix ? 'Soroswap' : 'Phoenix';
                baseDecision.shouldChange = true;
                baseDecision.targetPool = bestPool;
                console.log('Both options viable, choose higher APR:', bestPoolName);
            } else if (shouldChangeToSoroswapFromAquarius) {
                baseDecision.shouldChange = true;
                baseDecision.targetPool = 0;
                console.log('Recommend changing to Soroswap');
            } else if (shouldChangeToPhoenixFromAquarius) {
                baseDecision.shouldChange = true;
                baseDecision.targetPool = 1;
                console.log('Recommend changing to Phoenix');
            } else {
                console.log('Stay with Aquarius');
            }
            break;

        default:
            console.log('Unknown actualPool value:', actualPool);
    }

    return baseDecision;
}

async function main() {

    // const test = await getDataLast("CBKZSM5NS3JJ5C4OVQBXBIYPTNQAZIX7BGS62LA7VPBV6UBX734P6D6U7", "CDSEE7QX6NKWTQFZW4UJXHJKJKPMSMMZBPDGYBUWYYYM4XYJ3AHUNFTZ", "soroswap");
    // console.log('test =>', test);

    const secret = process.env.SECRET ?? '';
    if (!secret) {
        throw new Error('SECRET is required in environment');
    }


    const client = new FactoryClient(secret);

    console.log('RPC_URL:', process.env.RPC_URL ?? 'https://soroban-testnet.stellar.org');

    const poolCount = await client.get_pool_count();
    console.log('get_pool_count =>', poolCount.toString());

    const pools = [];

    for (let i = 1n; i <= poolCount; i++) {
        const pool = await client.get_pool_by_id(BigInt(i));
        console.log('get_pool_by_id(', i, ') =>', JSON.stringify(pool, null, 2));
        pools.push(pool);
    }

    // const clientLobster = new LobsterClient(secret, "CBD7QHOQLAWCBOJA2NJAGL23WCYGS7J322ASJHYTGP2G5YDZ56HDEDD4");
    // const actualPool = await clientLobster.get_active_protocol();
    // console.log('actualPool =>', actualPool);

    // const balanceInToken0 = await clientLobster.get_amounts_from_soroswap();

    // const tx = await balanceInToken0.simulate();



    // console.log(JSON.stringify(tx, null, 2));



    for (const pool of pools) {
        try {
            const clientLobster = new LobsterClient(secret, pool.lobster_address);

        //     let balance = await clientLobster.get_amounts_tokens();
        //     let balance0 = balance._value[0]._value._attributes.lo._value.toString();
        //     let balance1 = balance._value[1]._value._attributes.lo._value.toString();
        // console.log('balance0 =>', balance0);
        // console.log('balance1 =>', balance1);
        // return
            const actualPool = await clientLobster.get_active_protocol();
            console.log('actualPool =>', actualPool);


            const dataSoroswap = await getDataLast(pool.token0, pool.token1, "soroswap");

            const dataPhoenix = await getDataLast(pool.token0, pool.token1, "phoenix");

            const dataAquarius = await getDataLast(pool.token0, pool.token1, "aquarius");

            const poolAddresses = {
                soroswap: dataSoroswap.pooladdress,
                phoenix: dataPhoenix.pooladdress,
                aquarius: dataAquarius.pooladdress
            };

            let result;
            let balanceInToken0;
            let balanceInToken1;
            switch (actualPool) {
                case 0:
                    result = await clientLobster.get_amounts_from_soroswap({ pool_address: dataSoroswap.pooladdress });
                    balanceInToken0 = result._value[0]._value._attributes.lo._value.toString();
                    balanceInToken1 = result._value[1]._value._attributes.lo._value.toString();
                    break;
                case 1:
                    result = await clientLobster.get_amounts_from_phoenix({ pool_address: dataPhoenix.pooladdress });
                    balanceInToken0 = result._value[0]._value._attributes.lo._value.toString();
                    balanceInToken1 = result._value[1]._value._attributes.lo._value.toString();
                    break;
                case 2:
                    result = await clientLobster.get_amounts_from_aquarius({ pool_address: dataAquarius.pooladdress });
                    balanceInToken0 = result._value[0]._value._attributes.lo._value.toString();
                    balanceInToken1 = result._value[1]._value._attributes.lo._value.toString();
                    break;
                default:
                    console.error('Unknown actualPool value:', actualPool);
            }

            console.log('balanceInToken0 =>', balanceInToken0);
            console.log('balanceInToken1 =>', balanceInToken1);

            let get_price_token0: any = await getTokenPriceUSD(pool.token0, process.env.NETWORK as any ?? "mainnet");

            console.log('get_price_token0 =>', get_price_token0);
            let priceToken0 = get_price_token0[0]?.price ?? 0;

            let clientTokens = new TokenClient(secret, pool.token0);

            let query_decimals = await clientTokens.decimals();
            let decimal = query_decimals._value; //console.log('decimals =>', JSON.stringify(decimals._value, null, 2));



            if (priceToken0 == null) {
                get_price_token0 = await getTokenPriceUSD(pool.token0, process.env.NETWORK as any ?? "mainnet");
                priceToken0 = get_price_token0[0]?.price ?? 0;

                clientTokens = new TokenClient(secret, pool.token0);
                query_decimals = await clientTokens.decimals();
                decimal = query_decimals._value;
            }

            let value_position_token0 = priceToken0 * (balanceInToken0/10**decimal) * 2;

            console.log('value_position_token0 =>', value_position_token0);
            

            let decision = await compareAndDecidePool(dataSoroswap.last.aprList, dataPhoenix.last.aprList, dataAquarius.last.aprList, actualPool, 0.1, value_position_token0, 1);
            console.log('decision =>', JSON.stringify(decision, null, 2));

            const myDecision = {
                shouldChange: true,
                currentPool: actualPool,
                targetPool: 0,
            };

            if (myDecision.shouldChange) {
                await executePoolMigration(clientLobster, myDecision, actualPool, poolAddresses);
            }


            // const balance = await clientTokens.balance({ id: "CBZI3HVJFRUPVGOCPJIW6ILY5EGUL6LJH3UEQOBE7A2T4EKYDVBZMHOR" });
            // console.log('balance =>', JSON.stringify(balance._value._attributes.lo._value.toString(), null, 2));


        } catch (error) {
            console.error('Error getting active protocol for pool', pool.lobster_address, error);
        }
    }

    // for (const pool of pools) {
    //     try {
    //         const clientLobster = new LobsterClient(secret, pool.lobster_address);
    //         const actualPool = await clientLobster.get_active_protocol();

    //         const dataSoroswap = await getDataLast(pool.token0, pool.token1, "soroswap");

    //         const dataPhoenix = await getDataLast(pool.token0, pool.token1, "phoenix");

    //         const dataAquarius = await getDataLast(pool.token0, pool.token1, "aquarius");



    //     } catch (error) {
    //         console.error('Error getting active protocol for pool', pool.lobster_address, error);
    //     }
    // }
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});



