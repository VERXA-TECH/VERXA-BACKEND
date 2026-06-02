import { sql } from "drizzle-orm";
import {
    pgTable,
    uuid,
    varchar,
    boolean,
    timestamp,
    integer,
    uniqueIndex,
    text,
    AnyPgColumn,
    index,
    jsonb
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { adminRoles } from "./admin/role.schema";
import { adminGroups } from "./admin/groups.schema";
import { enumCheck } from "./utils";

export enum Currency {
    USDT = "USDT",
    USD = "USD",
    EURO = "EURO",
    GBP = "GBP",
    SAR = "SAR",
    NGN = "NGN",
    JPY = "JPY",
    AED = "AED",
    KES = "KES",
    GHS = "GHS",
    ZAR = "ZAR"
}

export enum Language {
    EN_US = "en-US",
    EN_GB = "en-GB",
    AR = "ar"
}

export enum Role {
    BASIC_USER = "basic-user",
    ADMIN = "admin",
    SUPER_ADMIN = "super-admin"
}

export const CURRENCIES = Object.values(Currency) as [Currency, ...Currency[]];
export const LANGUAGES = Object.values(Language) as [Language, ...Language[]];
export const ROLES = Object.values(Role) as [Role, ...Role[]];

export interface AvatarHistoryEntry {
    url: string;
    uploadedAt: Date;
    key: string;
}

export interface AvatarHistory {
    current: string | null;
    history: AvatarHistoryEntry[];
}

export const users = pgTable(
    "users",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        email: varchar("email", { length: 255 }).notNull().unique(),
        username: varchar("username", { length: 100 }).unique(),
        passwordHash: varchar("password_hash", { length: 255 }),
        unlockPinHash: varchar("unlock_pin_hash", { length: 255 }),
        txnPinHash: varchar("txn_pin_hash", { length: 255 }),
        biometricEnabled: boolean("biometric_enabled").default(false),
        firstName: varchar("first_name", { length: 100 }),
        middleName: varchar("middle_name", { length: 100 }),
        lastName: varchar("last_name", { length: 100 }),
        gender: varchar("gender", { length: 50 }),
        phoneNumber: varchar("phone_number", { length: 20 }),
        avatar: varchar("avatar", { length: 255 }),
        avatarHistory: jsonb("avatar_history").$type<AvatarHistory>(),
        purposes: jsonb("purposes").$type<string[]>(),
        country: varchar("country", { length: 2 }),
        currency: text("currency", { enum: CURRENCIES }).$type<Currency>().default(Currency.USDT).notNull(),
        language: text("language", { enum: LANGUAGES }).$type<Language>().default(Language.EN_US).notNull(),
        referredBy: uuid("referred_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
        isActive: boolean("is_active").default(true),
        isAmbassador: boolean("is_ambassador").default(false),
        emailVerified: boolean("email_verified").default(false),
        emailVerifiedAt: timestamp("email_verified_at"),
        failedLoginAttempts: integer("failed_login_attempts").default(0).notNull(),
        lockoutUntil: timestamp("lockout_until"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
        mfaEnabled: boolean("mfa_enabled").notNull().default(false),
        mfaSecretEnc: text("mfa_secret_enc"),
        deleteRequestedAt: timestamp("delete_requested_at"),
        deleteEffectiveAt: timestamp("delete_effective_at"),
        isArchived: boolean("is_archived").notNull().default(false),
        archivedAt: timestamp("archived_at"),
        archiveReason: text("archive_reason"),
        statusReason: text("status_reason"),
        pushNotificationEnabled: boolean("push_notification_enabled").notNull().default(false),
        emailNotificationEnabled: boolean("email_notification_enabled").notNull().default(true),
        telegramNotificationEnabled: boolean("telegram_notification_enabled").notNull().default(true),
        isPnd: boolean("is_pnd").notNull().default(false),
        pndReason: text("pnd_reason"),
        role: text("role", { enum: ROLES }).$type<Role>().notNull().default(Role.BASIC_USER),
        telegramChatId: varchar("telegram_chat_id", { length: 64 }),
        telegramLinkedAt: timestamp("telegram_linked_at", { withTimezone: true }),
        adminRoleId: uuid("admin_role_id").references(() => adminRoles.id, { onDelete: "set null" }),
        adminGroupId: uuid("admin_group_id").references(() => adminGroups.id, { onDelete: "set null" })
    },
    (t) => [
        uniqueIndex("users_username_lower_unique").on(sql`lower(${t.username})`),
        uniqueIndex("users_email_lower_unique").on(sql`lower(${t.email})`),
        index("users_telegram_chat_id_index").on(t.telegramChatId),
        enumCheck("users_currency_check", "currency", CURRENCIES),
        enumCheck("users_language_check", "language", LANGUAGES),
        enumCheck("users_role_check", "role", ROLES)
    ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const createUserSchema = createInsertSchema(users);
export const userSchema = createSelectSchema(users);
