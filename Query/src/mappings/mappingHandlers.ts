import { SorobanEvent } from "@subql/types-stellar";
import { StrKey } from "@stellar/stellar-base";

import { NewPairPhoenixTokenAEvent, NewPairPhoenixTokenBEvent, NewPairPhoenixEvent, StackingTokenContractPhoenixTokenBEvent,
  DepositSenderPhoenixEvent, DepositTokenAAmountPhoenixEvent, DepositTokenAPhoenixEvent, DepositTokenBAmountPhoenixEvent, DepositTokenBPhoenixEvent,
  SwapActualReceivedPhoenixEvent, SwapBuyTokenPhoenixEvent, SwapOfferAmountPhoenixEvent, SwapReferralFeePhoenixEvent, SwapReturnAmountPhoenixEvent, SwapSellTokenPhoenixEvent, SwapSenderPhoenixEvent, SwapSpreadAmountPhoenixEvent,
  WithdrawReturnAmountAPhoenixEvent, WithdrawReturnAmountBPhoenixEvent, WithdrawSenderPhoenixEvent,WithdrawSharesAmountPhoenixEvent
 } from "../Phoenix/phoenixparser";

import {WithdrawAquariusEvent, DepositAquariusEvent, NewPairAquariusEvent, TradeAquariusEvent, UpdateReservesAquariusEvent} from "../Aquarius/aquariusparser"; 
import { swapSoroswapEvent, depositSoroswapEvent, removeSoroswapEvent, newPairSoroswaoEvent, swapPairEvent, syncSoroswapEvent } from "../Soroswap/soroswapparser";

import http from "http";


// Phoenix emits one event per field, so the parsers collect the pieces under the transaction hash.

export async function handleNewPairPhoenixTokenAEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received NewPairPhoenixTokenA event");
  await NewPairPhoenixTokenAEvent(event);
}
export async function handleNewPairPhoenixTokenBEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received NewPairPhoenixTokenB event");
  await NewPairPhoenixTokenBEvent(event);
}
export async function handleNewPairPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received NewPairPhoenix event");
  await NewPairPhoenixEvent(event);
}
export async function handleStackingTokenContractPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received StackingTokenContractPhoenix event");
  await StackingTokenContractPhoenixTokenBEvent(event);
}



export async function handleDepositSenderPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received DepositSenderPhoenix event");
  await DepositSenderPhoenixEvent(event);
}
export async function handleDepositTokenAPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received DepositTokenAPhoenix event");
  await DepositTokenAPhoenixEvent(event);
}
export async function handleDepositTokenAAmountPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received DepositTokenAAmountPhoenix event");
  await DepositTokenAAmountPhoenixEvent(event);
}
export async function handleDepositTokenBPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received DepositTokenBPhoenix event");
  await DepositTokenBPhoenixEvent(event);
}
export async function handleDepositTokenBAmountPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received DepositTokenBAmountPhoenix event");
  await DepositTokenBAmountPhoenixEvent(event);
}



export async function handleSwapSenderPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received SwapSenderPhoenix event");
  await SwapSenderPhoenixEvent(event);
}
export async function handleSwapSellTokenPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received SwapSellTokenPhoenix event");
  await SwapSellTokenPhoenixEvent(event);
}
export async function handleSwapOfferAmountPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received SwapOfferAmountPhoenix event");
  await SwapOfferAmountPhoenixEvent(event);
}
export async function handleSwapActualReceivedPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received SwapActualReceivedPhoenix event");
  await SwapActualReceivedPhoenixEvent(event);
}
export async function handleSwapReturnAmountPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received SwapReturnAmountPhoenix event");
  await SwapReturnAmountPhoenixEvent(event);
}
export async function handleSwapSpreadAmountPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received SwapSpreadAmountPhoenix event");
  await SwapSpreadAmountPhoenixEvent(event);
}
export async function handleSwapReferralFeePhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received SwapReferralFeePhoenix event");
  await SwapReferralFeePhoenixEvent(event);
}
export async function handleSwapBuyTokenPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received SwapBuyTokenPhoenix event");
  await SwapBuyTokenPhoenixEvent(event);
}



export async function handleWithdrawSenderPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received WithdrawSenderPhoenix event");
  await WithdrawSenderPhoenixEvent(event);
}
export async function handleWithdrawSharesAmountPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received WithdrawSharesAmountPhoenix event");
  await WithdrawSharesAmountPhoenixEvent(event);
}
export async function handleWithdrawReturnAmountAPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received WithdrawReturnAmountAPhoenix event");
  await WithdrawReturnAmountAPhoenixEvent(event);
}
export async function handleWithdrawReturnAmountBPhoenixEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received WithdrawReturnAmountBPhoenix event");
  await WithdrawReturnAmountBPhoenixEvent(event);
}

// Soroswap

export async function handleRemoveEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received RemoveSoroswap event");
  await removeSoroswapEvent(event);
}

export async function handleDepositEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received DepositSoroswap event");
  await depositSoroswapEvent(event);
}

export async function handleNewPairEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received NewPairSoroswap event");
  await newPairSoroswaoEvent(event);
}

export async function handleSwapRouterEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received SwapSoroswap event");
  await swapSoroswapEvent(event);
}
export async function handleSyncEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received SyncSoroswap event");
  await syncSoroswapEvent(event);
}

export async function handleSwapPairEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received SwapPairSoroswap event");

  await swapPairEvent(event);
}

// Aquarius

export async function handleNewPairAquariusEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received NewPairAquarius event");
  await NewPairAquariusEvent(event);
}
export async function handleDepositAquariusEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received DepositAquarius event");
  await DepositAquariusEvent(event);
}
export async function handleWithdrawAquariusEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received WithdrawAquarius event");
  await WithdrawAquariusEvent(event);
}
export async function handleTradeAquariusEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received TradeAquarius event");

  await TradeAquariusEvent(event);
}

export async function handleUpdateReservesAquariusEvent(event: SorobanEvent): Promise<void> {
  logger.info("Received UpdateReservesAquarius event");
  await UpdateReservesAquariusEvent(event);
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
      hostname: 'express-nats-service',
      port: 8080,
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