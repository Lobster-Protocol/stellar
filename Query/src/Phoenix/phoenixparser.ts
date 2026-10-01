import { SorobanEvent } from "@subql/types-stellar";

import { safeDecodeAddress } from "../mappings/mappingHandlers";

import { NewPairPhoenixEntity } from "../types/models/NewPairPhoenixEntity";
import { AddLiquidityPhoenixEntity } from "../types/models/AddLiquidityPhoenixEntity";
import { RemoveLiquidityPhoenixEntity } from "../types/models/RemoveLiquidityPhoenixEntity";
import { SwapPhoenixEntity } from "../types/models/SwapPhoenixEntity";

import { xdr, scValToNative, StrKey } from "@stellar/stellar-base";
import * as https from 'https';
import { postToAPI } from "../mappings/mappingHandlers";

import { phoenixPools as phoenixPoolsTestnet } from "../pool_repertory/phoenix_pools_testnet";
import { phoenixPools as phoenixPoolsMainnet } from "../pool_repertory/phoenix_pools";

function getPhoenixPoolTokens(poolAddress: string): { token_0: string; token_1: string } | null {
  const NETWORK = process.env.NETWORK || 'testnet'; // mainnet

  const pools = NETWORK === 'testnet' ? phoenixPoolsTestnet : phoenixPoolsMainnet;

  const pool = pools.find(p => p.pool_address === poolAddress);

  if (pool) {
      return {
          token_0: pool.token_a,
          token_1: pool.token_b
      };
  }

  return null;
}


function httpsJson(hostname: string, path: string, method: 'GET' | 'POST' = 'GET', headers: any = {}, body?: string): Promise<any> {
  return new Promise((resolve) => {
    const req = https.request({ hostname, port: 443, path, method, headers: { 'User-Agent': 'SubQuery/1.0', 'Accept': 'application/json', ...headers } }, res => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    if (body) req.write(body);
    req.end();
  });
}
const HORIZON = process.env.HORIZON_ENDPOINT || 'https://horizon-testnet.stellar.org';

export async function fetchTxResultMetaB64(txHash: string): Promise<string | null> {
  try {
    const r = await fetch(`${HORIZON}/transactions/${txHash}`);
    if (r.ok) {
      const j: any = await r.json();
      const b64 = j?.result_meta_xdr;
      if (typeof b64 === 'string' && b64.length > 8) return b64;
    }
  } catch { }

  return null;
}

export function parseTransactionMeta(b64: string): xdr.TransactionMeta | null {
  try {
    return xdr.TransactionMeta.fromXDR(b64, 'base64');
  } catch {
    return null;
  }
}

// Each handler below sets one field on the entity shared by the events of its transaction
async function getOrCreateNewPairEntity(event: SorobanEvent): Promise<NewPairPhoenixEntity> {
  const id = `${event.transaction?.hash}`;
  let entity = await NewPairPhoenixEntity.get(id);

  if (!entity) {
    entity = NewPairPhoenixEntity.create({
      id,
      contract: String(event.contractId ?? ""),
      token_0: "",
      token_1: "",
      pair: "",
      initial_0: "",
      initial_1: "",
      fees: "",
      creator: (event.transaction?.source_account ?? "").toString(),
      staking_contract: "",
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

export async function NewPairPhoenixTokenAEvent(event: SorobanEvent): Promise<void> {
  try {
    const value = event.value as any;

    const mapEntries = value?._value?._value;
    if (!mapEntries) {
      logger.warn(`NewPairPhoenixTokenAEvent: Missing mapEntries for event ${event.id}`);
      return;
    }

    const token_a = StrKey.encodeContract(mapEntries);

    logger.info(`TokenA: ${token_a}`);

    const entity = await getOrCreateNewPairEntity(event);
    entity.token_0 = token_a;

    await entity.save();
  } catch (error) {
    logger.error(`Error in NewPairPhoenixTokenAEvent for event ${event.id}: ${error}`);
  }
}

export async function NewPairPhoenixTokenBEvent(event: SorobanEvent): Promise<void> {
  try {
    const value = event.value as any;

    const mapEntries = value?._value?._value;
    if (!mapEntries) {
      logger.warn(`NewPairPhoenixTokenBEvent: Missing mapEntries for event ${event.id}`);
      return;
    }

    const token_b = StrKey.encodeContract(mapEntries);

    logger.info(`TokenB: ${token_b}`);

    const entity = await getOrCreateNewPairEntity(event);
    entity.token_1 = token_b;

    await entity.save();
  } catch (error) {
    logger.error(`Error in NewPairPhoenixTokenBEvent for event ${event.id}: ${error}`);
  }
}
export async function NewPairPhoenixEvent(event: SorobanEvent): Promise<void> {
  try {
    const topics = event.topic

    const value = event.value as any;

    const mapEntries = value?._value?._value;
    if (!mapEntries) {
      logger.warn(`NewPairPhoenixEvent: Missing mapEntries for event ${event.id}`);
      return;
    }

    const pair = StrKey.encodeContract(mapEntries);

    logger.info(`Pair: ${pair}`);

    const entity = await getOrCreateNewPairEntity(event);
    entity.pair = pair;

    await entity.save();

    await postToAPI("lobster.phoenix.newpair", {
      block_number: event.ledger?.sequence,
      block_timestamp: event.ledgerClosedAt,
      chain_id: process.env.CHAIN_ID_NUM,
      content: entity,
      emitter: String(event.contractId ?? ""),
      tx: event.transaction?.hash,
    });
  } catch (error) {
    logger.error(`Error in NewPairPhoenixEvent for event ${event.id}: ${error}`);
  }
}

export async function StackingTokenContractPhoenixTokenBEvent(event: SorobanEvent): Promise<void> {
  try {
    const value = event.value as any;

    const mapEntries = value?._value?._value;
    if (!mapEntries) {
      logger.warn(`StackingTokenContractPhoenixTokenBEvent: Missing mapEntries for event ${event.id}`);
      return;
    }

    const stakingContract = StrKey.encodeContract(mapEntries);

    logger.info(`StakingContract: ${stakingContract}`);

    const entity = await getOrCreateNewPairEntity(event);
    entity.creator = stakingContract;

    await entity.save();
  } catch (error) {
    logger.error(`Error in StackingTokenContractPhoenixTokenBEvent for event ${event.id}: ${error}`);
  }
}


async function getOrCreateDepositEntity(event: SorobanEvent): Promise<AddLiquidityPhoenixEntity> {
  const id = `${event.transaction?.hash ?? ""}${event.contractId ?? ""}`;
  let entity = await AddLiquidityPhoenixEntity.get(id);

  if (!entity) {
    entity = AddLiquidityPhoenixEntity.create({
      id,
      contract: String(event.contractId ?? ""),
      sender: "",
      token_0: "",
      token_1: "",
      pair: "",
      amount_0: "",
      amount_1: "",
      liquidity: "",
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
export async function DepositSenderPhoenixEvent(event: SorobanEvent): Promise<void> {
  try {
    const value = event.value as any;

    let sender = "";

    if (value?._value?._value?._arm == "ed25519") {
      if (value?._value?._value?._value) {
        sender = StrKey.encodeEd25519PublicKey(value._value._value._value);
      }
    } else {
      if (value?._value?._value?._value) {
        sender = (StrKey.encodeContract(value._value._value._value));
      }
    }



    logger.info(`Deposit sender: ${sender}`);

    const entity = await getOrCreateDepositEntity(event);
    entity.sender = sender;

    await entity.save();
  } catch (error) {
    logger.error(`Error in DepositSenderPhoenixEvent for event ${event.id}: ${error}`);
  }
}

export async function DepositTokenAPhoenixEvent(event: SorobanEvent): Promise<void> {
  try {
    const value = event.value as any;

    const mapEntries = value?._value?._value;
    if (!mapEntries) {
      logger.warn(`DepositTokenAPhoenixEvent: Missing mapEntries for event ${event.id}`);
      return;
    }

    const tokena = StrKey.encodeContract(mapEntries);

    logger.info(`Deposit token A: ${tokena}`);

    const entity = await getOrCreateDepositEntity(event);
    entity.token_0 = tokena;

    await entity.save();
  } catch (error) {
    logger.error(`Error in DepositTokenAPhoenixEvent for event ${event.id}: ${error}`);
  }
}

export async function DepositTokenBPhoenixEvent(event: SorobanEvent): Promise<void> {
  try {
    const value = event.value as any;

    const mapEntries = value?._value?._value;
    if (!mapEntries) {
      logger.warn(`DepositTokenBPhoenixEvent: Missing mapEntries for event ${event.id}`);
      return;
    }

    const tokenb = StrKey.encodeContract(mapEntries);

    logger.info(`Deposit token B: ${tokenb}`);

    const entity = await getOrCreateDepositEntity(event);
    entity.token_1 = tokenb;

    await entity.save();
  } catch (error) {
    logger.error(`Error in DepositTokenBPhoenixEvent for event ${event.id}: ${error}`);
  }
}

export async function DepositTokenAAmountPhoenixEvent(event: SorobanEvent): Promise<void> {
  try {
    const value = event.value as any;

    const tokenAAmount = value?._value?._attributes?.lo?._value;
    if (tokenAAmount == null) {
      logger.warn(`DepositTokenAAmountPhoenixEvent: Missing tokenAAmount for event ${event.id}`);
      return;
    }

    logger.info(`Deposit token A amount: ${tokenAAmount}`);

    const entity = await getOrCreateDepositEntity(event);
    entity.amount_0 = tokenAAmount.toString();

    await entity.save();
  } catch (error) {
    logger.error(`Error in DepositTokenAAmountPhoenixEvent for event ${event.id}: ${error}`);
  }
}
export async function DepositTokenBAmountPhoenixEvent(event: SorobanEvent): Promise<void> {
  try {
    const value = event.value as any;

    const tokenBAmount = value?._value?._attributes?.lo?._value;
    if (tokenBAmount == null) {
      logger.warn(`DepositTokenBAmountPhoenixEvent: Missing tokenBAmount for event ${event.id}`);
      return;
    }

    logger.info(`Deposit token B amount: ${tokenBAmount}`);

    const entity = await getOrCreateDepositEntity(event);
    entity.amount_1 = tokenBAmount.toString();

    await entity.save();

    await postToAPI("lobster.phoenix.deposit", {
      block_number: event.ledger?.sequence,
      block_timestamp: event.ledgerClosedAt,
      chain_id: process.env.CHAIN_ID_NUM,
      content: entity,
      emitter: String(event.contractId ?? ""),
      tx: event.transaction?.hash,
    });
  } catch (error) {
    logger.error(`Error in DepositTokenBAmountPhoenixEvent for event ${event.id}: ${error}`);
  }
}


async function getOrCreateSwapEntity(event: SorobanEvent): Promise<SwapPhoenixEntity> {
  const id = `${event.transaction?.hash ?? ""}${event.contractId ?? ""}`;
  let entity = await SwapPhoenixEntity.get(id);

  if (!entity) {
    entity = SwapPhoenixEntity.create({
      id,
      contract: String(event.contractId ?? ""),
      sender: "",
      token_0: "",
      token_1: "",
      sell_token: "",
      buy_token: "",
      sell_amount: "",
      buy_amount: "",
      spread_amount: "",
      referral_fee: "",
      fee: "",
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

export async function SwapSenderPhoenixEvent(event: SorobanEvent): Promise<void> {
  try {
    const value = event.value as any;


    let sender = "";

    if (value?._value?._value?._arm == "ed25519") {
      if (value?._value?._value?._value) {
        sender = StrKey.encodeEd25519PublicKey(value._value._value._value);
      }
    } else {
      if (value?._value?._value?._value) {
        sender = (StrKey.encodeContract(value._value._value._value));
      }
    }

    logger.info(`Swap sender: ${sender}`);

    const entity = await getOrCreateSwapEntity(event);
    entity.sender = sender;

    await entity.save();
  } catch (error) {
    logger.error(`Error in SwapSenderPhoenixEvent for event ${event.id}: ${error}`);
  }
}
export async function SwapSellTokenPhoenixEvent(event: SorobanEvent): Promise<void> {
  try {
    const value = event.value as any;

    const mapEntries = value?._value?._value;
    if (!mapEntries) {
      logger.warn(`SwapSellTokenPhoenixEvent: Missing mapEntries for event ${event.id}`);
      return;
    }

    const token = StrKey.encodeContract(mapEntries);
    logger.info(`Swap sell token: ${token}`);

    const entity = await getOrCreateSwapEntity(event);
    entity.sell_token = token;

    if (entity.buy_token != "") {
      entity.order_token = token + "->" + entity.buy_token;
    }

    await entity.save();
  } catch (error) {
    logger.error(`Error in SwapSellTokenPhoenixEvent for event ${event.id}: ${error}`);
  }
}
export async function SwapOfferAmountPhoenixEvent(event: SorobanEvent): Promise<void> {
  try {
    const value = event.value as any;

    const mapEntries = value?._value?._attributes?.lo?._value;

    logger.info(`Swap offer amount: ${mapEntries ?? 'null'}`);
  } catch (error) {
    logger.error(`Error in SwapOfferAmountPhoenixEvent for event ${event.id}: ${error}`);
  }
}
export async function SwapActualReceivedPhoenixEvent(event: SorobanEvent): Promise<void> {
  try {
    const value = event.value as any;

    const mapEntries = value?._value?._attributes?.lo?._value;
    if (mapEntries == null) {
      logger.warn(`SwapActualReceivedPhoenixEvent: Missing mapEntries for event ${event.id}`);
      return;
    }

    logger.info(`Swap offer amount: ${mapEntries}`);

    const entity = await getOrCreateSwapEntity(event);
    entity.sell_amount = mapEntries.toString();

    if (entity.buy_amount != "") {
      entity.order_amount = mapEntries.toString() + "->" + entity.buy_amount
    }

    await entity.save();
  } catch (error) {
    logger.error(`Error in SwapActualReceivedPhoenixEvent for event ${event.id}: ${error}`);
  }
}
export async function SwapReturnAmountPhoenixEvent(event: SorobanEvent): Promise<void> {
  try {
    const value = event.value as any;

    const mapEntries = value?._value?._attributes?.lo?._value;
    if (mapEntries == null) {
      logger.warn(`SwapReturnAmountPhoenixEvent: Missing mapEntries for event ${event.id}`);
      return;
    }

    logger.info(`Swap return amount: ${mapEntries}`);

    const entity = await getOrCreateSwapEntity(event);
    entity.buy_amount = mapEntries.toString();

    if (entity.sell_amount != "") {
      entity.order_amount = entity.sell_amount + "->" + mapEntries.toString();
    }

    await entity.save();
  } catch (error) {
    logger.error(`Error in SwapReturnAmountPhoenixEvent for event ${event.id}: ${error}`);
  }
}
export async function SwapSpreadAmountPhoenixEvent(event: SorobanEvent): Promise<void> {
  try {
    const value = event.value as any;
    const mapEntries = value?._value?._attributes?.lo?._value;
    if (mapEntries == null) {
      logger.warn(`SwapSpreadAmountPhoenixEvent: Missing mapEntries for event ${event.id}`);
      return;
    }

    logger.info(`Swap spread amount: ${mapEntries}`);

    const entity = await getOrCreateSwapEntity(event);
    entity.spread_amount = mapEntries.toString();
    await entity.save();
  } catch (error) {
    logger.error(`Error in SwapSpreadAmountPhoenixEvent for event ${event.id}: ${error}`);
  }
}

export async function SwapBuyTokenPhoenixEvent(event: SorobanEvent): Promise<void> {
  try {
    const value = event.value as any;

    const mapEntries = value?._value?._value;
    if (!mapEntries) {
      logger.warn(`SwapBuyTokenPhoenixEvent: Missing mapEntries for event ${event.id}`);
      return;
    }

    const token = StrKey.encodeContract(mapEntries);

    logger.info(`Swap buy token: ${token}`);

    const entity = await getOrCreateSwapEntity(event);
    entity.buy_token = token;

    if (entity.sell_token != "") {
      entity.order_token = entity.sell_token + "->" + token;
    }

    await entity.save();
  } catch (error) {
    logger.error(`Error in SwapBuyTokenPhoenixEvent for event ${event.id}: ${error}`);
  }
}

// referral_fee_amount comes last, so this handler completes and publishes the swap
export async function SwapReferralFeePhoenixEvent(event: SorobanEvent): Promise<void> {
  try {
    const value = event.value as any;

    const mapEntries = value?._value?._attributes?.lo?._value;
    if (mapEntries == null) {
      logger.warn(`SwapReferralFeePhoenixEvent: Missing mapEntries for event ${event.id}`);
      return;
    }

    logger.info(`Swap referral fee: ${mapEntries}`);

    const entity = await getOrCreateSwapEntity(event);
    entity.referral_fee = mapEntries.toString();



  // Fee and reserves are not in the swap events, so read them from the transaction meta
  const txHash = event.transaction?.hash ?? '';
  logger.info(`Starting HTTPS request for tx: ${txHash}`);
  let r: any;

  try {
    r = await httpsJson('soroban-testnet.stellar.org', '/', 'POST', { 'Content-Type': 'application/json' }, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: { hash: event.transaction?.hash } }));
  } catch (error) {
    logger.error(`HTTPS request failed: ${error}`);
  }

    const metaXDR: any = r?.result?.resultMetaXdr ? xdr.TransactionMeta.fromXDR(r.result.resultMetaXdr, 'base64') : null;
    if (!metaXDR) {
      logger.warn(`SwapReferralFeePhoenixEvent: Failed to parse metaXDR for event ${event.id}`);
      await entity.save();
      return;
    }
    const operations = metaXDR?._value?._attributes?.operations;
    if (!operations || !Array.isArray(operations) || operations.length === 0) {
      logger.warn(`SwapReferralFeePhoenixEvent: Missing operations for event ${event.id}`);
      await entity.save();
      return;
    }
    const changes = operations[0]?._attributes?.changes;

    const persistList = [];

    if (!changes || !Array.isArray(changes)) {
      logger.warn(`SwapReferralFeePhoenixEvent: Missing or invalid changes array for event ${event.id}`);
      await entity.save();
      return;
    }
    for (const change of changes) {

    if (change?._switch?.name === "ledgerEntryUpdated") {

      try {

        const persistAddress = change?._value?._attributes?.data?._value?._attributes?.contract?._value ?? '';
        const persistToken = (change?._value?._attributes?.data?._value?._attributes?.key?._value ?? '').toString() ?? '';
        const persistAmount = (change?._value?._attributes?.data?._value?._attributes?.val?._value?._attributes?.lo?._value ?? '').toString() ?? '';


        if (persistToken == "1" || persistToken == "2") {

          if (StrKey.encodeContract(persistAddress) == String(event.contractId)) {
            persistList.push({
              address: StrKey.encodeContract(persistAddress),
              token: persistToken,
              amount: persistAmount
            });
          }
        }

      } catch (e) {
        logger.info(`extract error: ${String(e).slice(0, 200)}`);
      }
    }
  }
    persistList.sort((a, b) => a.token.localeCompare(b.token));

    const eventsForFees = operations[0]?._attributes?.events;
    if (!eventsForFees || !Array.isArray(eventsForFees)) {
      logger.warn(`SwapReferralFeePhoenixEvent: Missing eventsForFees for event ${event.id}`);
      await entity.save();
      return;
    }
    const eventIdParts = String(event.id ?? "").split('-');
    const myInt = eventIdParts.length > 0 ? Number(eventIdParts[eventIdParts.length - 1]) : 0;
    if (isNaN(myInt) || myInt < 8 || myInt - 8 >= eventsForFees.length) {
      logger.warn(`SwapReferralFeePhoenixEvent: Invalid event index calculation. event.id=${event.id}, myInt=${myInt}, eventsForFees.length=${eventsForFees.length}`);
      await entity.save();
      return;
    }

    const feeAmount = eventsForFees[myInt - 8]?._attributes?.body?._value?._attributes?.data?._value?._attributes?.lo?._value;
    if (feeAmount == null) {
      logger.warn(`SwapReferralFeePhoenixEvent: Missing feeAmount for event ${event.id}`);
      await entity.save();
      return;
    }

    logger.info(`Fee amount: ${feeAmount}`);

    entity.fee = feeAmount.toString();

    const poolAddress = String(event.contractId ?? "");

    const myPair = await NewPairPhoenixEntity.getByFields([
      ["pair", "=", poolAddress],
    ], { limit: 1 });
    
    // Pools created before START_BLOCK have no NewPair entity; fall back to pool_repertory
    let poolTokens: { token_0: string; token_1: string } | null = null;
    
    if (myPair.length > 0 && myPair[0]) {
      poolTokens = {
        token_0: (myPair[0] as any)?.token_0 ?? "",
        token_1: (myPair[0] as any)?.token_1 ?? ""
      };
    } else {
      logger.warn(`SwapReferralFeePhoenixEvent: No pair found for contract ${poolAddress} in event ${event.id}, checking repository...`);
      poolTokens = getPhoenixPoolTokens(poolAddress);
      
      if (!poolTokens) {
        logger.warn(`SwapReferralFeePhoenixEvent: Pool not found in repository either for ${poolAddress}`);
        await entity.save();
        return;
      }
    }

    entity.token_0 = poolTokens.token_0;
    entity.token_1 = poolTokens.token_1;

    if (persistList.length < 2) {
      logger.warn(`SwapReferralFeePhoenixEvent: Insufficient persistList data. length=${persistList.length} for event ${event.id}`);
      await entity.save();
      return;
    }

    entity.reserve_after0 = persistList[0]?.amount ?? "";
    entity.reserve_after1 = persistList[1]?.amount ?? "";

    if (entity.sell_token == entity.token_0) {
      entity.reserve_before0 = (Number(entity.reserve_after0 || 0) - Number(entity.sell_amount || 0)).toString();
    } else {
      entity.reserve_before1 = (Number(entity.reserve_after1 || 0) - Number(entity.sell_amount || 0)).toString();
    }

    if (entity.buy_token == entity.token_0) {
      entity.reserve_before0 = (Number(entity.reserve_after0 || 0) + Number(entity.buy_amount || 0) + Number(feeAmount || 0)).toString();
    } else {
      entity.reserve_before1 = (Number(entity.reserve_after1 || 0) + Number(entity.buy_amount || 0) + Number(feeAmount || 0)).toString();
    }

    if (entity.sell_token == entity.token_0) {
      entity.amount_0 = entity.sell_amount;
      entity.amount_1 = entity.buy_amount;
    } else {
      entity.amount_0 = entity.buy_amount;
      entity.amount_1 = entity.sell_amount;
    }

    logger.info(JSON.stringify(entity, null, 2));
    await entity.save();

    await postToAPI("lobster.phoenix.swap", {
      block_number: event.ledger?.sequence,
      block_timestamp: event.ledgerClosedAt,
      chain_id: process.env.CHAIN_ID_NUM,
      content: entity,
      emitter: String(event.contractId ?? ""),
      tx: event.transaction?.hash,
    });
  } catch (error) {
    logger.error(`Error in SwapReferralFeePhoenixEvent for event ${event.id}: ${error}`);
  }
}


async function getOrCreateWithdrawEntity(event: SorobanEvent): Promise<RemoveLiquidityPhoenixEntity> {
  const id = `${event.transaction?.hash ?? ""}${event.contractId ?? ""}`;
  let entity = await RemoveLiquidityPhoenixEntity.get(id);

  if (!entity) {
    entity = RemoveLiquidityPhoenixEntity.create({
      id,
      contract: String(event.contractId ?? ""),
      sender: "",
      token_0: "",
      token_1: "",
      pair: "",
      amount_0: "",
      amount_1: "",
      liquidity: "",
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

export async function WithdrawSenderPhoenixEvent(event: SorobanEvent): Promise<void> {
  try {
    const value = event.value as any;


    let sender = "";

    if (value?._value?._value?._arm == "ed25519") {
      if (value?._value?._value?._value) {
        sender = StrKey.encodeEd25519PublicKey(value._value._value._value);
      }
    } else {
      if (value?._value?._value?._value) {
        sender = (StrKey.encodeContract(value._value._value._value));
      }
    }

    logger.info(`Withdraw sender: ${sender}`);

    const entity = await getOrCreateWithdrawEntity(event);
    entity.sender = sender;

    await entity.save();
  } catch (error) {
    logger.error(`Error in WithdrawSenderPhoenixEvent for event ${event.id}: ${error}`);
  }
}
export async function WithdrawSharesAmountPhoenixEvent(event: SorobanEvent): Promise<void> {
  try {
    const value = event.value as any;

    const shares = value?._value?._attributes?.lo?._value;
    if (shares == null) {
      logger.warn(`WithdrawSharesAmountPhoenixEvent: Missing shares for event ${event.id}`);
      return;
    }

    logger.info(`Withdraw shares: ${shares}`);

    const entity = await getOrCreateWithdrawEntity(event);
    entity.liquidity = shares.toString();

    await entity.save();
  } catch (error) {
    logger.error(`Error in WithdrawSharesAmountPhoenixEvent for event ${event.id}: ${error}`);
  }
}
export async function WithdrawReturnAmountAPhoenixEvent(event: SorobanEvent): Promise<void> {
  try {
    const value = event.value as any;

    const amountA = value?._value?._attributes?.lo?._value;
    if (amountA == null) {
      logger.warn(`WithdrawReturnAmountAPhoenixEvent: Missing amountA for event ${event.id}`);
      return;
    }

    logger.info(`Withdraw return token A: ${amountA}`);

    const entity = await getOrCreateWithdrawEntity(event);
    entity.amount_0 = amountA.toString();

    await entity.save();
  } catch (error) {
    logger.error(`Error in WithdrawReturnAmountAPhoenixEvent for event ${event.id}: ${error}`);
  }
}
export async function WithdrawReturnAmountBPhoenixEvent(event: SorobanEvent): Promise<void> {
  try {
    const value = event.value as any;

    const amountB = value?._value?._attributes?.lo?._value;
    if (amountB == null) {
      logger.warn(`WithdrawReturnAmountBPhoenixEvent: Missing amountB for event ${event.id}`);
      return;
    }

    logger.info(`Withdraw return token B: ${amountB}`);

    const entity = await getOrCreateWithdrawEntity(event);
    entity.amount_0 = amountB.toString();

    await entity.save();

    await postToAPI("lobster.phoenix.withdraw", {
      block_number: event.ledger?.sequence,
      block_timestamp: event.ledgerClosedAt,
      chain_id: process.env.CHAIN_ID_NUM,
      content: entity,
      emitter: String(event.contractId ?? ""),
      tx: event.transaction?.hash,
    });
  } catch (error) {
    logger.error(`Error in WithdrawReturnAmountBPhoenixEvent for event ${event.id}: ${error}`);
  }
}