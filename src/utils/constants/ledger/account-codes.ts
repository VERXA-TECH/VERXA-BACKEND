export const ACCT = {
    LIQUIDITY_POOL: "LIQUIDITY_POOL",

    ASSET_HOT: "ASSET:HOTWALLET", // on-exchange/vault balance
    ASSET_FEES_HOLD: "ASSET:FEES_HOLD",

    // User liabilities (per user + per asset)
    LIAB_USER: "LIAB:USER", // main user balance
    LIAB_USER_LOCK: "LIAB:USER:LOCKED", // locked portion (withdrawals in-flight, etc.)

    // Revenues & expenses
    REV_FEES: "REV:FEES", //  fee income
    REV_ESIM: "REV:ESIM",
    EXP_NETWORK: "EXP:NETWORK_FEES", // on-chain fees you pay
    EXP_PROVIDER: "EXP:PROVIDER_FEES",
    EXP_ROUNDING: "EXP:ROUNDING", // rounding diffs, dust
    EXP_ADJUST: "EXP:ADJUSTMENTS", // manual write-offs/ups
    EXP_REFUNDS: "EXP:REFUNDS", // manual refunds

    // Control / suspense
    CTRL_SUSPENSE: "CTRL:SUSPENSE", // temporary holding for mismatches
    CTRL_SETTLE: "CTRL:SETTLEMENT", // internal settlement clearing

    ASSET_SWEEP: "ASSET:SWEEP"
} as const;
