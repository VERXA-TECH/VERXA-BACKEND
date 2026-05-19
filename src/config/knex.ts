import type { Knex } from "knex";
import envConfig from "./env";

const { url, host, port, name, user, password, ssl, pool } = envConfig.db;

const base: Knex.Config = {
    client: "pg",
    connection: url
        ? url 
        : {
              host,
              port,
              database: name,
              user,
              password,
              ssl: ssl ? { rejectUnauthorized: false } : false,
          },
    pool: {
        min: pool.min,
        max: pool.max,
        idleTimeoutMillis: pool.idleTimeoutMillis,
    },
    migrations: {
        tableName: "knex_migrations",
        directory: "../database/migrations",
        extension: "ts",
    },
    seeds: {
        directory: "../database/seed",
        extension: "ts",
    },
};

const config: { [key: string]: Knex.Config } = {
    development: base,
    test: { ...base, pool: { min: 0, max: 1 } },
    production: base,
};

export default config;
module.exports = config; // for Knex CLI
