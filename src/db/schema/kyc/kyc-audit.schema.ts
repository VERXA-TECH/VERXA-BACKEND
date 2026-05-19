import { pgTable, uuid, varchar, jsonb, timestamp, inet, integer, boolean, index } from "drizzle-orm/pg-core";

export const kyc_token_audit = pgTable(
    "kyc_token_audit",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: uuid("user_id").notNull(),
        levelName: varchar("level_name", { length: 120 }).notNull(),
        applicantId: varchar("applicant_id", { length: 128 }),
        sumsubCorrelationId: varchar("sumsub_correlation_id", { length: 128 }),
        ip: inet("ip"),
        forwardedFor: varchar("forwarded_for", { length: 512 }),
        userAgent: varchar("user_agent", { length: 512 }),
        requestId: varchar("request_id", { length: 128 }),
        env: varchar("env", { length: 16 }),
        success: boolean("success").notNull().default(false),
        httpStatus: integer("http_status"),
        errorName: varchar("error_name", { length: 128 }),
        errorCode: varchar("error_code", { length: 64 }),
        meta: jsonb("meta"),
        tokenHash: varchar("token_hash", { length: 255 }),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        latencyMs: integer("latency_ms"),
    },
    (t) => [index("kyc_token_audit_user_id_idx").on(t.userId), index("kyc_token_audit_created_at_idx").on(t.createdAt)]
);
