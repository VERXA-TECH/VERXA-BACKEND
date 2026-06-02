import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const reservedVerxatags = pgTable("reserved_verxatags", {
    id: uuid("id").defaultRandom().primaryKey(),
    username: varchar("username", { length: 100 }).notNull(),
    dummyEmail: varchar("dummy_email", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ReservedVerxatags = typeof reservedVerxatags.$inferSelect;
export type NewReservedVerxatags = typeof reservedVerxatags.$inferInsert;

export const createReservedVerxatagsSchema = createInsertSchema(reservedVerxatags);
export const reservedVerxatagsSchema = createSelectSchema(reservedVerxatags);
