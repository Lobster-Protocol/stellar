import {
    StellarOperation,
    StellarEffect,
    SorobanEvent,
} from "@subql/types-stellar";

import { postToAPI, safeDecodeAddress } from "../mappings/mappingHandlers";
import { NewPairAquariusEntity } from "../types/models/NewPairAquariusEntity"
import { SwapAquariusEntity } from "../types/models/SwapAquariusEntity"
import { RemoveLiquidityAquariusEntity } from "../types/models/RemoveLiquidityAquariusEntity"
import { AddLiquidityAquariusEntity } from "../types/models/AddLiquidityAquariusEntity"
import { ReserveAquariusEntity } from "../types/models/ReserveAquariusEntity"
import { StrKey } from "@stellar/stellar-base";

import { getNatsService, initializeNats } from "../services";

//import fetch from "node-fetch";
//import http from "http";

// Aquarius event parser functions
// These handlers decode Soroban event values and topics into Aquarius entities.
// Each entity is keyed by transaction hash so that fragments in one tx are grouped.

export async function NewPairAquariusEvent(event: SorobanEvent): Promise<void> {
    // Parse pool creation: pool address, pool params, and token pair from topics
    const value = event.value as any;
    const mapEntries = value._value;

    //logger.info(JSON.stringify(mapEntries, null, 2));


    const result = {
        pool_address: StrKey.encodeContract(mapEntries[0]._value._value),
        pool_type: Buffer.from(mapEntries[1]._value).toString("utf8"),
        token_out: Buffer.from(mapEntries[2]._value).toString("utf8"),
        fee: (mapEntries[3]._value[0]._value._attributes.lo._value).toString(),
        amp: (mapEntries[3]._value[1]._value._attributes.lo._value).toString(),
        token_a: "",
        token_b: "",
        sender: "",
    }
    //logger.info(JSON.stringify(mapEntries[3]._value[0]._value._attributes, null, 2));
    logger.info(JSON.stringify(result, null, 2));

    const mytopics: any = event.topic;
    //logger.info(JSON.stringify(mytopics, null, 2));

    result.token_a = StrKey.encodeContract(mytopics[1]._value[0]._value._value);
    result.token_b = StrKey.encodeContract(mytopics[1]._value[1]._value._value);

    const entity = NewPairAquariusEntity.create({
        id: `${event.transaction?.hash}`,
        contract: String(event.contractId ?? ""),
        token_0: result.token_a,
        token_1: result.token_b,
        pair: result.pool_address,
        fees: result.fee,
        creator: result.sender,
        block: (event.ledger?.sequence ?? 0).toString(),
        timestamp: (
            event.ledgerClosedAt
                ? Math.floor(new Date(event.ledgerClosedAt).getTime() / 1000)
                : 0
        ).toString()
    });
    //logger.info(JSON.stringify(entity, null, 2));
    await entity.save();

    await postToAPI("lobster.aquarius.newpair", {
        block_number: event.ledger?.sequence,
        block_timestamp: event.ledgerClosedAt,
        chain_id: process.env.CHAIN_ID_NUM,
        content: entity,
        emitter: String(event.contractId ?? ""),
        tx: event.transaction?.hash,
      });


}

export async function DepositAquariusEvent(event: SorobanEvent): Promise<void> {
    // Parse add liquidity event, including pool id, token amounts, LP shares, and sender
    const value = event.value as any;
    const mapEntries = value._value;

    //logger.info(JSON.stringify(mapEntries, null, 2));

    const result = {
        pool_id: StrKey.encodeContract(mapEntries[0]._value._value),
        amount_0: (mapEntries[1]._value[0]._value._attributes.lo._value).toString(),
        amount_1: (mapEntries[1]._value[1]._value._attributes.lo._value).toString(),
        share_amount: (mapEntries[2]._value._attributes.lo._value).toString(),
        token_a: "",
        token_b: "",
        sender: "",
    }
    logger.info(JSON.stringify(result, null, 2));

    const mytopics: any = event.topic;
    //logger.info(JSON.stringify(mytopics, null, 2));

    result.token_a = StrKey.encodeContract(mytopics[1]._value[0]._value._value);
    result.token_b = StrKey.encodeContract(mytopics[1]._value[1]._value._value);
    result.sender = safeDecodeAddress(mytopics[2]._value._value._value);

    const entity = AddLiquidityAquariusEntity.create({
        id: `${event.transaction?.hash}`,
        contract: result.pool_id,
        token_0: result.token_a,
        token_1: result.token_b,
        amount_0: result.amount_0,
        amount_1: result.amount_1,
        pair: result.pool_id,
        liquidity: result.share_amount,
        sender: result.sender,
        block: (event.ledger?.sequence ?? 0).toString(),
        timestamp: (
            event.ledgerClosedAt
                ? Math.floor(new Date(event.ledgerClosedAt).getTime() / 1000)
                : 0
        ).toString()
    });
    //logger.info(JSON.stringify(entity, null, 2));
    await entity.save();

    await postToAPI("lobster.aquarius.deposit", {
        block_number: event.ledger?.sequence,
        block_timestamp: event.ledgerClosedAt,
        chain_id: process.env.CHAIN_ID_NUM,
        content: entity,
        emitter: String(event.contractId ?? ""),
        tx: event.transaction?.hash,
      });

}

export async function WithdrawAquariusEvent(event: SorobanEvent): Promise<void> {
    // Parse remove liquidity event, including returned amounts and sender
    const value = event.value as any;
    const mapEntries = value._value;

    //logger.info(JSON.stringify(mapEntries, null, 2));

    const result = {
        pool_id: StrKey.encodeContract(mapEntries[0]._value._value),
        amount_0: (mapEntries[1]._value[0]._value._attributes.lo._value).toString(),
        amount_1: (mapEntries[1]._value[1]._value._attributes.lo._value).toString(),
        share_amount: (mapEntries[2]._value._attributes.lo._value).toString(),
        token_a: "",
        token_b: "",
        sender: "",
    }
    logger.info(JSON.stringify(result, null, 2));

    const mytopics: any = event.topic;
    //logger.info(JSON.stringify(mytopics, null, 2));

    result.token_a = StrKey.encodeContract(mytopics[1]._value[0]._value._value);
    result.token_b = StrKey.encodeContract(mytopics[1]._value[1]._value._value);
    result.sender = safeDecodeAddress(mytopics[2]._value._value._value);

    const entity = RemoveLiquidityAquariusEntity.create({
        id: `${event.transaction?.hash}`,
        contract: result.pool_id,
        token_0: result.token_a,
        token_1: result.token_b,
        amount_0: result.amount_0,
        amount_1: result.amount_1,
        pair: result.pool_id,
        liquidity: result.share_amount,
        sender: result.sender,
        block: (event.ledger?.sequence ?? 0).toString(),
        timestamp: (
            event.ledgerClosedAt
                ? Math.floor(new Date(event.ledgerClosedAt).getTime() / 1000)
                : 0
        ).toString()
    });
    //logger.info(JSON.stringify(entity, null, 2));
    await entity.save();

    await postToAPI("lobster.aquarius.withdraw", {
        block_number: event.ledger?.sequence,
        block_timestamp: event.ledgerClosedAt,
        chain_id: process.env.CHAIN_ID_NUM,
        content: entity,
        emitter: String(event.contractId ?? ""),
        tx: event.transaction?.hash,
      });

}

export async function SwapAquariusEvent(event: SorobanEvent): Promise<void> {
    // Parse swap event including pool, token in/out and amounts, and sender
    const value = event.value as any;
    const mapEntries = value._value;

    //logger.info(JSON.stringify(mapEntries, null, 2))


    const result = {
        pool_id: StrKey.encodeContract(mapEntries[0]._value._value),
        token_in: StrKey.encodeContract(mapEntries[1]._value._value),
        token_out: StrKey.encodeContract(mapEntries[2]._value._value),
        amount_a: (mapEntries[3]._value._attributes.lo._value).toString(),
        amount_b: (mapEntries[4]._value._attributes.lo._value).toString(),
        token_a: "",
        token_b: "",
        sender: "",
        reserve_before_a: "",
        reserve_before_b: "",
        reserve_after_a: "",
        reserve_after_b: "",
    }

    //logger.info(JSON.stringify(result, null, 2));


    const mytopics: any = event.topic;
    //logger.info(JSON.stringify(mytopics, null, 2));

    result.token_a = StrKey.encodeContract(mytopics[1]._value[0]._value._value);
    result.token_b = StrKey.encodeContract(mytopics[1]._value[1]._value._value);
    result.sender = safeDecodeAddress(mytopics[2]._value._value._value);


    logger.info(JSON.stringify(result, null, 2));


    // const existingSwaps = await ReserveAquariusEntity.getByFields([
    //     ["contract", "=", result.pool_id],
    //     //["block", "=", result.token_b],
    //     ["txHash", "=", event.transaction?.hash ?? ""]
    //   ], {limit: 1});


    // if (existingSwaps.length != 0) {
    //     result.reserve_before_a = (Number(existingSwaps[0].amount_0) - Number(result.amount_a)).toString();
    //     result.reserve_before_b = (Number(existingSwaps[0].amount_1) - Number(result.amount_b)).toString();
    //     result.reserve_after_a = existingSwaps[0].amount_0;
    //     result.reserve_after_b = existingSwaps[0].amount_1;
    // }

    // const entity = SwapAquariusEntity.create({
    //     id: `${event.transaction?.hash}` +  event.id,
    //     contract: result.pool_id,
    //     token_0: result.token_a,
    //     token_1: result.token_b,
    //     amount_0: result.amount_a,
    //     amount_1: result.amount_b,
    //     order_token: result.token_in + "->" + result.token_out,
    //     order_amount: result.amount_a + "->" + result.amount_b,
    //     reserve_before0: result.reserve_before_a,
    //     reserve_before1: result.reserve_before_b,
    //     reserve_after0: result.reserve_after_a,
    //     reserve_after1: result.reserve_after_b,
    //     sender: result.sender,
    //     block: (event.ledger?.sequence ?? 0).toString(),
    //     timestamp: (
    //         event.ledgerClosedAt
    //             ? Math.floor(new Date(event.ledgerClosedAt).getTime() / 1000)
    //             : 0
    //     ).toString()
    // });
    //logger.info(JSON.stringify(entity, null, 2));
    //await entity.save();

    // await postToAPI("lobster.aquarius.swap", {
    //     block_number: event.ledger?.sequence,
    //     block_timestamp: event.ledgerClosedAt,
    //     chain_id: process.env.CHAIN_ID_NUM,
    //     content: entity,
    //     emitter: String(event.contractId ?? ""),
    //     tx: event.transaction?.hash,
    //   });


}



export async function TradeAquariusEvent(event: SorobanEvent): Promise<void> {
    const existingPair = await NewPairAquariusEntity.getByFields([
        ["pair", "=", String(event.contractId ?? "")],
      ], {limit: 1});

      //logger.info(JSON.stringify(existingPair, null, 2));


    // Parse remove liquidity event, including returned amounts and sender
    const value = event.value as any;
    const mapEntries = value._value;


    const result = {
        sold_amount: (mapEntries[0]._value._attributes.lo._value).toString(),
        bought_amount: (mapEntries[1]._value._attributes.lo._value).toString(),
        fee: (mapEntries[2]._value._attributes.lo._value).toString(),
        sell_token: "",
        buy_token: "",
        token_a: "",
        token_b: "",
        amount_0: "",
        amount_1: "",
        sender: "",
    }
    //logger.info(JSON.stringify(result, null, 2));

    const mytopics: any = event.topic;
    //logger.info(JSON.stringify(mytopics, null, 2));

    result.sell_token = StrKey.encodeContract(mytopics[1]._value._value);
    result.buy_token = StrKey.encodeContract(mytopics[2]._value._value);
    result.sender = safeDecodeAddress(mytopics[3]._value._value);

    if (result.sell_token == existingPair[0].token_0) {
        result.amount_0 = result.sold_amount;
        result.amount_1 = result.bought_amount;
    }
    else {
        result.amount_0 = result.bought_amount;
        result.amount_1 = result.sold_amount;
    }
    




    const entity = SwapAquariusEntity.create({
        id: `${event.transaction?.hash}` +  event.id,
        contract: String(event.contractId ?? ""),
        token_0: existingPair[0].token_0 ?? "",
        token_1: existingPair[0].token_1 ?? "",
        amount_0: result.amount_0,
        amount_1: result.amount_1,
        fee: result.fee,
        sell_token: result.sell_token,
        buy_token: result.buy_token,
        sell_amount: result.sold_amount,
        buy_amount: result.bought_amount,
        order_token: result.sell_token + "->" + result.buy_token,
        order_amount: result.sold_amount + "->" + result.bought_amount,
        reserve_before0: "",
        reserve_before1: "",
        reserve_after0: "",
        reserve_after1: "",
        sender: result.sender,
        txHash: event.transaction?.hash ?? "",
        block: (event.ledger?.sequence ?? 0).toString(),
        timestamp: (
            event.ledgerClosedAt
                ? Math.floor(new Date(event.ledgerClosedAt).getTime() / 1000)
                : 0
        ).toString()
    });
    //logger.info(JSON.stringify(entity, null, 2));
    await entity.save();

}


export async function UpdateReservesAquariusEvent(event: SorobanEvent): Promise<void> {
    const existingPair = await NewPairAquariusEntity.getByFields([
        ["pair", "=", String(event.contractId ?? "")],
      ], {limit: 1});

    const existingTrade = await SwapAquariusEntity.getByFields([
        ["contract", "=", String(event.contractId ?? "")],
        ["txHash", "=", event.transaction?.hash ?? ""],
      ], {limit: 1});

    //   logger.info(JSON.stringify(existingTrade, null, 2));
    //   logger.info(JSON.stringify(existingPair, null, 2));

    if (existingTrade.length == 0 && existingPair.length == 0) {
        return;
    }

        const value = event.value as any;
        const mapEntries = value._value;

        const result = {
            reserve_a: (mapEntries[0]._value._attributes.lo._value).toString(),
            reserve_b: (mapEntries[1]._value._attributes.lo._value).toString(),
            contract: String(event.contractId ?? ""),
            block: (event.ledger?.sequence ?? 0).toString(),
            timestamp: (
                event.ledgerClosedAt
                    ? Math.floor(new Date(event.ledgerClosedAt).getTime() / 1000)
                    : 0
            ).toString()
        }
        //logger.info(JSON.stringify(result, null, 2));

        existingTrade[0].reserve_after0 = result.reserve_a;
        existingTrade[0].reserve_after1 = result.reserve_b;

        
        if (existingTrade[0].sell_amount == existingPair[0].token_0) {
            existingTrade[0].reserve_before0 = (Number(existingTrade[0].reserve_after0) - Number(existingTrade[0].sell_amount) + Number(existingPair[0].fees)).toString();
            existingTrade[0].reserve_before1 = (Number(existingTrade[0].reserve_after1) + Number(existingTrade[0].buy_amount)).toString();
        } else {
            existingTrade[0].reserve_before0 = (Number(existingTrade[0].reserve_after0) + Number(existingTrade[0].buy_amount)).toString();
            existingTrade[0].reserve_before1 = (Number(existingTrade[0].reserve_after1) - Number(existingTrade[0].sell_amount) + Number(existingPair[0].fees)).toString();
        }

        await existingTrade[0].save();

        await postToAPI("lobster.aquarius.swap", {
        block_number: event.ledger?.sequence,
        block_timestamp: event.ledgerClosedAt,
        chain_id: process.env.CHAIN_ID_NUM,
        content: existingTrade[0],
        emitter: String(event.contractId ?? ""),
        tx: event.transaction?.hash,
      });


        const entity = ReserveAquariusEntity.create({
            id: `${event.transaction?.hash}` +  event.id,
            contract: result.contract,
            amount_0: result.reserve_a,
            amount_1: result.reserve_b,
            txHash: event.transaction?.hash ?? "",
            block: result.block,
            timestamp: result.timestamp
        });
        await entity.save();
    
}



// async function callHttpApi(url: string): Promise<string> {
//     return new Promise((resolve, reject) => {
//       http.get(url, (res) => {
//         let data = "";
  
//         res.on("data", (chunk) => {
//           data += chunk;
//         });
  
//         res.on("end", () => {
//           resolve(data);
//         });
  
//       }).on("error", (err) => {
//         reject(err);
//       });
//     });
//   }

//[18783584114, 7646793783, 9391793]
//[2376764152126, 5851219330032]

//[18935446017, 7659121599, 9467724]
//[2369105030527, 5870145308326]