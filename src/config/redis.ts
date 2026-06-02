/* eslint-disable @typescript-eslint/no-explicit-any */

import RedisClient from "ioredis";
import logger from "./logger";
import envConfig from "./env";
import DailyQueue from "../queues/daily.queue";
import { withOperationContext } from "../utils/loggerWithContext";

export default class RedisManager {
    private static instance: RedisManager;
    private client: RedisClient | null = null;
    private isConnecting = false;

    private constructor() { }

    static getInstance(): RedisManager {
        if (!RedisManager.instance) {
            RedisManager.instance = new RedisManager();
        }
        return RedisManager.instance;
    }

    /**
     * Synchronous method to get existing client instance
     * @returns
     */
    static getClient(): RedisClient | null {
        return RedisManager.getInstance().client;
    }

    /**
     * Asynchronous method to get existing client instance or connect
     * @returns
     */
    async getClientOrConnect(): Promise<RedisClient> {
        if (this.client && this.client.status === "ready") {
            return this.client;
        }

        if (this.isConnecting) {
            while (this.isConnecting) {
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
            if (this.client && this.client.status === "ready") {
                return this.client;
            }
        }

        return this.connect();
    }

    async exists(...keys: string[]): Promise<number> {
        const client = await this.getClientOrConnect();
        return client.exists(...keys);
    }

    private async connect(): Promise<RedisClient> {
        if (this.isConnecting) {
            throw new Error("Connection already in progress");
        }

        this.isConnecting = true;

        try {
            logger.info(
                "Redis connection initiated",
                withOperationContext("system", {
                    url: envConfig.redis.url,
                    action: "redis_connection_initiated"
                })
            );

            this.client = new RedisClient(envConfig.redis.url, {
                maxRetriesPerRequest: 3,
                enableReadyCheck: true,
                lazyConnect: true,
                keepAlive: 30000,
                reconnectOnError: (err) => err.message.includes("READONLY")
            });

            this.client.on("connect", () => {
                logger.info("Redis connecting...", withOperationContext("system", { action: "redis_connecting" }));
            });

             this.client.defineCommand("incrWithExpire", {
                 numberOfKeys: 1,
                 lua: "local v = redis.call('INCR', KEYS[1]); redis.call('EXPIRE', KEYS[1], ARGV[1]); return v",
             });


            this.client.on("error", (error) => {
                logger.error(
                    "Redis connection error:",
                    withOperationContext("system", {
                        error: error instanceof Error ? error.message : "Unknown error",
                        action: "redis_connection_error"
                    })
                );
            });

            this.client.on("close", () => {
                logger.warn(
                    "Redis connection closed",
                    withOperationContext("system", {
                        action: "redis_connection_closed"
                    })
                );
            });

            this.client.on("reconnecting", (ms: number) => {
                logger.info(
                    `Redis reconnecting in ${ms}ms`,
                    withOperationContext("system", { action: "redis_reconnecting" })
                );
            });

            this.client.on("ready", () => {
                logger.info("Redis connected and ready");
                this.scheduleJobs()
                    .then(() =>
                        logger.info(
                            "scheduleJobs() finished",
                            withOperationContext("system", { action: "schedule_jobs_finished" })
                        )
                    )
                    .catch((error) =>
                        logger.error(
                            "scheduleJobs() top-level error",
                            withOperationContext("system", {
                                message: error instanceof Error ? error.message : "Unknown error",
                                stack: error instanceof Error ? error.message : "Unknown error",
                                action: "schedule_jobs_error"
                            })
                        )
                    );
            });

            await this.client.connect();

            return this.client;
        } catch (error) {
            logger.error(
                "Failed to connect to Redis:",
                withOperationContext("system", {
                    error: error instanceof Error ? error.message : "Unknown error",
                    stack: error instanceof Error ? error.stack : undefined,
                    action: "redis_connection_failed"
                })
            );
            this.client = null;

            throw error;
        } finally {
            this.isConnecting = false;
        }
    }

    private async scheduleJobs(): Promise<void> {
        logger.info("scheduleJobs() entering");
        try {
            const leaderKey = "locks:scheduler:leader";

            const acquired = await this.client!.set(leaderKey, String(process.pid), "EX", 120, "NX");
            if (acquired !== "OK") {
                logger.info(
                    "Another instance is the scheduler leader; skipping scheduleJobs()",
                    withOperationContext("system", {
                        action: "schedule_jobs_skipped"
                    })
                );
                return;
            }

            await DailyQueue.add({}, { repeat: { cron: "0 0 * * *", tz: envConfig.timezone } });
        } catch (err: any) {
            logger.error(
                "scheduleJobs() failed",
                withOperationContext("system", {
                    message: err?.message,
                    stack: err?.stack,
                    action: "scheduleJobs_failed"
                })
            );
        }
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.quit();
            this.client = null;
            logger.info(
                "Redis connection closed",
                withOperationContext("system", {
                    action: "redis_connection_closed"
                })
            );
        }
    }
    //====== Utility methods for common operations ======

    async get(key: string): Promise<string | null> {
        const client = await this.getClientOrConnect();
        return client.get(key);
    }

    async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
        const client = await this.getClientOrConnect();
        if (ttlSeconds) {
            await client.setex(key, ttlSeconds, value);
        } else {
            await client.set(key, value);
        }
    }

    async del(key: string): Promise<void> {
        const client = await this.getClientOrConnect();
        await client.del(key);
    }

     async incr(key: string): Promise<number> {
        const client = await this.getClientOrConnect();
        return client.incr(key);
    }

    async incrEx(key: string, ttlSeconds: number): Promise<number> {
        const client = await this.getClientOrConnect();
        const result = await (
            client as unknown as { incrWithExpire: (k: string, ttl: string) => Promise<unknown> }
        ).incrWithExpire(key, ttlSeconds.toString());
        return Number(result);
    }

    async expire(key: string, ttlSeconds: number): Promise<void> {
        const client = await this.getClientOrConnect();
        await client.expire(key, ttlSeconds);
    }

    async ttl(key: string): Promise<number> {
        const client = await this.getClientOrConnect();
        return client.ttl(key);
    }


    async getDel(key: string): Promise<string | null> {
        const client = await this.getClientOrConnect();
        return client.getdel(key);
    }
}

// Singleton instance
const redisManager = RedisManager.getInstance();

// Redis client getter
export const getRedisClient = () => redisManager.getClientOrConnect();

// Utility methods for common operations
export const redis = {
    get: (key: string) => redisManager.get(key),
    set: (key: string, value: string, ttl?: number) => redisManager.set(key, value, ttl),
    del: (key: string) => redisManager.del(key),
    incr: (key: string) => redisManager.incr(key),
    expire: (key: string, ttl: number) => redisManager.expire(key, ttl),
    ttl: (key: string) => redisManager.ttl(key),
    exists: (...keys: string[]) => redisManager.exists(...keys),
    getClient: () => redisManager.getClientOrConnect(),
     getDel: (key: string) => redisManager.getDel(key),
     incrEx: (key: string, ttl: number) => redisManager.incrEx(key, ttl),
};

// Graceful shutdown
process.on("SIGINT", async () => {
    await redisManager.disconnect();
    process.exit(0);
});

process.on("SIGTERM", async () => {
    await redisManager.disconnect();
    process.exit(0);
});
