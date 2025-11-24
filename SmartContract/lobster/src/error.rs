use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    NotAuthorized = 401,
    GetDepositAmountsMinABiggerThenDesiredA = 306,
    GetDepositAmountsMinBBiggerThenDesiredB = 307,
    GetDepositAmountsAmountABiggerThenDesiredA = 308,
    GetDepositAmountsAmountALessThenMinA = 309,
    GetDepositAmountsAmountBBiggerThenDesiredB = 310,
    GetDepositAmountsAmountBLessThenMinB = 311,
    DesiredAmountsBelowOrEqualZero = 313,
    MinAmountsBelowZero = 314,
    ContractMathError = 328,

    TokenTransferFailed = 330,

    /// SoroswapRouter: insufficient a amount
    InsufficientAAmount = 405,

    /// SoroswapRouter: insufficient b amount
    InsufficientBAmount = 406,

    RouterFactoryQueryFailed = 407,

    // Cross-contract call failures (500+)
    QueryPoolInfoFailed = 500,
    PoolInfoConversionError = 501,
    ProvideLiquidityFailed = 502,

    PoolToken0QueryFailed = 510,
    RouterGetReservesFailed = 511,
    RouterQuoteFailed = 512,
    RouterAddLiquidityFailed = 513,
    RouterRemoveLiquidityFailed = 514,

    AquariusGetTokensFailed = 520,
    AquariusDepositFailed = 521,
    AquariusWithdrawFailed = 522,
    AquariusShareIdQueryFailed = 523,
    AquariusReserveTooLarge = 524, // Aquarius pool reserves exceed i128::MAX

    PhoenixShareTokenQueryFailed = 530,
    PhoenixWithdrawLiquidityFailed = 531,

    LpTokenBalanceQueryFailed = 540,
    PoolLpBalanceQueryFailed = 541,
    RouterPairForFailed = 542,
    
    // TVL calculation errors
    InvalidProtocol = 550,
    ZeroReserves = 551,
    ActivePositionExists = 552,

    AlreadyInitialized = 560,
    InvalidFeeValue = 561,
    InvalidAmount = 562,
    NotInitialized = 563,
    ReentrancyDetected = 564,

}
