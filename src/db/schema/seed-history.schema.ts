import { pgTable, varchar, timestamp, primaryKey } from "drizzle-orm/pg-core";

export const seed_history = pgTable(
  "seed_history",
  {
    id: varchar("id", { length: 128 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    runAt: timestamp("run_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.id] })]
);
