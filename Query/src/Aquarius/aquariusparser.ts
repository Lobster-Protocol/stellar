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

import { aquariusPools as aquariusPoolsTestnet } from "../pool_repertory/aquarius_pools_testnet";
import { aquariusPools as aquariusPoolsMainnet } from "../pool_repertory/aquarius_pools";


function getAquariusPoolTokens(poolAddress: string): { token_0: string; token_1: string } | null {
    const NETWORK = process.env.NETWORK || 'testnet'; // mainnet

    const pools = NETWORK === 'testnet' ? aquariusPoolsTestnet : aquariusPoolsMainnet;

    const pool = pools.find(p => p.pool_address === poolAddress);

    if (pool) {
        return {
            token_0: pool.token_a,
            token_1: pool.token_b
        };
    }

    return null;
}

export async function NewPairAquariusEvent(event: SorobanEvent): Promise<void> {
    try {
        const value = event.value as any;
        const mapEntries = value?._value;

        if (!mapEntries || !Array.isArray(mapEntries) || mapEntries.length < 4) {
            logger.warn(`NewPairAquariusEvent: Invalid mapEntries for event ${event.id}`);
            return;
        }


        const result = {
            pool_address: mapEntries[0]?._value?._value ? StrKey.encodeContract(mapEntries[0]._value._value) : "",
            pool_type: mapEntries[1]?._value ? Buffer.from(mapEntries[1]._value).toString("utf8") : "",
            token_out: mapEntries[2]?._value ? Buffer.from(mapEntries[2]._value).toString("utf8") : "",
            fee: (mapEntries[3]?._value?.[0]?._value ?? 0).toString(),
            amp: (mapEntries[3]?._value?.[1]?._value?._attributes?.lo?._value ?? 0).toString(),
            token_a: "",
            token_b: "",
            sender: "",
        }

        const mytopics: any = event.topic;

        if (mytopics?.[1]?._value?.[0]?._value?._value) {
            result.token_a = StrKey.encodeContract(mytopics[1]._value[0]._value._value);
        }
        if (mytopics?.[1]?._value?.[1]?._value?._value) {
            result.token_b = StrKey.encodeContract(mytopics[1]._value[1]._value._value);
        }

        const entity = NewPairAquariusEntity.create({
            id: `${event.transaction?.hash ?? ""}${event.id ?? ""}`,
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
        logger.info(JSON.stringify(entity, null, 2));
        await entity.save();

        await postToAPI("lobster.aquarius.newpair", {
            block_number: event.ledger?.sequence,
            block_timestamp: event.ledgerClosedAt,
            chain_id: process.env.CHAIN_ID_NUM,
            content: entity,
            emitter: String(event.contractId ?? ""),
            tx: event.transaction?.hash,
        });
    } catch (error) {
        logger.error(`Error in NewPairAquariusEvent for event ${event.id}: ${error}`);
    }
}

export async function DepositAquariusEvent(event: SorobanEvent): Promise<void> {
    try {
        const value = event.value as any;
        const mapEntries = value?._value;

        if (!mapEntries || !Array.isArray(mapEntries) || mapEntries.length < 3) {
            logger.warn(`DepositAquariusEvent: Invalid mapEntries for event ${event.id}`);
            return;
        }

        const result = {
            pool_id: mapEntries[0]?._value?._value ? StrKey.encodeContract(mapEntries[0]._value._value) : "",
            amount_0: (mapEntries[1]?._value?.[0]?._value?._attributes?.lo?._value ?? 0).toString(),
            amount_1: (mapEntries[1]?._value?.[1]?._value?._attributes?.lo?._value ?? 0).toString(),
            share_amount: (mapEntries[2]?._value?._attributes?.lo?._value ?? 0).toString(),
            token_a: "",
            token_b: "",
            sender: "",
        }
        logger.info(JSON.stringify(result, null, 2));

        const mytopics: any = event.topic;

        if (mytopics?.[1]?._value?.[0]?._value?._value) {
            result.token_a = StrKey.encodeContract(mytopics[1]._value[0]._value._value);
        }
        if (mytopics?.[1]?._value?.[1]?._value?._value) {
            result.token_b = StrKey.encodeContract(mytopics[1]._value[1]._value._value);
        }
        if (mytopics?.[2]?._value?._value?._value) {
            result.sender = safeDecodeAddress(mytopics[2]._value._value._value);
        }

        const entity = AddLiquidityAquariusEntity.create({
            id: `${event.transaction?.hash ?? ""}${event.id ?? ""}`,
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
        await entity.save();

        await postToAPI("lobster.aquarius.deposit", {
            block_number: event.ledger?.sequence,
            block_timestamp: event.ledgerClosedAt,
            chain_id: process.env.CHAIN_ID_NUM,
            content: entity,
            emitter: String(event.contractId ?? ""),
            tx: event.transaction?.hash,
        });
    } catch (error) {
        logger.error(`Error in DepositAquariusEvent for event ${event.id}: ${error}`);
    }
}

export async function WithdrawAquariusEvent(event: SorobanEvent): Promise<void> {
    try {
        const value = event.value as any;
        const mapEntries = value?._value;

        if (!mapEntries || !Array.isArray(mapEntries) || mapEntries.length < 3) {
            logger.warn(`WithdrawAquariusEvent: Invalid mapEntries for event ${event.id}`);
            return;
        }

        const result = {
            pool_id: mapEntries[0]?._value?._value ? StrKey.encodeContract(mapEntries[0]._value._value) : "",
            amount_0: (mapEntries[1]?._value?.[0]?._value?._attributes?.lo?._value ?? 0).toString(),
            amount_1: (mapEntries[1]?._value?.[1]?._value?._attributes?.lo?._value ?? 0).toString(),
            share_amount: (mapEntries[2]?._value?._attributes?.lo?._value ?? 0).toString(),
            token_a: "",
            token_b: "",
            sender: "",
        }
        logger.info(JSON.stringify(result, null, 2));

        const mytopics: any = event.topic;

        if (mytopics?.[1]?._value?.[0]?._value?._value) {
            result.token_a = StrKey.encodeContract(mytopics[1]._value[0]._value._value);
        }
        if (mytopics?.[1]?._value?.[1]?._value?._value) {
            result.token_b = StrKey.encodeContract(mytopics[1]._value[1]._value._value);
        }
        if (mytopics?.[2]?._value?._value?._value) {
            result.sender = safeDecodeAddress(mytopics[2]._value._value._value);
        }

        const entity = RemoveLiquidityAquariusEntity.create({
            id: `${event.transaction?.hash ?? ""}${event.id ?? ""}`,
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
        await entity.save();

        await postToAPI("lobster.aquarius.withdraw", {
            block_number: event.ledger?.sequence,
            block_timestamp: event.ledgerClosedAt,
            chain_id: process.env.CHAIN_ID_NUM,
            content: entity,
            emitter: String(event.contractId ?? ""),
            tx: event.transaction?.hash,
        });
    } catch (error) {
        logger.error(`Error in WithdrawAquariusEvent for event ${event.id}: ${error}`);
    }
}



export async function TradeAquariusEvent(event: SorobanEvent): Promise<void> {
    try {
        const existingPair = await NewPairAquariusEntity.getByFields([
            ["pair", "=", String(event.contractId ?? "")],
        ], { limit: 1 });

        let fallbackPair: { token_0: string; token_1: string } | null = null;

        if (existingPair.length === 0) {
            logger.warn(`TradeAquariusEvent: No pair found for contract ${event.contractId} in event ${event.id}, checking repository...`);

            const poolAddress = String(event.contractId ?? "");
            fallbackPair = getAquariusPoolTokens(poolAddress);

            if (!fallbackPair) {
                logger.warn(`TradeAquariusEvent: Pool not found in repository either for ${poolAddress}`);
                return;
            }
        }


        const value = event.value as any;
        const mapEntries = value?._value;

        if (!mapEntries || !Array.isArray(mapEntries) || mapEntries.length < 3) {
            logger.warn(`TradeAquariusEvent: Invalid mapEntries for event ${event.id}`);
            return;
        }


        const result = {
            sold_amount: (mapEntries[0]?._value?._attributes?.lo?._value ?? 0).toString(),
            bought_amount: (mapEntries[1]?._value?._attributes?.lo?._value ?? 0).toString(),
            fee: (mapEntries[2]?._value?._attributes?.lo?._value ?? 0).toString(),
            sell_token: "",
            buy_token: "",
            token_a: existingPair.length > 0 ? (existingPair[0]?.token_0 ?? "") : (fallbackPair?.token_0 ?? ""),
            token_b: existingPair.length > 0 ? (existingPair[0]?.token_1 ?? "") : (fallbackPair?.token_1 ?? ""),
            amount_0: "",
            amount_1: "",
            sender: "",
        }

        const mytopics: any = event.topic;

        if (mytopics?.[1]?._value?._value) {
            result.sell_token = StrKey.encodeContract(mytopics[1]._value._value);
        }
        if (mytopics?.[2]?._value?._value) {
            result.buy_token = StrKey.encodeContract(mytopics[2]._value._value);
        }
        if (mytopics?.[3]?._value?._value?._value) {
            result.sender = safeDecodeAddress(mytopics[3]._value._value._value);
        }

        if (result.sell_token && existingPair[0]?.token_0 && result.sell_token == existingPair[0].token_0) {
            result.amount_0 = result.sold_amount;
            result.amount_1 = result.bought_amount;
        }
        else {
            result.amount_0 = result.bought_amount;
            result.amount_1 = result.sold_amount;
        }





        const entity = SwapAquariusEntity.create({
            id: `${event.transaction?.hash ?? ""}${event.id ?? ""}`,
            contract: String(event.contractId ?? ""),
            token_0: existingPair[0]?.token_0 ?? "",
            token_1: existingPair[0]?.token_1 ?? "",
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
        await entity.save();
    } catch (error) {
        logger.error(`Error in TradeAquariusEvent for event ${event.id}: ${error}`);
    }
}


export async function UpdateReservesAquariusEvent(event: SorobanEvent): Promise<void> {
    try {
        const poolAddress = String(event.contractId ?? "");
        
        const existingPair = await NewPairAquariusEntity.getByFields([
            ["pair", "=", poolAddress],
        ], { limit: 1 });

        // Pools created before START_BLOCK have no NewPair entity; fall back to pool_repertory
        let poolTokens: { token_0: string; token_1: string } | null = null;
        
        if (existingPair.length > 0) {
            poolTokens = {
                token_0: existingPair[0]?.token_0 ?? "",
                token_1: existingPair[0]?.token_1 ?? ""
            };
        } else {
            logger.warn(`UpdateReservesAquariusEvent: No pair found for contract ${poolAddress} in event ${event.id}, checking repository...`);
            poolTokens = getAquariusPoolTokens(poolAddress);
            
            if (!poolTokens) {
                logger.warn(`UpdateReservesAquariusEvent: Pool not found in repository either for ${poolAddress}`);
                return;
            }
        }


        // event.id is "<ledger>-<event index>", e.g. "0007139820488888320-0000000002"
        const eventIdParts = String(event.id ?? "").split('-');
        let previousEventId: string;

        if (eventIdParts.length === 2) {
            const ledger = eventIdParts[0];
            const eventIndex = parseInt(eventIdParts[1], 10);
            if (isNaN(eventIndex) || eventIndex <= 0) {
                logger.warn(`UpdateReservesAquariusEvent: Invalid event index in event.id ${event.id}`);
                return;
            }
            const previousEventIndex = eventIndex - 1;

            // Reconstruct with same padding (assuming 10 digits for event index)
            const paddedPreviousIndex = previousEventIndex.toString().padStart(10, '0');
            previousEventId = `${ledger}-${paddedPreviousIndex}`;
        } else {
            // Fallback: if format is unexpected, try to parse as number
            const currentEventId = typeof event.id === 'string' ? parseInt(event.id, 10) : (event.id ?? 0);
            if (isNaN(currentEventId) || currentEventId <= 0) {
                logger.warn(`UpdateReservesAquariusEvent: Cannot parse event.id ${event.id}`);
                return;
            }
            previousEventId = (currentEventId - 1).toString();
        }

        // Construct the trade entity ID using the same pattern as TradeAquariusEvent
        const tradeEntityId = `${event.transaction?.hash ?? ""}${previousEventId}`;

        logger.info(tradeEntityId);


        const existingTrade = await SwapAquariusEntity.getByFields([
            ["contract", "=", String(event.contractId ?? "")],
            ["txHash", "=", `${event.transaction?.hash ?? ""}${previousEventId}`],
        ], { limit: 1 });

        if (existingTrade.length == 0) {
            return;
        }

        const value = event.value as any;
        const mapEntries = value?._value;

        if (!mapEntries || !Array.isArray(mapEntries) || mapEntries.length < 2) {
            logger.warn(`UpdateReservesAquariusEvent: Invalid mapEntries for event ${event.id}`);
            return;
        }

        const result = {
            reserve_a: (mapEntries[0]?._value?._attributes?.lo?._value ?? 0).toString(),
            reserve_b: (mapEntries[1]?._value?._attributes?.lo?._value ?? 0).toString(),
            contract: String(event.contractId ?? ""),
            block: (event.ledger?.sequence ?? 0).toString(),
            timestamp: (
                event.ledgerClosedAt
                    ? Math.floor(new Date(event.ledgerClosedAt).getTime() / 1000)
                    : 0
            ).toString()
        }

        if (existingTrade.length > 0 && existingTrade[0]) {
            existingTrade[0].reserve_after0 = result.reserve_a;
            existingTrade[0].reserve_after1 = result.reserve_b;


            if (poolTokens && existingTrade[0].sell_token == poolTokens.token_0) {
                existingTrade[0].reserve_before0 = (Number(existingTrade[0].reserve_after0) - Number(existingTrade[0].sell_amount ?? 0)).toString();
                existingTrade[0].reserve_before1 = (Number(existingTrade[0].reserve_after1) + Number(existingTrade[0].buy_amount ?? 0)).toString();
            } else {
                existingTrade[0].reserve_before0 = (Number(existingTrade[0].reserve_after0) + Number(existingTrade[0].buy_amount ?? 0)).toString();
                existingTrade[0].reserve_before1 = (Number(existingTrade[0].reserve_after1) - Number(existingTrade[0].sell_amount ?? 0)).toString();
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
        }


        const entity = ReserveAquariusEntity.create({
            id: `${event.transaction?.hash ?? ""}${event.id ?? ""}`,
            contract: result.contract,
            amount_0: result.reserve_a,
            amount_1: result.reserve_b,
            txHash: event.transaction?.hash ?? "",
            block: result.block,
            timestamp: result.timestamp
        });
        await entity.save();
    } catch (error) {
        logger.error(`Error in UpdateReservesAquariusEvent for event ${event.id}: ${error}`);
    }
}
