import { pgTable, uuid, varchar, timestamp, jsonb, text } from "drizzle-orm/pg-core";
import { enumCheck } from "../utils";

export enum ScheduledNotificationStatus {
    PENDING = "pending",
    PROCESSING = "processing",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled"
}

export enum ScheduledNotificationType {
    EMAIL = "email",
    PUSH = "push",
    IN_APP = "in_app",
    ALL = "all"
}

export enum ScheduledNotificationTarget {
    ALL = "all",
    FILTERED = "filtered",
    SPECIFIC = "specific"
}

export const SCHEDULED_NOTIFICATION_TYPES = Object.values(ScheduledNotificationType) as [
    ScheduledNotificationType,
    ...ScheduledNotificationType[]
];
export const SCHEDULED_NOTIFICATION_STATUSES = Object.values(ScheduledNotificationStatus) as [
    ScheduledNotificationStatus,
    ...ScheduledNotificationStatus[]
];
export const SCHEDULED_NOTIFICATION_TARGETS = Object.values(ScheduledNotificationTarget) as [
    ScheduledNotificationTarget,
    ...ScheduledNotificationTarget[]
];

export const scheduledNotifications = pgTable(
    "scheduled_notifications",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        type: text("type", { enum: SCHEDULED_NOTIFICATION_TYPES })
            .$type<ScheduledNotificationType>()
            .default(ScheduledNotificationType.ALL)
            .notNull(),
        target: text("target", { enum: SCHEDULED_NOTIFICATION_TARGETS })
            .$type<ScheduledNotificationTarget>()
            .default(ScheduledNotificationTarget.ALL)
            .notNull(),
        filters: jsonb("filters"),
        recipients: jsonb("recipients"),
        payload: jsonb("payload").notNull(),
        scheduledFor: timestamp("scheduled_for").notNull(),
        status: text("status", { enum: SCHEDULED_NOTIFICATION_STATUSES })
            .$type<ScheduledNotificationStatus>()
            .default(ScheduledNotificationStatus.PENDING)
            .notNull(),
        error: varchar("error"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull()
    },
    () => [
        enumCheck("scheduled_notif_status_check", "status", SCHEDULED_NOTIFICATION_STATUSES),
        enumCheck("scheduled_notif_type_check", "type", SCHEDULED_NOTIFICATION_TYPES),
        enumCheck("scheduled_notif_target_check", "target", SCHEDULED_NOTIFICATION_TARGETS)
    ]
);

export type ScheduledNotification = typeof scheduledNotifications.$inferSelect;
export type NewScheduledNotification = typeof scheduledNotifications.$inferInsert;
