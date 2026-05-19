import { sql } from "drizzle-orm";
import { check } from "drizzle-orm/pg-core";

/**
 * Creates a CHECK constraint for enum text columns
 *
 * @param name - The name of the CHECK constraint (e.g., "users_status_check")
 * @param column - The column name to check (e.g., "status")
 * @param values - Array of valid enum values
 * @returns A Drizzle check constraint
 *
 * @example
 * ```typescript
 * enumCheck("users_status_check", "status", ["active", "inactive", "pending"])
 * ```
 */
export const enumCheck = (name: string, column: string, values: string[]) =>
    check(name, sql.raw(`${column} IN (${values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ")})`));
