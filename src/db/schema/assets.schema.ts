import {
    pgTable,
    uuid,
    varchar,
    text,
    boolean,
    integer,
    timestamp,
    uniqueIndex,
    primaryKey,
    bigint
} from "drizzle-orm/pg-core";
export const blockchains = pgTable(
    "blockchains",
    {
        id: uuid("id").notNull(),
        legacyId: varchar("legacy_id", { length: 64 }).notNull(),
        displayName: varchar("display_name", { length: 256 }).notNull(),
        protocol: varchar("protocol", { length: 32 }).notNull(),
        chainId: varchar("chain_id", { length: 64 }),
        isTestnet: boolean("is_testnet").notNull().default(false),
        signingAlgo: varchar("signing_algo", { length: 64 }),
        explorerBase: varchar("explorer_base", { length: 512 }),
        explorerAddressTmpl: varchar("explorer_address_tmpl", { length: 512 }),
        explorerTxTmpl: varchar("explorer_tx_tmpl", { length: 512 }),
        deprecated: boolean("deprecated").notNull().default(false),
        iconUrl: text("icon_url"),
        scope: varchar("scope", { length: 32 }), // usually "GLOBAL"
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow()
    },
    (t) => ({
        pk: primaryKey({ columns: [t.id] }),
        uniqLegacy: uniqueIndex("blockchains_legacy_uniq").on(t.legacyId)
    })
);

export const assets = pgTable(
    "assets",
    {
        id: uuid("id").notNull(),
        legacyId: varchar("legacy_id", { length: 64 }).notNull().unique(),
        blockchainId: uuid("blockchain_id"),
        displayName: varchar("display_name", { length: 256 }).notNull(),
        displaySymbol: varchar("display_symbol", { length: 64 }).notNull(),
        assetClass: varchar("asset_class", { length: 32 }).notNull(),
        onchainSymbol: varchar("onchain_symbol", { length: 128 }),
        tokenAddress: varchar("token_address", { length: 256 }),
        decimals: integer("decimals"),
        standardsCsv: text("standards_csv"),
        scope: varchar("scope", { length: 32 }),
        verified: boolean("verified").notNull().default(false),
        deprecated: boolean("deprecated").notNull().default(false),
        iconUrl: text("icon_url"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow()
    },
    (t) => ({
        pk: primaryKey({ columns: [t.id] }),
        uniqLegacy: uniqueIndex("assets_legacy_uniq").on(t.legacyId)
    })
);

export const asset_fees = pgTable(
    "asset_fees",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        assetId: uuid("asset_id")
            .notNull()
            .references(() => assets.id),
        blockchainId: uuid("blockchain_id").references(() => blockchains.id),
        transferFee: bigint("transfer_fee", { mode: "bigint" }).notNull(),
        createdAt: timestamp("created_at").defaultNow(),
        updatedAt: timestamp("updated_at").defaultNow()
    },
    (t) => ({
        uniq: uniqueIndex("asset_fee_asset_chain_uniq").on(t.assetId, t.blockchainId)
    })
);
