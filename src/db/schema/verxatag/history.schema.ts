import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { verxatags } from "./index.schema";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const verxatagHistory = pgTable("verxatag_history", {
    id: uuid("id").defaultRandom().primaryKey(),
    verxatagId: uuid("verxatag_id")
        .notNull()
        .references(() => verxatags.id, { onDelete: "cascade" }),
    oldUsername: varchar("old_username", { length: 100 }).notNull(),
    newUsername: varchar("new_username", { length: 100 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const verxatagHistoryRelations = relations(verxatagHistory, ({ one }) => ({
    verxatag: one(verxatags, {
        fields: [verxatagHistory.verxatagId],
        references: [verxatags.id],
    }),
}));

export type VerxatagHistory = typeof verxatagHistory.$inferSelect;
export type NewVerxatagHistory = typeof verxatagHistory.$inferInsert;

export const createVerxatagHistorySchema = createInsertSchema(verxatagHistory);
export const verxatagHistorySchema = createSelectSchema(verxatagHistory);
