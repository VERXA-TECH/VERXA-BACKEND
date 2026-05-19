import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, text, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";

import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const adminRoles = pgTable(
    "admin_roles",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        name: varchar("name", { length: 100 }).notNull().unique(),
        description: text("description"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
        isArchived: boolean("is_archived").default(false).notNull(),
        archivedAt: timestamp("archived_at"),
        isSystem: boolean("is_system").default(false).notNull()
    },
    (t) => [uniqueIndex("admin_roles_name_lower_unique").on(sql`lower(${t.name})`)]
);

export type AdminRole = typeof adminRoles.$inferSelect;
export type NewAdminRole = typeof adminRoles.$inferInsert;

export const createAdminRoleSchema = createInsertSchema(adminRoles);
export const adminRoleSchema = createSelectSchema(adminRoles);
