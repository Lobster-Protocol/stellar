import { RemoveLiquiditEntity, SwapEventEntity, AddLiquidityEventEntity, NewPairEventEntity, SyncEventEntity } from "../types";

import { SorobanEvent } from "@subql/types-stellar";
import { StrKey } from "@stellar/stellar-base";

import { postToAPI, safeDecodeAddress } from "../mappings/mappingHandlers";
import { randomUUID } from "crypto"; // Node 14+ has this built-in

// Soroswap event parser functions
// These handlers parse Soroban event maps into typed entities for Soroswap.
// Entities are keyed by transaction hash; some events update a previously created
// entity from the same transaction (e.g., swap direction/order fields).

// Interface for AddLiquidityEvent
export interface AddLiquidityEvent {
    token_a: string;         // Address of token_a
    token_b: string;         // Address of token_b
    pair: string;           // Address of the liquidity pair
    amount_a: string;        // Use string for BigInt-safe storage
    amount_b: string;
    liquidity: string;
    to: string;             // Address to receive liquidity tokens
}

// Interface for RemoveLiquidityEvent
export interface RemoveLiquidityEvent {
    token_a: string;         // Address of token_a
    token_b: string;         // Address of token_b
    pair: string;           // Address of the liquidity pair
    amount_a: string;        // Use string for BigInt-safe storage
    amount_b: string;
    liquidity: string;
    to: string;             // Address to receive liquidity tokens
}

// Interface for NewPairEvent
export interface NewPairEvent {
    token_0: string;         // Address of token_0
    token_1: string;         // Address of token_1
    pair: string;           // Address of the new pair
    new_pairs_length: string; // u32
}

interface ParsedSwapEvent {
    amounts: string[];
    path: string[];
    to: string;
}

// Handle remove liquidity event and persist to RemoveLiquiditEntity
export async function removeSoroswapEvent(event: SorobanEvent): Promise<void> {
    const value = event.value as any;
    const mapEntries = value._value;

    //logger.info(JSON.stringify(mapEntries, null, 2))


    const result: RemoveLiquidityEvent = {
        token_a: "",
        token_b: "",
        pair: "",
        amount_a: "",
        amount_b: "",
        liquidity: "",
        to: "",
    }

    for (const entry of mapEntries) {
        const keyBuf = entry._attributes.key._value;

        const key = Buffer.from(keyBuf).toString("utf8");

        logger.info(key)
        switch (key) {
            case "token_a":
                if (entry._attributes.val._value._arm == "contractId") {
                    result.token_a = (StrKey.encodeContract(entry._attributes.val._value._value));
                }else{
                    result.token_a = StrKey.encodeEd25519PublicKey(entry._attributes.val._value._value);
                }
                logger.info(result.token_a);

                break;

            case "token_b":
                if (entry._attributes.val._value._arm == "contractId") {
                    result.token_b = (StrKey.encodeContract(entry._attributes.val._value._value));
                }else{
                    result.token_b = StrKey.encodeEd25519PublicKey(entry._attributes.val._value._value);
                }
                logger.info(result.token_b);
                break;

            case "pair":
                if (entry._attributes.val._value._arm == "contractId") {
                    result.pair = (StrKey.encodeContract(entry._attributes.val._value._value));
                }else{
                    result.pair = StrKey.encodeEd25519PublicKey(entry._attributes.val._value._value);
                }
                logger.info(result.pair);

                break;

            case "amount_a":
                logger.info(entry._attributes.val._value._attributes.lo._value);
                result.amount_a = (entry._attributes.val._value._attributes.lo._value).toString();
                break;

            case "amount_b":
                logger.info(entry._attributes.val._value._attributes.lo._value);
                result.amount_b = (entry._attributes.val._value._attributes.lo._value).toString();
                break;

            case "liquidity":
                logger.info(entry._attributes.val._value._attributes.lo._value);
                result.liquidity = (entry._attributes.val._value._attributes.lo._value).toString();
                break;

            case "to":
                logger.info(safeDecodeAddress(entry._attributes.val._value._value._value));
                result.to = (safeDecodeAddress(entry._attributes.val._value._value._value));
                break;
        }

    }
    logger.info(JSON.stringify(result, null, 2))
    // Build ID = txHash-logIndex (unique per event)
    const id = `${event.transaction?.hash}`;
    //logger.info(`id: ${id}`)

    const entity = RemoveLiquiditEntity.create({
        id: id,
        contract: String(event.contractId ?? ""),
        token_0: result.token_a,
        token_1: result.token_b,
        pair: result.pair,
        amount_0: result.amount_a,
        amount_1: result.amount_b,
        liquidity: result.liquidity,
        to: result.to,
        block: (event.ledger?.sequence ?? 0).toString(),
        timestamp: (
            event.ledgerClosedAt
                ? Math.floor(new Date(event.ledgerClosedAt).getTime() / 1000)
                : 0
        ).toString()
    });
    //logger.info(JSON.stringify(entity, null, 2));
    await entity.save();

    await postToAPI("lobster.soroswap.withdraw", {
        block_number: event.ledger?.sequence,
        block_timestamp: event.ledgerClosedAt,
        chain_id: process.env.CHAIN_ID_NUM,
        content: entity,
        emitter: String(event.contractId ?? ""),
        tx: event.transaction?.hash,
      });
}

// Handle add liquidity event and persist to AddLiquidityEventEntity
export async function depositSoroswapEvent(event: SorobanEvent): Promise<void> {
    const value = event.value as any;
    const mapEntries = value._value;

    //logger.info(JSON.stringify(mapEntries, null, 2))


    const result: AddLiquidityEvent = {
        token_a: "",
        token_b: "",
        pair: "",
        amount_a: "",
        amount_b: "",
        liquidity: "",
        to: "",
    }

    for (const entry of mapEntries) {
        const keyBuf = entry._attributes.key._value;

        const key = Buffer.from(keyBuf).toString("utf8");

        logger.info(key)
        switch (key) {
            case "token_a":
                if (entry._attributes.val._value._arm == "contractId") {
                    result.token_a = (StrKey.encodeContract(entry._attributes.val._value._value));
                }else{
                    result.token_a = StrKey.encodeEd25519PublicKey(entry._attributes.val._value._value);
                }
                logger.info(result.token_a);
                break;

            case "token_b":
                if (entry._attributes.val._value._arm == "contractId") {
                    result.token_b = (StrKey.encodeContract(entry._attributes.val._value._value));
                }else{
                    result.token_b = StrKey.encodeEd25519PublicKey(entry._attributes.val._value._value);
                }
                logger.info(result.token_b);
                break;

            case "pair":
                if (entry._attributes.val._value._arm == "contractId") {
                    result.pair = (StrKey.encodeContract(entry._attributes.val._value._value));
                }else{
                    result.pair = StrKey.encodeEd25519PublicKey(entry._attributes.val._value._value);
                }
                logger.info(result.pair);
                break;

            case "amount_a":
                logger.info(entry._attributes.val._value._attributes.lo._value);
                result.amount_a = (entry._attributes.val._value._attributes.lo._value).toString();
                break;

            case "amount_b":
                logger.info(entry._attributes.val._value._attributes.lo._value);
                result.amount_b = (entry._attributes.val._value._attributes.lo._value).toString();
                break;

            case "liquidity":
                logger.info(entry._attributes.val._value._attributes.lo._value);
                result.liquidity = (entry._attributes.val._value._attributes.lo._value).toString();
                break;

            case "to":
                //logger.info(JSON.stringify(entry._attributes, null, 2))
                logger.info(safeDecodeAddress(entry._attributes.val._value._value._value));
                result.to = (safeDecodeAddress(entry._attributes.val._value._value._value));
                break;
        }

    }
    logger.info(JSON.stringify(result, null, 2))
    // Build ID = txHash-logIndex (unique per event)
    const id = `${event.transaction?.hash}`;
    //logger.info(`id: ${id}`)

    const entity = AddLiquidityEventEntity.create({
        id: id,
        contract: String(event.contractId ?? ""),
        token_0: result.token_a,
        token_1: result.token_b,
        pair: result.pair,
        amount_0: result.amount_a,
        amount_1: result.amount_b,
        liquidity: result.liquidity,
        to: result.to,
        block: (event.ledger?.sequence ?? 0).toString(),
        timestamp: (
            event.ledgerClosedAt
                ? Math.floor(new Date(event.ledgerClosedAt).getTime() / 1000)
                : 0
        ).toString()
    });
    //logger.info(JSON.stringify(entity, null, 2));
    await entity.save();

    await postToAPI("lobster.soroswap.deposit", {
        block_number: event.ledger?.sequence,
        block_timestamp: event.ledgerClosedAt,
        chain_id: process.env.CHAIN_ID_NUM,
        content: entity,
        emitter: String(event.contractId ?? ""),
        tx: event.transaction?.hash,
      });

    // const newPairData = await NewPairEventEntity.get(id);

    // if (!newPairData) {
    //     console.warn(`Pair entity not found for ${id}`);
    //     return;
    // }

    // newPairData.initial_0 = result.amount_a;
    // newPairData.initial_1 = result.amount_b;

    // await newPairData.save();


}

// Handle new pair event and persist to NewPairEventEntity
export async function newPairSoroswaoEvent(event: SorobanEvent): Promise<void> {

    const value = event.value as any;
    const mapEntries = value._value;
    // Using an object literal
    const result: NewPairEvent = {
        token_0: "",
        token_1: "",
        pair: "",
        new_pairs_length: "",
    };

    for (const entry of mapEntries) {
        const keyBuf = entry._attributes.key._value;

        const key = Buffer.from(keyBuf).toString("utf8");
        logger.info(key)
        switch (key) {
            case "token_0":
                if (entry._attributes.val._value._arm == "contractId") {
                    result.token_0 = (StrKey.encodeContract(entry._attributes.val._value._value));
                }else{
                    result.token_0 = StrKey.encodeEd25519PublicKey(entry._attributes.val._value._value);
                }
                logger.info(result.token_0);

                break;

            case "token_1":
                if (entry._attributes.val._value._arm == "contractId") {
                    result.token_1 = (StrKey.encodeContract(entry._attributes.val._value._value));
                }else{
                    result.token_1 = StrKey.encodeEd25519PublicKey(entry._attributes.val._value._value);
                }
                logger.info(result.token_1);
                break;

            case "pair":
                result.pair = StrKey.encodeContract(entry._attributes.val._value._value);
                logger.info(result.pair);
                break;

            case "new_pairs_length":
                logger.info('newPairsLength')
                logger.info(JSON.stringify(entry._attributes.val._value, null, 2))
                result.new_pairs_length = entry._attributes.val._value;
                break;
        }
    }
    logger.info(JSON.stringify(result, null, 2))
    // Build ID = txHash-logIndex (unique per event)
    const id = `${event.transaction?.hash}`;
    //logger.info(`id: ${id}`)

    const entity = NewPairEventEntity.create({
        id: id,
        contract: String(event.contractId ?? ""),
        token_0: result.token_0,
        token_1: result.token_1,
        pair: result.pair,
        new_pairs_length: result.new_pairs_length,
        creator: (event.transaction?.source_account ?? "").toString(),
        fees: "3",
        block: (event.ledger?.sequence ?? 0).toString(),
        timestamp: (
            event.ledgerClosedAt
                ? Math.floor(new Date(event.ledgerClosedAt).getTime() / 1000)
                : 0
        ).toString()
    });
    //logger.info(JSON.stringify(entity, null, 2));
    await entity.save();

    await postToAPI("lobster.soroswap.newpair", {
        block_number: event.ledger?.sequence,
        block_timestamp: event.ledgerClosedAt,
        chain_id: process.env.CHAIN_ID_NUM,
        content: entity,
        emitter: String(event.contractId ?? ""),
        tx: event.transaction?.hash,
      });
}

// Handle swap event part 1: amounts, path, and recipient
export async function swapSoroswapEvent(event: SorobanEvent): Promise<void> {
    // const blockHeight = event.ledger?.sequence;
    // const timestamp = event.ledgerClosedAt; // JS Date
    // const contracId = event.contractId;
    // logger.info(`Block height: ${blockHeight}`);
    // logger.info(`Timestamp: ${timestamp}`); 
    const value = event.value as any;
    //logger.info(`ContractID: ${contracId}`)
    //logger.info(JSON.stringify(value, null, 2));

    const mapEntries = value._value;
    //logger.info(JSON.stringify(mapEntries, null, 2))
    const result: ParsedSwapEvent = { amounts: [], path: [], to: "" };

    //logger.info(JSON.stringify(mapEntries[0], null, 2))

    for (const entry of mapEntries) {
        const keyBuf = entry._attributes.key._value;

        const key = Buffer.from(keyBuf).toString("utf8");
        logger.info(key)

        switch (key) {
            case "amounts":

                for (const val of entry._attributes.val._value) {

                    const lo = val._value._attributes.lo._value;
                    const value = BigInt(lo);
                    logger.info(value)
                    result.amounts.push(value.toString());
                }
                break;

            case "path":
                for (const addr of entry._attributes.val._value) {
                    logger.info(StrKey.encodeContract(addr._value._value));
                    result.path.push(StrKey.encodeContract(addr._value._value));
                }
                break;

            case "to":
                let to: string = safeDecodeAddress(entry._attributes.val._value._value)
                logger.info(to)
                result.to = to
                break;
        }

        logger.info(JSON.stringify(result, null, 2))
    }

    // Build ID = txHash-logIndex (unique per event)
    const id = `${event.transaction?.hash}`;
    //logger.info(`id: ${id}`)

    // const entity = await getOrCreateSwapEntity(event);

    // entity.sender = result.to;
    // entity.token_0 = result.path[0];
    // entity.token_1 = result.path[1];
    // entity.amount_0 = result.amounts[0];
    // entity.amount_1 = result.amounts[1];

    // if (entity.order_amount != "" && entity.order_token == "") {
    //     const [orderInStr, orderOutStr] = entity.order_amount.split("->");
    //     if (orderInStr === entity.amount_0 && orderOutStr === entity.amount_1) {
    //         entity.order_token = `${entity.token_0}->${entity.token_1}`;
    //         logger.info(`Order matches token0 -> token1 (${entity.order_token})`);
    //     } else {
    //         entity.order_token = `${entity.token_1}->${entity.token_0}`;
    //         logger.info(`Order matches token1 -> token0 (${entity.order_token})`);
    //     }
    // }

    // await entity.save();
}

export async function syncSoroswapEvent(event: SorobanEvent): Promise<void> {
    const value = event.value as any;

    const mapEntries = value._value;
    const result = { new_reserve_0: "", new_reserve_1: "" };


    for (const entry of mapEntries) {
        const keyBuf = entry._attributes.key._value;

        const key = Buffer.from(keyBuf).toString("utf8");
        logger.info(key)

        switch (key) {
            case "new_reserve_0":
                logger.info(entry._attributes.val._value._attributes.lo._value);
                result.new_reserve_0 = (entry._attributes.val._value._attributes.lo._value).toString();
                break;
            case "new_reserve_1":
                logger.info(entry._attributes.val._value._attributes.lo._value);
                result.new_reserve_1 = (entry._attributes.val._value._attributes.lo._value).toString();
                break;

        }
    }
    logger.info(JSON.stringify(result, null, 2));

    const existingPool = await NewPairEventEntity.getByFields([
        ["pair", "=", String(event.contractId ?? "")],
    ], { limit: 1 });

    if (existingPool.length === 0) {
        logger.info("Pool not found");
        return;
    }


    const entity = await SyncEventEntity.create({
        id: `${event.transaction?.hash}` + event.id,
        contract: String(event.contractId ?? ""),
        token_0: existingPool[0].token_0,
        token_1: existingPool[0].token_1,
        amount_0: result.new_reserve_0,
        amount_1: result.new_reserve_1,
        txHash: event.transaction?.hash ?? "",
        block: (event.ledger?.sequence ?? 0).toString(),
        timestamp: (
            event.ledgerClosedAt
                ? Math.floor(new Date(event.ledgerClosedAt).getTime() / 1000)
                : 0
        ).toString()
    });

    await entity.save();
}

// Handle swap event part 2: amounts in/out to derive order direction
export async function swapPairEvent(event: SorobanEvent): Promise<void> {
    // const blockHeight = event.ledger?.sequence;
    // const timestamp = event.ledgerClosedAt; // JS Date
    // const contracId = event.contractId;
    // logger.info(`Block height: ${blockHeight}`);
    // logger.info(`Timestamp: ${timestamp}`); 
    const value = event.value as any;
    //logger.info(`ContractID: ${contracId}`)
    //logger.info(JSON.stringify(value, null, 2));

    const mapEntries = value._value;
    //logger.info(JSON.stringify(mapEntries, null, 2))
    const result = {
        amount_0_in: "", amount_0_out: "", amount_1_in: "", amount_1_out: "", sell_token: "", buy_token: "", sell_amount: "", buy_amount: "", order_token: "", order_amount: "", reserve_before_a: "", reserve_before_b: "",
        reserve_after_a: "",
        reserve_after_b: "",
        amount_0: "",
        amount_1: "",
    };

    for (const entry of mapEntries) {
        const keyBuf = entry._attributes.key._value;

        const key = Buffer.from(keyBuf).toString("utf8");
        logger.info(key)

        switch (key) {
            case "amount_0_in":
                logger.info(entry._attributes.val._value._attributes.lo._value);
                result.amount_0_in = (entry._attributes.val._value._attributes.lo._value).toString();
                break;
            case "amount_0_out":
                logger.info(entry._attributes.val._value._attributes.lo._value);
                result.amount_0_out = (entry._attributes.val._value._attributes.lo._value).toString();
                break;
            case "amount_1_in":
                logger.info(entry._attributes.val._value._attributes.lo._value);
                result.amount_1_in = (entry._attributes.val._value._attributes.lo._value).toString();
                break;
            case "amount_1_out":
                logger.info(entry._attributes.val._value._attributes.lo._value);
                result.amount_1_out = (entry._attributes.val._value._attributes.lo._value).toString();
                break;
        }
    }


    const existingPool = await NewPairEventEntity.getByFields([
        ["pair", "=", String(event.contractId ?? "")],
    ], { limit: 1 });

    const existingSync = await SyncEventEntity.getByFields([
        ["block", "=", (event.ledger?.sequence ?? 0).toString()],
    ], { limit: 1 });

    if (existingPool.length === 0 || existingSync.length === 0) {
        logger.info("Pool or sync not found");
        return;
    }


    // Detect direction based on inputs
    if (Number(result.amount_0_in) > 0) {
        result.amount_0 = result.amount_0_in;
        result.amount_1 = result.amount_1_out;
        result.order_token = existingPool[0].token_0 + "->" + existingPool[0].token_1;
        result.order_amount = result.amount_0_in + "->" + result.amount_1_out;
        result.sell_amount = result.amount_0_in;
        result.buy_amount = result.amount_1_out;
        result.sell_token = existingPool[0].token_0;
        result.buy_token = existingPool[0].token_1;
        result.reserve_before_a = (BigInt(existingSync[0].amount_0) - BigInt(result.amount_0_in)).toString();
        result.reserve_before_b = (BigInt(existingSync[0].amount_1) + BigInt(result.amount_1_out)).toString();
        result.reserve_after_a = existingSync[0].amount_0;
        result.reserve_after_b = existingSync[0].amount_1;
    } else if (Number(result.amount_1_in) > 0) {
        result.amount_0 = result.amount_0_out;
        result.amount_1 = result.amount_1_in;
        result.order_token = existingPool[0].token_1 + "->" + existingPool[0].token_0;
        result.order_amount = result.amount_1_in + "->" + result.amount_0_out;
        result.sell_amount = result.amount_1_in;
        result.buy_amount = result.amount_0_out;
        result.sell_token = existingPool[0].token_1;
        result.buy_token = existingPool[0].token_0;
        result.reserve_before_a = (BigInt(existingSync[0].amount_0) + BigInt(result.amount_0_in)).toString();
        result.reserve_before_b = (BigInt(existingSync[0].amount_1) - BigInt(result.amount_1_out)).toString();
        result.reserve_after_a = existingSync[0].amount_0;
        result.reserve_after_b = existingSync[0].amount_1;
    }



    const entity = await SwapEventEntity.create({
        id: `${event.transaction?.hash}` + event.id,
        contract: String(event.contractId ?? ""),
        sender: "",
        token_0: existingPool[0].token_0,
        token_1: existingPool[0].token_1,
        amount_0: result.amount_0,
        amount_1: result.amount_1,
        sell_token: result.sell_token,
        buy_token: result.buy_token,
        sell_amount:result.sell_amount,
        buy_amount:result.buy_amount,
        reserve_before0: result.reserve_before_a,
        reserve_before1: result.reserve_before_b,
        reserve_after0: result.reserve_after_a,
        reserve_after1: result.reserve_after_b,
        order_token: result.order_token,
        order_amount: result.order_amount,
        block: (event.ledger?.sequence ?? 0).toString(),
        timestamp: (
            event.ledgerClosedAt
                ? Math.floor(new Date(event.ledgerClosedAt).getTime() / 1000)
                : 0
        ).toString()
    })

    await entity.save();

    await postToAPI("lobster.soroswap.swap", {
        block_number: event.ledger?.sequence,
        block_timestamp: event.ledgerClosedAt,
        chain_id: process.env.CHAIN_ID_NUM,
        content: entity,
        emitter: String(event.contractId ?? ""),
        tx: event.transaction?.hash,
      });

}


async function getOrCreateSwapEntity(event: SorobanEvent): Promise<SwapEventEntity> {
    const id = `${event.transaction?.hash}`;
    let entity = await SwapEventEntity.get(id);

    if (!entity) {
        entity = SwapEventEntity.create({
            id,
            contract: String(event.contractId ?? ""),
            sender: "",
            token_0: "",
            token_1: "",
            sell_token: "",
            buy_token: "",
            sell_amount: "",
            buy_amount: "",
            order_token: "",
            order_amount: "",
            reserve_before0: "",
            reserve_before1: "",
            reserve_after0: "",
            reserve_after1: "",
            block: (event.ledger?.sequence ?? 0).toString(),
            timestamp: (
                event.ledgerClosedAt
                    ? Math.floor(new Date(event.ledgerClosedAt).getTime() / 1000)
                    : 0
            ).toString(),
        });
    }

    return entity;
}