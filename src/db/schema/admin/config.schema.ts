import { pgTable, varchar, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";

export const feature_flags = pgTable("feature_flags", {
    key: varchar("key", { length: 255 }).primaryKey(),
    enabled: boolean("enabled").notNull().default(false),
    description: text("description"),
    rules: jsonb("rules"), // Target specific users, roles, etc.
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});

export const global_settings = pgTable("global_settings", {
    key: varchar("key", { length: 255 }).primaryKey(),
    value: jsonb("value").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});

export const region_settings = pgTable("region_settings", {
    regionCode: varchar("region_code", { length: 10 }).primaryKey(), // ISO country code
    enabled: boolean("enabled").notNull().default(true),
    limits: jsonb("limits"), // Onboarding limits, eSim limits etc.
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
