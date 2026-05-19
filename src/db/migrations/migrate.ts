/* eslint-disable @typescript-eslint/no-explicit-any */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const toNumber = (v: any, d: number) => (v == null || v === "" ? d : Number(v));

function parseDbUrl(dbUrl: string) {
    try {
        const u = new URL(dbUrl);
        const host = u.hostname;
        const port = toNumber(u.port || 5432, 5432);
        const user = decodeURIComponent(u.username || "");
        const password = decodeURIComponent(u.password || "");
        const name = (u.pathname || "").replace(/^\//, "");
        const sslMode = u.searchParams.get("sslmode");
        const ssl = process.env.DB_SSL === "true" || sslMode === "require" || sslMode === "verify-full";

        return { url: dbUrl, host, port, user, password, name, ssl };
    } catch {
        return null;
    }
}

async function runMigrations() {
    try {
        const DB_URL = process.env.DB_URL || process.env.DATABASE_URL;
        const parsed = DB_URL ? parseDbUrl(DB_URL) : null;

        const connectionUrl =
            parsed?.url ||
            `postgresql://${encodeURIComponent(process.env.DB_USER || "")}:${encodeURIComponent(
                process.env.DB_PASSWORD || ""
            )}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}${
                process.env.DB_SSL === "true" ? "?sslmode=require" : ""
            }`;

        if (!connectionUrl || connectionUrl.includes("undefined")) {
            console.error("Database connection URL is not properly configured.");
            console.error(
                "Please ensure DB_URL or (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME) environment variables are set."
            );
            process.exit(1);
        }

        console.log("🔄 Connecting to database for migrations...");
        const migrationClient = postgres(connectionUrl, { max: 1 });

        // Ensure public schema exists and set search_path
        console.log("🔧 Setting up database schema...");
        await migrationClient`CREATE SCHEMA IF NOT EXISTS public`;
        await migrationClient`SET search_path TO public`;

        const db = drizzle(migrationClient);

        console.log("Running database migrations...");

        await migrate(db, {
            migrationsFolder: path.join(__dirname, ".")
        });

        console.log("Migrations completed successfully!");

        await migrationClient.end();
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
}

if (require.main === module) {
    void runMigrations();
}

export default runMigrations;
