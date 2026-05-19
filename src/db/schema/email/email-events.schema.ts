import { pgTable, varchar, timestamp, jsonb, text, index, uuid } from "drizzle-orm/pg-core";
import { emailLogs } from "./email-log.schema";

export const emailEvents = pgTable(
    "email_events",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        emailLogId: uuid("email_log_id")
            .notNull()
            .references(() => emailLogs.id),
        type: varchar("type", { length: 50 }).notNull(),
        timestamp: timestamp("timestamp").notNull().defaultNow(),

        ipAddress: varchar("ip_address", { length: 64 }),
        userAgent: text("user_agent"),
        clickedUrl: text("clicked_url"),
        reason: text("reason"),
        metadata: jsonb("metadata"),
        error: text("error"),

        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (t) => [index("email_events_email_log_id_idx").on(t.emailLogId), index("email_events_type_idx").on(t.type)]
);

export type EmailEvent = typeof emailEvents.$inferSelect;
export type NewEmailEvent = typeof emailEvents.$inferInsert;
