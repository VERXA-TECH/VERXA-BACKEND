import { pgTable, uuid, varchar, timestamp, integer, index, uniqueIndex, text } from "drizzle-orm/pg-core";
import { users } from "../users.schema";
import { relations } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { enumCheck } from "../utils";

export enum VerxatagStatus {
    ACTIVE = "active",
    INACTIVE = "inactive"
}

export const VERXATAG_STATUSES = Object.values(VerxatagStatus) as [VerxatagStatus, ...VerxatagStatus[]];

export const verxatags = pgTable(
    "verxatags",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        username: varchar("username", { length: 100 }).unique().notNull(),
        changeCount: integer("change_count").default(0).notNull(),
        changeAt: timestamp("change_at", { withTimezone: true }),
        status: text("status", { enum: VERXATAG_STATUSES })
            .$type<VerxatagStatus>()
            .default(VerxatagStatus.ACTIVE)
            .notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at")
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull()
    },
    (t) => [
        index("verxatags_username_idx").on(t.username),
        index("verxatags_user_id_idx").on(t.userId),
        uniqueIndex("verxatag_user_id_unique")
            .on(t.userId)
            .where(sql`${t.status} = '${VerxatagStatus.ACTIVE}'`),
        enumCheck("verxatags_status_check", "status", VERXATAG_STATUSES)
    ]
);

export const verxatagRelations = relations(verxatags, ({ one }) => ({
    user: one(users, {
        fields: [verxatags.userId],
        references: [users.id]
    })
}));

export type Verxatag = typeof verxatags.$inferSelect;
export type NewVerxatag = typeof verxatags.$inferInsert;

export const createVerxatagSchema = createInsertSchema(verxatags);
export const verxatagSchema = createSelectSchema(verxatags);
