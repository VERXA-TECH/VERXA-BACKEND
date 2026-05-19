import { sql } from "drizzle-orm";
import {
    pgTable,
    uuid,
    varchar,
    text,
    timestamp,
    boolean,
    uniqueIndex,
    jsonb,
    index,
    numeric
} from "drizzle-orm/pg-core";

export const ledger_accounts = pgTable(
    "ledger_accounts",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: uuid("user_id"),
        assetId: varchar("asset_id", { length: 64 }),
        code: varchar("code", { length: 64 }).notNull(),
        name: varchar("name", { length: 128 }).notNull(),
        isActive: boolean("is_active").notNull().default(true),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
    },
    (t) => [uniqueIndex("ledger_accounts_user_asset_code_unq").on(t.userId, t.assetId, t.code)]
);

export const ledger_journals = pgTable(
    "ledger_journals",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        type: varchar("type", { length: 64 }).notNull(),
        txnId: uuid("txn_id"),
        idempotencyKey: varchar("idempotency_key", { length: 128 }),
        externalRef: varchar("external_ref", { length: 256 }),
        metadata: jsonb("metadata"),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        postedAt: timestamp("posted_at", { withTimezone: true }),
        memo: text("memo")
    },
    (t) => [
        index("ledger_journals_type_idx").on(t.type),
        index("ledger_journals_txn_idx").on(t.txnId),
        index("ledger_journals_idem_idx").on(t.idempotencyKey)
    ]
);

export const ledger_entries = pgTable(
    "ledger_entries",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        journalId: uuid("journal_id").notNull(),
        accountId: uuid("account_id").notNull(),
        side: varchar("side", { length: 2 }).notNull(),
        amountMinor: numeric("amount_minor", { precision: 78, scale: 0 })
            .default(sql`0`)
            .notNull(),
        assetId: varchar("asset_id", { length: 64 }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        posted: boolean("posted").notNull().default(false)
    },
    (t) => [
        index("ledger_entries_journal_idx").on(t.journalId),
        index("ledger_entries_acct_idx").on(t.accountId),
        index("ledger_entries_asset_idx").on(t.assetId),
        index("ledger_entries_posted_idx").on(t.posted),
        index("ledger_entries_acct_posted_idx").on(t.accountId, t.posted)
    ]
);
