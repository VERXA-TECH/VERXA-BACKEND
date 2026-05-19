import { sql } from "drizzle-orm";
import {
    pgTable,
    uuid,
    varchar,
    text,
    timestamp,
    jsonb,
    index,
    integer,
    uniqueIndex,
    numeric,
    boolean
} from "drizzle-orm/pg-core";
import { users } from "../users.schema";

export const transactions = pgTable(
    "transactions",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: uuid("user_id"),
        type: varchar("type", { length: 64 }).notNull(),
        status: varchar("status", { length: 32 }).notNull(),
        assetId: varchar("asset_id", { length: 64 }),
        amountMinor: numeric("amount_minor", { precision: 78, scale: 0 })
            .default(sql`0`)
            .notNull(),
        idempotencyKey: varchar("idempotency_key", { length: 128 }),
        isFlagged: boolean("is_flagged").default(false).notNull(),
        flagReason: text("flag_reason"),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
        completedAt: timestamp("completed_at", { withTimezone: true }),
        journalId: uuid("journal_id"),
        metadata: jsonb("metadata"),
        description: text("description"),
        referenceId: uuid("reference_id"), // Added for compensating transactions
        category: varchar("category", { length: 32 }), // Added for categorizing REFUND, REVERSAL etc
        amountUsd: numeric("amount_usd", { precision: 20, scale: 2 }), // Stored USD value at txn time
        adminId: uuid("admin_id") // Added for audit trail
    },
    (t) => [
        index("transactions_user_idx").on(t.userId),
        index("transactions_type_idx").on(t.type),
        index("transactions_status_idx").on(t.status),
        index("transactions_asset_idx").on(t.assetId),
        index("transactions_created_at_idx").on(t.createdAt),
        index("transactions_reference_idx").on(t.referenceId),
        uniqueIndex("transactions_tx_idempotency").on(t.idempotencyKey)
    ]
);

export const deposit_details = pgTable(
    "deposit_details",
    {
        txnId: uuid("txn_id")
            .primaryKey()
            .notNull()
            .references(() => transactions.id),
        userId: uuid("user_id").notNull(),
        assetId: varchar("asset_id", { length: 64 }).notNull(),
        source: varchar("source", { length: 32 }).notNull(),
        chain: varchar("chain", { length: 64 }),
        txHash: varchar("tx_hash", { length: 128 }),
        fromAddress: varchar("from_address", { length: 256 }),
        toAddress: varchar("to_address", { length: 256 }),
        confirmations: integer("confirmations"),
        detectedAt: timestamp("detected_at", { withTimezone: true }),
        creditedAt: timestamp("credited_at", { withTimezone: true }),
        raw: jsonb("raw")
    },
    (t) => [uniqueIndex("deposit_tx_hash_asset_unq").on(t.txHash, t.assetId)]
);

export const fiat_deposit_details = pgTable(
    "fiat_deposit_details",
    {
        txnId: uuid("txn_id")
            .primaryKey()
            .notNull()
            .references(() => transactions.id),
        reference: varchar("reference", { length: 265 }).notNull(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id),
        assetId: varchar("asset_id", { length: 20 }).notNull(),
        detectedAt: timestamp("detected_at", { withTimezone: true }),
        creditedAt: timestamp("credited_at", { withTimezone: true }),
        raw: jsonb("raw")
    },
    (t) => [uniqueIndex("fiat_deposit_reference_asset_unq").on(t.reference, t.assetId, t.userId)]
);

export const transfer_details = pgTable(
    "transfer",
    {
        txnId: uuid("txn_id")
            .primaryKey()
            .notNull()
            .references(() => transactions.id),
        userId: uuid("user_id").notNull(),
        assetId: varchar("asset_id", { length: 64 }).notNull(),
        toAddress: varchar("to_address", { length: 256 }),
        fireblocksTxId: varchar("fireblocks_tx_id", { length: 128 }),
        networkFeeMinor: numeric("network_fee_minor", { precision: 78, scale: 0 }).default(sql`0`),
        serviceFeeMinor: numeric("service_fee_minor", { precision: 78, scale: 0 }).default(sql`0`),
        submittedAt: timestamp("submitted_at", { withTimezone: true }),
        broadcastAt: timestamp("broadcast_at", { withTimezone: true }),
        confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
        chain: varchar("chain", { length: 64 }),
        txHash: varchar("tx_hash", { length: 128 }),
        serviceFeeUsd: numeric("service_fee_usd", { precision: 20, scale: 2 }),
        networkFeeUsd: numeric("network_fee_usd", { precision: 20, scale: 2 }),
        raw: jsonb("raw")
    },
    (t) => [index("fireblockstxId_assetId_toAddress_idx").on(t.fireblocksTxId, t.assetId, t.toAddress)]
);

export const internal_transfer_details = pgTable("internal_transfer_details", {
    txnId: uuid("txn_id")
        .primaryKey()
        .notNull()
        .references(() => transactions.id),
    fromUserId: uuid("from_user_id").notNull(),
    toUserId: uuid("to_user_id").notNull(),
    assetId: varchar("asset_id", { length: 64 }).notNull(),
    memo: varchar("memo", { length: 256 })
});

export const swap_details = pgTable(
    "swap_details",
    {
        txnId: uuid("txn_id")
            .primaryKey()
            .notNull()
            .references(() => transactions.id),
        quoteId: uuid("quote_id")
            .notNull()
            .references(() => swap_quotes.id, { onDelete: "cascade" }),
        userId: uuid("user_id").notNull(),
        fromAssetId: varchar("from_asset_id", { length: 64 }).notNull(),
        toAssetId: varchar("to_asset_id", { length: 64 }).notNull(),
        fromAmountMinor: numeric("from_amount_minor", { precision: 78, scale: 0 })
            .default(sql`0`)
            .notNull(),
        toAmountMinor: numeric("to_amount_minor", { precision: 78, scale: 0 })
            .default(sql`0`)
            .notNull(),
        priceQuoted: varchar("price_quoted", { length: 64 }),
        provider: varchar("provider", { length: 64 }),
        feeMinor: numeric("fee_minor", { precision: 78, scale: 0 })
            .default(sql`0`)
            .notNull(),
        executedAt: timestamp("executed_at", { withTimezone: true }),
        feeUsd: numeric("fee_usd", { precision: 20, scale: 2 }),
        fromAmountUsd: numeric("from_amount_usd", { precision: 20, scale: 2 }),
        toAmountUsd: numeric("to_amount_usd", { precision: 20, scale: 2 }),
        raw: jsonb("raw")
    },
    (t) => [
        index("swaps_user_idx").on(t.userId),
        index("swaps_from_asset_idx").on(t.fromAssetId),
        index("swaps_to_asset_idx").on(t.toAssetId),
        uniqueIndex("swaps_quote_id_unique").on(t.quoteId)
    ]
);

export const swap_quotes = pgTable(
    "swap_quotes",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: uuid("user_id").notNull(),
        fromAssetId: varchar("from_asset_id", { length: 64 }).notNull(),
        toAssetId: varchar("to_asset_id", { length: 64 }).notNull(),
        amountIn: numeric("amount_in", { precision: 36, scale: 18 }).notNull(),
        amountOut: numeric("amount_out", { precision: 36, scale: 18 }).notNull(),
        rate: numeric("rate", { precision: 36, scale: 18 }).notNull(),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        status: varchar("status", { length: 32 }).default("PENDING").notNull(), // PENDING|EXPIRED|EXECUTED|CANCELLED|EXECUTING
        feeBps: integer("fee_bps").default(0),
        slippageBps: integer("slippage_bps").default(50),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        executedAt: timestamp("executed_at", { withTimezone: true })
    },
    (t) => [
        index("swap_quotes_user_idx").on(t.userId),
        index("swap_quotes_status_idx").on(t.status),
        index("swap_quotes_from_asset_idx").on(t.fromAssetId),
        index("swap_quotes_to_asset_idx").on(t.toAssetId),
        uniqueIndex("swap_quotes_id_unique").on(t.id),
        index("swap_quotes_user_status_exp_idx").on(t.status, t.userId, t.expiresAt)
    ]
);

export const fiat_payout_details = pgTable(
    "fiat_payout_details",
    {
        txnId: uuid("txn_id")
            .primaryKey()
            .notNull()
            .references(() => transactions.id),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id),
        assetId: varchar("asset_id", { length: 64 }).notNull(),
        amountMinor: numeric("amount_minor", { precision: 78, scale: 0 }).notNull(),
        feeMinor: numeric("fee_minor", { precision: 78, scale: 0 }).notNull(), // platform service fee
        providerFeeMinor: numeric("provider_fee_minor", { precision: 78, scale: 0 }), // FiveWest fee, set on settlement
        bankName: varchar("bank_name", { length: 128 }).notNull(),
        bankCode: varchar("bank_code", { length: 32 }),
        accountNumber: varchar("account_number", { length: 350 }).notNull(),
        accountName: varchar("account_name", { length: 512 }).notNull(),
        reference: varchar("reference", { length: 128 }).notNull(),
        externalId: varchar("external_id", { length: 128 }),
        batchReference: varchar("batch_reference", { length: 128 }),
        status: varchar("status", { length: 32 }).notNull(), // PENDING, COMPLETED, FAILED
        failedReason: text("failed_reason"),
        channel: varchar("channel", { length: 32 }), // RTC, PAYSHAP
        quoteId: uuid("quote_id"), // For crypto-funded payouts
        feeUsd: numeric("fee_usd", { precision: 20, scale: 2 }),
        submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
    },
    (t) => [
        index("fiat_payout_user_idx").on(t.userId),
        uniqueIndex("fiat_payout_external_id_unq").on(t.externalId),
        index("fiat_payout_batch_ref_idx").on(t.batchReference),
        index("fiat_payout_reference_idx").on(t.reference),
        index("fiat_payout_status_submitted_idx").on(t.status, t.submittedAt)
    ]
);
