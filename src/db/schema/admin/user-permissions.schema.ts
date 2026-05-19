import { index, pgTable, primaryKey, timestamp, uuid, boolean } from "drizzle-orm/pg-core";

import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { users } from "../users.schema";
import { permissions } from "./permissions.schema";

export const userPermissions = pgTable(
    "user_permissions",
    {
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        permissionId: uuid("permission_id")
            .notNull()
            .references(() => permissions.id, { onDelete: "cascade" }),
        isDenied: boolean("is_denied").default(false).notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull()
    },
    (t) => [primaryKey(t.userId, t.permissionId), index("user_permissions_permission_idx").on(t.permissionId)]
);

export type UserPermission = typeof userPermissions.$inferSelect;
export type NewUserPermission = typeof userPermissions.$inferInsert;

export const createUserPermissionSchema = createInsertSchema(userPermissions);
export const userPermissionSchema = createSelectSchema(userPermissions);
