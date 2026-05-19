import { pgTable, uuid, varchar, timestamp, json, index, text } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { adminRoles } from "./role.schema";
import { adminGroups } from "./groups.schema";
import { users } from "../users.schema";
import { enumCheck } from "../utils";

export enum InvitationStatus {
    PENDING = "pending",
    ACCEPTED = "accepted",
    EXPIRED = "expired"
}

export const INVITATION_STATUSES = Object.values(InvitationStatus) as [InvitationStatus, ...InvitationStatus[]];

export const adminInvitations = pgTable(
    "admin_invitations",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        email: varchar("email", { length: 255 }).notNull(),
        tokenHash: varchar("token_hash", { length: 255 }).notNull().unique(),
        roleId: uuid("role_id")
            .notNull()
            .references(() => adminRoles.id, { onDelete: "cascade" }),
        groupId: uuid("group_id").references(() => adminGroups.id, { onDelete: "set null" }),
        customPermissions: json("custom_permissions"),
        excludedPermissions: json("excluded_permissions"),
        expiresAt: timestamp("expires_at").notNull(),
        invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
        status: text("status", { enum: INVITATION_STATUSES })
            .$type<InvitationStatus>()
            .default(InvitationStatus.PENDING)
            .notNull(),
        sentAt: timestamp("sent_at").defaultNow().notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull()
    },
    (t) => [
        index("admin_invitations_email_idx").on(t.email),
        index("admin_invitations_token_hash_idx").on(t.tokenHash),
        enumCheck("admin_invitations_status_check", "status", INVITATION_STATUSES)
    ]
);

export type AdminInvitation = typeof adminInvitations.$inferSelect;
export type NewAdminInvitation = typeof adminInvitations.$inferInsert;

export const createAdminInvitationSchema = createInsertSchema(adminInvitations);
export const adminInvitationSchema = createSelectSchema(adminInvitations);
