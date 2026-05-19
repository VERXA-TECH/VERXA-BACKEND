import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, text, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";

import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const permissions = pgTable(
    "permissions",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        key: varchar("key", { length: 150 }).notNull().unique(),
        description: text("description"),
        category: varchar("category", { length: 100 }),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
        isArchived: boolean("is_archived").default(false).notNull(),
        archivedAt: timestamp("archived_at"),
        isSystem: boolean("is_system").default(false).notNull()
    },
    (t) => [uniqueIndex("permissions_key_lower_unique").on(sql`lower(${t.key})`)]
);

export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;

export const createPermissionSchema = createInsertSchema(permissions);
export const permissionSchema = createSelectSchema(permissions);
