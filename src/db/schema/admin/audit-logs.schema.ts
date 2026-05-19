import { pgTable, uuid, varchar, jsonb, timestamp, inet, index, text } from "drizzle-orm/pg-core";
import { users } from "../users.schema";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { enumCheck } from "../utils";
export enum AuditLogStatus {
    PENDING = "pending",
    APPROVED = "approved",
    REJECTED = "rejected",
    COMPLETED = "completed"
}

export const AUDIT_LOG_STATUSES = Object.values(AuditLogStatus) as [AuditLogStatus, ...AuditLogStatus[]];

export const adminAuditLogs = pgTable(
    "admin_audit_logs",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        adminId: uuid("admin_id").references(() => users.id, { onDelete: "set null" }),
        adminRole: varchar("admin_role", { length: 50 }),
        action: varchar("action", { length: 100 }).notNull(),
        resource: varchar("resource", { length: 100 }),
        resourceId: varchar("resource_id", { length: 100 }),
        endpoint: varchar("endpoint", { length: 255 }).notNull(),
        method: varchar("method", { length: 10 }).notNull(),
        payload: jsonb("payload"),
        response: jsonb("response"),
        status: text("status", { enum: AUDIT_LOG_STATUSES })
            .$type<AuditLogStatus>()
            .default(AuditLogStatus.COMPLETED)
            .notNull(),
        ip: inet("ip"),
        userAgent: varchar("user_agent", { length: 255 }),
        createdAt: timestamp("created_at").defaultNow().notNull()
    },
    (t) => [
        index("admin_audit_logs_admin_id_idx").on(t.adminId),
        index("admin_audit_logs_action_idx").on(t.action),
        index("admin_audit_logs_status_idx").on(t.status),
        index("admin_audit_logs_resource_composite_idx").on(t.resource, t.resourceId),
        index("admin_audit_logs_created_at_idx").on(t.createdAt),
        enumCheck("admin_audit_logs_status_check", "status", AUDIT_LOG_STATUSES)
    ]
);

export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type NewAdminAuditLog = typeof adminAuditLogs.$inferInsert;

export const createAdminAuditLogSchema = createInsertSchema(adminAuditLogs);
export const adminAuditLogSchema = createSelectSchema(adminAuditLogs);
