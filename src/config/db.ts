/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExtractTablesWithRelations } from "drizzle-orm";
import { PgTransaction } from "drizzle-orm/pg-core";
import { drizzle, PostgresJsDatabase, PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema";
import envConfig from "./env";
import logger from "./logger";
import { withOperationContext } from "../utils/loggerWithContext";

let connection: postgres.Sql | null = null;
let db: ReturnType<typeof drizzle> | null = null;

export type DbClient =
    | PostgresJsDatabase<Record<string, unknown>>
    | PgTransaction<
        PostgresJsQueryResultHKT,
        Record<string, unknown>,
        ExtractTablesWithRelations<Record<string, unknown>>
    >;

export function getDb() {
    if (db) return db;

    const connectionUrl =
        envConfig.db.url ||
        `postgresql://${encodeURIComponent(envConfig.db.user)}:${encodeURIComponent(envConfig.db.password)}@${envConfig.db.host}:${envConfig.db.port}/${envConfig.db.name
        }${envConfig.db.ssl ? "?sslmode=require" : ""}`;

    logger.info(
        "Database connection initiated",
        withOperationContext("system", {
            host: envConfig.db.host,
            port: envConfig.db.port,
            database: envConfig.db.name,
            user: envConfig.db.user,
            ssl: envConfig.db.ssl,
            poolSize: envConfig.db.pool.max,
            action: "database_connection_initiated"
        })
    );

    connection = postgres(connectionUrl, {
        max: envConfig.db.pool.max,
        idle_timeout: envConfig.db.pool.idleTimeoutMillis / 1000,
        connect_timeout: 10
    });

    db = drizzle(connection, {
        schema
    });

    const startTime = Date.now();
    connection`SELECT 1`
        .then(() =>
            logger.info(
                "Connected to Database",
                withOperationContext("system", {
                    host: envConfig.db.host,
                    database: envConfig.db.name,
                    duration_ms: Date.now() - startTime,
                    action: "database_connected"
                })
            )
        )
        .catch((error: any) => {
            logger.error(
                "Error connecting to Database",
                withOperationContext("system", {
                    error: error instanceof Error ? error.message : "Unknown error",
                    stack: error instanceof Error ? error.stack : undefined,
                    host: envConfig.db.host,
                    database: envConfig.db.name,
                    duration_ms: Date.now() - startTime,
                    action: "error_connecting_to_database"
                })
            );
        });

    return db;
}

export async function closeDb() {
    const startTime = Date.now();
    if (connection) {
        logger.info(
            "Database shutdown initiated",
            withOperationContext("system", {
                duration_ms: Date.now() - startTime,
                action: "database_shutdown_initiated"
            })
        );
        await connection.end();
        logger.info(
            "Psql connection closed",
            withOperationContext("system", {
                duration_ms: Date.now() - startTime,
                action: "psql_connection_closed"
            })
        );
        connection = null;
        db = null;
    }
}

process.on("SIGINT", closeDb);
process.on("SIGTERM", closeDb);

export default getDb();
