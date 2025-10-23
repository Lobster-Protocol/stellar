// Central mapping module that wires Soroban events to specific parsers and entities
// - Phoenix handlers: parse pool creation, liquidity, and swap event fragments into Phoenix models
// - Soroswap handlers: delegate to Soroswap parser functions
// - Aquarius handlers: delegate to Aquarius parser functions (optionally broadcast over WebSocket)
// Utilities at bottom: account lookup/creation and safe address decoding helpers
import { SorobanEvent } from "@subql/types-stellar";
import { StrKey } from "@stellar/stellar-base";

import { NewPairPhoenixTokenAEvent, NewPairPhoenixTokenBEvent, NewPairPhoenixEvent, StackingTokenContractPhoenixTokenBEvent,
  DepositSenderPhoenixEvent, DepositTokenAAmountPhoenixEvent, DepositTokenAPhoenixEvent, DepositTokenBAmountPhoenixEvent, DepositTokenBPhoenixEvent,
  SwapActualReceivedPhoenixEvent, SwapBuyTokenPhoenixEvent, SwapOfferAmountPhoenixEvent, SwapReferralFeePhoenixEvent, SwapReturnAmountPhoenixEvent, SwapSellTokenPhoenixEvent, SwapSenderPhoenixEvent, SwapSpreadAmountPhoenixEvent,
  WithdrawReturnAmountAPhoenixEvent, WithdrawReturnAmountBPhoenixEvent, WithdrawSenderPhoenixEvent,WithdrawSharesAmountPhoenixEvent
 } from "../Phoenix/phoenixparser";

import {SwapAquariusEvent, WithdrawAquariusEvent, DepositAquariusEvent, NewPairAquariusEvent, TradeAquariusEvent, UpdateReservesAquariusEvent} from "../Aquarius/aquariusparser"; 
import { swapSoroswapEvent, depositSoroswapEvent, removeSoroswapEvent, newPairSoroswaoEvent, swapPairEvent, syncSoroswapEvent } from "../Soroswap/soroswapparser";

import http from "http";


//////////////////////////////////////////// PHOENIX //////////////////////////////////////
// Each Phoenix event arrives as a small fragment (topic/value). We store pieces
// under the same transaction hash so a full record can be assembled across
// multiple handler calls for the same tx.

export async function handleNewPairPhoenixTokenAEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW NewPairPhoenixTokenA EVENT /////");
  await NewPairPhoenixTokenAEvent(event);
}
export async function handleNewPairPhoenixTokenBEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW NewPairPhoenixTokenB EVENT /////");
  await NewPairPhoenixTokenBEvent(event);
}
export async function handleNewPairPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW NewPairPhoenix EVENT /////");
  await NewPairPhoenixEvent(event);
}
export async function handleStackingTokenContractPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW StackingTokenContractPhoenix EVENT /////");
  await StackingTokenContractPhoenixTokenBEvent(event);
}



export async function handleDepositSenderPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW DepositSenderPhoenix EVENT /////");
  await DepositSenderPhoenixEvent(event);
}
export async function handleDepositTokenAPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW DepositTokenAPhoenix EVENT /////");
  await DepositTokenAPhoenixEvent(event);
}
export async function handleDepositTokenAAmountPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW DepositTokenAAmountPhoenix EVENT /////");
  await DepositTokenAAmountPhoenixEvent(event);
}
export async function handleDepositTokenBPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW DepositTokenBPhoenix EVENT /////");
  await DepositTokenBPhoenixEvent(event);
}
export async function handleDepositTokenBAmountPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW DepositTokenBAmountPhoenix EVENT /////");
  await DepositTokenBAmountPhoenixEvent(event);
}



export async function handleSwapSenderPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW SwapSenderPhoenix EVENT /////");
  await SwapSenderPhoenixEvent(event);
}
export async function handleSwapSellTokenPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW SwapSellTokenPhoenix EVENT /////");
  await SwapSellTokenPhoenixEvent(event);
}
export async function handleSwapOfferAmountPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW SwapOfferAmountPhoenix EVENT /////");
  await SwapOfferAmountPhoenixEvent(event);
}
export async function handleSwapActualReceivedPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW SwapActualReceivedPhoenix EVENT /////");
  await SwapActualReceivedPhoenixEvent(event);
}
export async function handleSwapReturnAmountPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW SwapReturnAmountPhoenix EVENT /////");
  await SwapReturnAmountPhoenixEvent(event);
}
export async function handleSwapSpreadAmountPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW SwapSpreadAmountPhoenix EVENT /////");
  await SwapSpreadAmountPhoenixEvent(event);
}
export async function handleSwapReferralFeePhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW SwapReferralFeePhoenix EVENT /////");
  await SwapReferralFeePhoenixEvent(event);
}
export async function handleSwapBuyTokenPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW SwapBuyTokenPhoenix EVENT /////");
  await SwapBuyTokenPhoenixEvent(event);
}



export async function handleWithdrawSenderPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW WithdrawSenderPhoenix EVENT /////");
  await WithdrawSenderPhoenixEvent(event);
}
export async function handleWithdrawSharesAmountPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW WithdrawSharesAmountPhoenix EVENT /////");
  await WithdrawSharesAmountPhoenixEvent(event);
}
export async function handleWithdrawReturnAmountAPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW WithdrawReturnAmountAPhoenix EVENT /////");
  await WithdrawReturnAmountAPhoenixEvent(event);
}
export async function handleWithdrawReturnAmountBPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW WithdrawReturnAmountBPhoenix EVENT /////");
  await WithdrawReturnAmountBPhoenixEvent(event);
}

///////////////////////////////////////// SOROSWAP //////////////////////////
// Simple delegation to Soroswap parsers

export async function handleRemoveEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW RemoveSoroswap EVENT /////");
  await removeSoroswapEvent(event);
}

export async function handleDepositEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW DepositSoroswap EVENT /////");
  await depositSoroswapEvent(event);
}

export async function handleNewPairEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW NewPairSoroswap EVENT /////");
  await newPairSoroswaoEvent(event);
}

export async function handleSwapRouterEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW SwapSoroswap EVENT /////");
  await swapSoroswapEvent(event);
}
export async function handleSyncEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW SyncSoroswap EVENT /////");
  await syncSoroswapEvent(event);
}

export async function handleSwapPairEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW SwapPairSoroswap EVENT /////");

  await swapPairEvent(event);
}

//////////////////////////////////////////// AQUARIUS /////////////////////////////////
// Delegation to Aquarius parsers; WebSocket broadcast integration can be enabled
// by initializing the WebSocket service and passing it through


export async function handleNewPairAquariusEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW NewPairAquarius EVENT /////");
   // Initialize WebSocket if needed
   //initializeWebSocketIfNeeded();
  await NewPairAquariusEvent(event);//, wsService);
}
export async function handleDepositAquariusEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW DepositAquarius EVENT /////");
   // Initialize WebSocket if needed
   //initializeWebSocketIfNeeded();
  await DepositAquariusEvent(event);//, wsService);
}
export async function handleWithdrawAquariusEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW WithdrawAquarius EVENT /////");
   // Initialize WebSocket if needed
   //initializeWebSocketIfNeeded();
  await WithdrawAquariusEvent(event);//, wsService);
}
export async function handleSwapAquariusEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW SwapAquarius EVENT /////");
   // Initialize WebSocket if needed
   //initializeWebSocketIfNeeded();
  await SwapAquariusEvent(event);//, wsService);
}
export async function handleTradeAquariusEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW TradeAquarius EVENT /////");

  await TradeAquariusEvent(event);//, wsService);
}

export async function handleUpdateReservesAquariusEvent(event: SorobanEvent): Promise<void> {
  logger.info("///// RAW UpdateReservesAquarius EVENT /////");
  await UpdateReservesAquariusEvent(event);//, wsService);
}


export function safeDecodeAddress(raw: any): string {
  try {
    return StrKey.encodeEd25519PublicKey(raw); // G...
  } catch {
    try {
      return StrKey.encodeContract(raw); // C...
    } catch {
      return Buffer.from(raw).toString("hex"); // fallback
    }
  }
}

export function postToAPI(subject: string, data: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ subject, data });

    const options = {
      hostname: 'express-nats-service',  // or your API host
      port: 8080,            // your API port
      path: '/publish',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          resolve(responseData);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}