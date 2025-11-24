import 'dotenv/config';
import { FactoryClient } from '../../bindings/factoryClient.js';
import { LobsterClient } from '../../bindings/lobsterClient.js';

import {
    Keypair,
    Networks,
    Operation,
    TransactionBuilder,
    BASE_FEE,
    xdr,
    StrKey,
    rpc
} from '@stellar/stellar-sdk';
import {
    rpc as StellarRpc
} from '@stellar/stellar-sdk';
import { TokenClient } from '../../bindings/tokenClient.js';

import { getDataLast, getTokenPriceUSD, compareAndDecidePool, executePoolMigration } from '../services/analysis/poolAnalyzer.js';



async function main() {

    // const test = await getDataLast("CBKZSM5NS3JJ5C4OVQBXBIYPTNQAZIX7BGS62LA7VPBV6UBX734P6D6U7", "CDSEE7QX6NKWTQFZW4UJXHJKJKPMSMMZBPDGYBUWYYYM4XYJ3AHUNFTZ", "soroswap");
    // console.log('test =>', test);

    const secret = process.env.SECRET ?? '';
    if (!secret) {
        throw new Error('SECRET is required in environment');
    }


    const client = new FactoryClient(secret, process.env.FACTORY_ID ?? '');

    console.log('RPC_URL:', process.env.RPC_URL ?? 'https://soroban-testnet.stellar.org');

    const poolCount = await client.get_pool_count();
    console.log('get_pool_count =>', poolCount.toString());

    const rpcUrl = process.env.RPC_URL ?? "https://soroban-testnet.stellar.org";

    const server = new rpc.Server(rpcUrl, {
        allowHttp: rpcUrl.startsWith("http://"),
      });

    const currentLedger = await server.getLatestLedger();
    console.log('currentLedger =>', currentLedger.sequence.toString());


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



