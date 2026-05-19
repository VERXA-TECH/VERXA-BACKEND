import { adminRoles } from "./role.schema";
import { permissions } from "./permissions.schema";
import { pgTable, uuid, timestamp, primaryKey } from "drizzle-orm/pg-core";

export const rolePermissions = pgTable(
    "role_permissions",
    {
        roleId: uuid("role_id")
            .notNull()
            .references(() => adminRoles.id, { onDelete: "cascade" }),
        permissionId: uuid("permission_id")
            .notNull()
            .references(() => permissions.id, { onDelete: "cascade" }),
        createdAt: timestamp("created_at").defaultNow().notNull()
    },
    (t) => [primaryKey(t.roleId, t.permissionId)]
);

export type RolePermission = typeof rolePermissions.$inferSelect;
export type NewRolePermission = typeof rolePermissions.$inferInsert;
