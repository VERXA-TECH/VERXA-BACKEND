import { relations } from "drizzle-orm";
import { pgTable, uuid, varchar, jsonb, timestamp, text } from "drizzle-orm/pg-core";
import { emailEvents } from "./email-events.schema";
import { enumCheck } from "../utils";

export enum EmailStatus {
    PENDING = "pending",
    SENT = "sent",
    DELIVERED = "delivered",
    OPENED = "opened",
    CLICKED = "clicked",
    BOUNCED = "bounced",
    FAILED = "failed",
}

export const EMAIL_STATUSES = Object.values(EmailStatus) as [EmailStatus, ...EmailStatus[]];

export const emailLogs = pgTable(
    "email_logs",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        messageId: varchar("message_id", { length: 255 }).notNull(),
        from: varchar("from", { length: 255 }).notNull(),
        to: varchar("to", { length: 255 }).notNull(),
        subject: text("subject").notNull(),
        html: text("html").notNull(),
        context: jsonb("context"),
        status: text("status", { enum: EMAIL_STATUSES }).$type<EmailStatus>().default(EmailStatus.PENDING).notNull(),

        sentAt: timestamp("sent_at"),
        deliveredAt: timestamp("delivered_at"),
        openedAt: timestamp("opened_at"),
        firstClickedAt: timestamp("first_clicked_at"),
        bouncedAt: timestamp("bounced_at"),
        failedAt: timestamp("failed_at"),

        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    () => [enumCheck("email_logs_status_check", "status", EMAIL_STATUSES)]
);

export const emailLogsRelations = relations(emailLogs, ({ many }) => ({
    events: many(emailEvents),
}));

export type EmailLog = typeof emailLogs.$inferSelect;
export type NewEmailLog = typeof emailLogs.$inferInsert;
