import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, bigint, timestamp, uniqueIndex, check, numeric } from "drizzle-orm/pg-core";
import { users } from "../users.schema";
import { assets } from "../assets.schema";
export const user_asset_balances = pgTable(
    "user_asset_balances",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        assetId: varchar("asset_id", { length: 64 })
            .notNull()
            .references(() => assets.legacyId, { onDelete: "cascade" }),
        availableMinor: numeric("available_minor", { precision: 78, scale: 0 })
            .default(sql`0`)
            .notNull(),
        lockedMinor: numeric("locked_minor", { precision: 78, scale: 0 })
            .default(sql`0`)
            .notNull(),
        version: bigint("version", { mode: "bigint" })
            .notNull()
            .default(sql`0`),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
    },
    (t) => ({
        uniqUserAsset: uniqueIndex("user_asset_balances_user_asset_unq").on(t.userId, t.assetId),
        checkAvailableNonNegative: check("check_available_non_negative", sql`${t.availableMinor} >= 0`),
        checkLockedNonNegative: check("check_locked_non_negative", sql`${t.lockedMinor} >= 0`)
    })
);

export const user_asset_activations = pgTable(
    "user_asset_activations",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        assetId: varchar("asset_id", { length: 64 })
            .notNull()
            .references(() => assets.legacyId, { onDelete: "cascade" }),
        activatedAt: timestamp("activated_at", { withTimezone: true }).defaultNow().notNull()
    },
    (t) => ({
        uniqUserAsset: uniqueIndex("user_asset_activations_user_asset_unq").on(t.userId, t.assetId)
    })
);
