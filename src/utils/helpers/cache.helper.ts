import { redis } from "../../config/redis";
import logger from "../../config/logger";

export class CacheHelper {
    private static DEFAULT_TTL = 300; // 5 minutes

    static async getCached<T>(key: string): Promise<T | null> {
        try {
            const cached = await redis.get(key);
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            logger.error("Error fetching cached data", { key, error });
            return null;
        }
    }

    static async setCache(key: string, data: unknown, ttl: number = this.DEFAULT_TTL): Promise<void> {
        try {
            const payload = JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
            await redis.set(key, payload, ttl);
        } catch (error) {
            logger.error("Error setting cache", { key, error });
        }
    }

    static async deleteCache(key: string): Promise<void> {
        try {
            await redis.del(key);
        } catch (error) {
            logger.error("Error deleting cache", { key, error });
        }
    }
}
