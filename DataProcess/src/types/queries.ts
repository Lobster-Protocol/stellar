// Auto-generated query constants for SubQuery entities defined in Query/schema.graphql
// Each query supports standard SubQuery args: first, offset, orderBy, orderDirection, filter

export const QUERY_TRANSFERS = `
  query ($first: Int, $offset: Int, $orderBy: [TransfersOrderBy!], $filter: TransferFilter) {
    transfers(first: $first, offset: $offset, orderBy: $orderBy, filter: $filter) {
      nodes {
        id
        ledger
        date
        contract
        fromId
        toId
        value
      }
    }
  }
`;

export const QUERY_PAYMENTS = `
  query ($first: Int, $offset: Int, $orderBy: [PaymentsOrderBy!], $orderDirection: OrderDirection, $filter: PaymentFilter) {
    payments(first: $first, offset: $offset, orderBy: $orderBy, orderDirection: $orderDirection, filter: $filter) {
      nodes {
        id
        txHash
        fromId
        toId
        amount
      }
    }
  }
`;

export const QUERY_REMOVE_LIQUIDIT_ENTITIES = `
  query ($first: Int, $offset: Int, $orderBy: [RemoveLiquiditEntitiesOrderBy!], $orderDirection: OrderDirection, $filter: RemoveLiquiditEntityFilter) {
    removeLiquiditEntities(first: $first, offset: $offset, orderBy: $orderBy, orderDirection: $orderDirection, filter: $filter) {
      nodes {
        id
        contract
        token_0
        token_1
        pair
        amount_0
        amount_1
        liquidity
        to
        block
        timestamp
      }
    }
  }
`;

export const QUERY_ADD_LIQUIDITY_EVENT_ENTITIES = `
  query ($first: Int, $offset: Int, $orderBy: [AddLiquidityEventEntitiesOrderBy!], $orderDirection: OrderDirection, $filter: AddLiquidityEventEntityFilter) {
    addLiquidityEventEntities(first: $first, offset: $offset, orderBy: $orderBy, orderDirection: $orderDirection, filter: $filter) {
      nodes {
        id
        contract
        token_0
        token_1
        pair
        amount_0
        amount_1
        liquidity
        to
        block
        timestamp
      }
    }
  }
`;

export const QUERY_SWAP_EVENT_ENTITIES = `
  query ($first: Int, $offset: Int, $orderBy: [SwapEventEntitiesOrderBy!], $filter: SwapEventEntityFilter) {
    swapEventEntities(first: $first, offset: $offset, orderBy: $orderBy, filter: $filter) {
      nodes {
        id
        contract
        token0
        token1
        amount0
        amount1
        orderToken
        orderAmount
        reserveBefore0
        reserveBefore1
        reserveAfter0
        reserveAfter1
        sender
        block
        timestamp
      }
    }
  }
`;

export const QUERY_SYNC_EVENT_ENTITIES = `
  query ($first: Int, $offset: Int, $orderBy: [SyncEventEntitiesOrderBy!], $filter: SyncEventEntityFilter) {
    syncEventEntities(first: $first, offset: $offset, orderBy: $orderBy, filter: $filter) {
      nodes {
        id
        contract
        token0
        token1
        amount0
        amount1
        txHash
        block
        timestamp
      }
    }
  }
`;

export const QUERY_NEW_PAIR_EVENT_ENTITIES = `
  query ($first: Int, $offset: Int, $orderBy: [NewPairEventEntitiesOrderBy!], $orderDirection: OrderDirection, $filter: NewPairEventEntityFilter) {
    newPairEventEntities(first: $first, offset: $offset, orderBy: $orderBy, orderDirection: $orderDirection, filter: $filter) {
      nodes {
        id
        contract
        token_0
        token_1
        pair
        new_pairs_length
        creator
        fees
        initial_0
        initial_1
        block
        timestamp
      }
    }
  }
`;

export const QUERY_NEW_PAIR_PHOENIX_ENTITIES = `
  query ($first: Int, $offset: Int, $orderBy: [NewPairPhoenixEntitiesOrderBy!], $orderDirection: OrderDirection, $filter: NewPairPhoenixEntityFilter) {
    newPairPhoenixEntities(first: $first, offset: $offset, orderBy: $orderBy, orderDirection: $orderDirection, filter: $filter) {
      nodes {
        id
        contract
        token_0
        token_1
        pair
        fees
        initial_0
        initial_1
        creator
        staking_contract
        block
        timestamp
      }
    }
  }
`;

export const QUERY_ADD_LIQUIDITY_PHOENIX_ENTITIES = `
  query ($first: Int, $offset: Int, $orderBy: [AddLiquidityPhoenixEntitiesOrderBy!], $orderDirection: OrderDirection, $filter: AddLiquidityPhoenixEntityFilter) {
    addLiquidityPhoenixEntities(first: $first, offset: $offset, orderBy: $orderBy, orderDirection: $orderDirection, filter: $filter) {
      nodes {
        id
        contract
        token_0
        token_1
        pair
        amount_0
        amount_1
        liquidity
        sender
        block
        timestamp
      }
    }
  }
`;

export const QUERY_REMOVE_LIQUIDITY_PHOENIX_ENTITIES = `
  query ($first: Int, $offset: Int, $orderBy: [RemoveLiquidityPhoenixEntitiesOrderBy!], $orderDirection: OrderDirection, $filter: RemoveLiquidityPhoenixEntityFilter) {
    removeLiquidityPhoenixEntities(first: $first, offset: $offset, orderBy: $orderBy, orderDirection: $orderDirection, filter: $filter) {
      nodes {
        id
        contract
        token_0
        token_1
        pair
        amount_0
        amount_1
        liquidity
        sender
        block
        timestamp
      }
    }
  }
`;

export const QUERY_SWAP_PHOENIX_ENTITIES = `
  query ($first: Int, $offset: Int, $orderBy: [SwapPhoenixEntitiesOrderBy!], $orderDirection: OrderDirection, $filter: SwapPhoenixEntityFilter) {
    swapPhoenixEntities(first: $first, offset: $offset, orderBy: $orderBy, orderDirection: $orderDirection, filter: $filter) {
      nodes {
        id
        contract
        token0
        token1
        amount0
        amount1
        orderToken
        orderAmount
        spreadAmount
        referralFee
        sender
        block
        timestamp
      }
    }
  }
`;

export const QUERY_NEW_PAIR_AQUARIUS_ENTITIES = `
  query ($first: Int, $offset: Int, $orderBy: [NewPairAquariusEntitiesOrderBy!], $orderDirection: OrderDirection, $filter: NewPairAquariusEntityFilter) {
    newPairAquariusEntities(first: $first, offset: $offset, orderBy: $orderBy, orderDirection: $orderDirection, filter: $filter) {
      nodes {
        id
        contract
        token_0
        token_1
        pair
        fees
        initial_0
        initial_1
        creator
        block
        timestamp
      }
    }
  }
`;

export const QUERY_SWAP_AQUARIUS_ENTITIES = `
  query ($first: Int, $offset: Int, $orderBy: [SwapAquariusEntitiesOrderBy!], $orderDirection: OrderDirection, $filter: SwapAquariusEntityFilter) {
    swapAquariusEntities(first: $first, offset: $offset, orderBy: $orderBy, orderDirection: $orderDirection, filter: $filter) {
      nodes {
        id
        contract
        token0
        token1
        amount0
        amount1
        orderToken
        orderAmount
        reserveBefore0
        reserveBefore1
        reserveAfter0
        reserve_after1
        sender
        block
        timestamp
      }
    }
  }
`;

export const QUERY_RESERVE_AQUARIUS_ENTITIES = `
  query ($first: Int, $offset: Int, $orderBy: [ReserveAquariusEntitiesOrderBy!], $orderDirection: OrderDirection, $filter: ReserveAquariusEntityFilter) {
    reserveAquariusEntities(first: $first, offset: $offset, orderBy: $orderBy, orderDirection: $orderDirection, filter: $filter) {
      nodes {
        id
        contract
        amount_0
        amount_1
        txHash
        block
        timestamp
      }
    }
  }
`;

export const QUERY_ADD_LIQUIDITY_AQUARIUS_ENTITIES = `
  query ($first: Int, $offset: Int, $orderBy: [AddLiquidityAquariusEntitiesOrderBy!], $orderDirection: OrderDirection, $filter: AddLiquidityAquariusEntityFilter) {
    addLiquidityAquariusEntities(first: $first, offset: $offset, orderBy: $orderBy, orderDirection: $orderDirection, filter: $filter) {
      nodes {
        id
        contract
        token_0
        token_1
        pair
        amount_0
        amount_1
        liquidity
        sender
        block
        timestamp
      }
    }
  }
`;

export const QUERY_REMOVE_LIQUIDITY_AQUARIUS_ENTITIES = `
  query ($first: Int, $offset: Int, $orderBy: [RemoveLiquidityAquariusEntitiesOrderBy!], $orderDirection: OrderDirection, $filter: RemoveLiquidityAquariusEntityFilter) {
    removeLiquidityAquariusEntities(first: $first, offset: $offset, orderBy: $orderBy, orderDirection: $orderDirection, filter: $filter) {
      nodes {
        id
        contract
        token_0
        token_1
        pair
        amount_0
        amount_1
        liquidity
        sender
        block
        timestamp
      }
    }
  }
`;


