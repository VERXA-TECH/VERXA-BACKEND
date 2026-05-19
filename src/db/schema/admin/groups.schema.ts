import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, text, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";

import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const adminGroups = pgTable(
    "admin_groups",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        name: varchar("name", { length: 100 }).notNull().unique(),
        description: text("description"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
        isArchived: boolean("is_archived").default(false).notNull(),
        archivedAt: timestamp("archived_at")
    },
    (t) => [uniqueIndex("admin_groups_name_lower_unique").on(sql`lower(${t.name})`)]
);

export type AdminGroup = typeof adminGroups.$inferSelect;
export type NewAdminGroup = typeof adminGroups.$inferInsert;

export const createAdminGroupSchema = createInsertSchema(adminGroups);
export const adminGroupSchema = createSelectSchema(adminGroups);
