import { pgTable, uuid, varchar, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { userDevices } from "./devices.schema";

export const deviceTrustTokenHistory = pgTable(
    "device_trust_token_history",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        deviceId: uuid("device_id")
            .notNull()
            .references(() => userDevices.id, { onDelete: "cascade" }),
        tokenHash: varchar("token_hash", { length: 255 }).notNull(),
        rotatedAt: timestamp("rotated_at").defaultNow().notNull(),
        expiresAt: timestamp("expires_at").notNull(),
    },
    (t) => [
        uniqueIndex("device_trust_token_history_token_hash_idx").on(t.tokenHash),
        index("device_trust_token_history_device_idx").on(t.deviceId),
        index("device_trust_token_history_expires_at_idx").on(t.expiresAt),
    ],
);

export type DeviceTrustTokenHistory = typeof deviceTrustTokenHistory.$inferSelect;
export type NewDeviceTrustTokenHistory = typeof deviceTrustTokenHistory.$inferInsert;
