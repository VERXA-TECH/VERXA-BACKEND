import { pgTable, uuid, varchar, timestamp, text, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { users } from "./users.schema";
import { enumCheck } from "./utils";

export enum UserDeviceStatus {
    PENDING = "pending",
    ACTIVE = "active",
    REVOKED = "revoked"
}

export const USER_DEVICE_STATUSES = Object.values(UserDeviceStatus) as [UserDeviceStatus, ...UserDeviceStatus[]];

export const userDevices = pgTable(
    "user_devices",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        deviceId: varchar("device_id", { length: 255 }).notNull(),
        deviceName: varchar("device_name", { length: 255 }).notNull(),
        fingerprintHash: varchar("fingerprint_hash", { length: 255 }).notNull(),
        ip: varchar("ip", { length: 64 }),
        userAgent: text("user_agent"),
        os: varchar("os", { length: 100 }),
        deviceTrustTokenHash: varchar("device_trust_token_hash", { length: 255 }),
        deviceTrustTokenIssuedAt: timestamp("device_trust_token_issued_at"),
        deviceTrustTokenExpiresAt: timestamp("device_trust_token_expires_at"),
        refreshTokenJti: varchar("refresh_token_jti", { length: 64 }),
        refreshTokenHash: varchar("refresh_token_hash", { length: 255 }),
        status: text("status", { enum: USER_DEVICE_STATUSES })
            .$type<UserDeviceStatus>()
            .default(UserDeviceStatus.PENDING),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        lastActiveAt: timestamp("last_active_at").defaultNow().notNull(),
        expiresAt: timestamp("expires_at"),
        revokedAt: timestamp("revoked_at"),
        deviceToken: varchar("device_token", { length: 255 }),
        country: varchar("country", { length: 100 }),
        lastCountry: varchar("last_country", { length: 100 })
    },
    (t) => [
        uniqueIndex("user_device_userid_deviceid_idx").on(t.userId, t.deviceId),
        index("user_devices_user_id_idx").on(t.userId),
        index("user_devices_refresh_token_jti_idx").on(t.refreshTokenJti),
        index("user_devices_user_id_status_idx").on(t.userId, t.status),
        index("user_devices_expires_at_idx").on(t.expiresAt),
        index("user_devices_trust_expires_at_idx").on(t.deviceTrustTokenExpiresAt),
        enumCheck("user_devices_status_check", "status", USER_DEVICE_STATUSES)
    ]
);

export type UserDevice = typeof userDevices.$inferSelect;
export type NewUserDevice = typeof userDevices.$inferInsert;

export const createUserDeviceSchema = createInsertSchema(userDevices);
export const userDeviceSchema = createSelectSchema(userDevices);
