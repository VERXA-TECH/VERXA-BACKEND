import { relations } from "drizzle-orm";
import { users } from "./users.schema";
import { pgTable, uuid, varchar, text, timestamp, unique } from "drizzle-orm/pg-core";

export const oauthProviders = pgTable(
    "oauth_providers",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        provider: varchar("provider", { length: 50 }).notNull(),
        providerId: varchar("provider_id", { length: 255 }).notNull(),
        accessToken: text("access_token"),
        refreshToken: text("refresh_token"),
        idToken: text("id_token"),
        tokenExpiry: timestamp("token_expiry"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    (t) => [unique().on(t.userId, t.provider), unique().on(t.provider, t.providerId)]
);

export const oauthProvidersRelations = relations(oauthProviders, ({ one }) => ({
    user: one(users, {
        fields: [oauthProviders.userId],
        references: [users.id],
    }),
}));
