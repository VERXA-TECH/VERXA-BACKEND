import { pgTable, varchar, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const idempotency_keys = pgTable(
    "idempotency_keys",
    {
        key: varchar("key", { length: 128 }).primaryKey(),
        scope: varchar("scope", { length: 64 }).notNull(),
        response: jsonb("response"),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        expiresAt: timestamp("expires_at", { withTimezone: true }),
    },
    (t) => ({
        uniqScopeKey: uniqueIndex("idempotency_scope_key_unq").on(t.scope, t.key),
    })
);
