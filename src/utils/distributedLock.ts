import { redis } from "../config/redis";
import logger from "../config/logger";
import { withOperationContext } from "../utils/loggerWithContext";
import crypto from "crypto";

/**
 * Distributed Lock implementation using Redis
 * Prevents race conditions in concurrent operations
 */
export class DistributedLock {
    private static readonly DEFAULT_TTL = 30000; // 30 seconds
    private static readonly DEFAULT_RETRY_DELAY = 50; // 50ms
    private static readonly DEFAULT_MAX_RETRIES = 100; // 5 seconds total wait time

    /**
     * Acquire a distributed lock
     * @param key - The lock key (e.g., "pin:set:userId")
     * @param ttl - Time to live in milliseconds (default 30 seconds)
     * @param maxRetries - Maximum number of retries (default 100)
     * @param retryDelay - Delay between retries in milliseconds (default 50ms)
     * @returns Object with success flag and lock token if acquired
     */
    static async acquire(
        key: string,
        ttl: number = this.DEFAULT_TTL,
        maxRetries: number = this.DEFAULT_MAX_RETRIES,
        retryDelay: number = this.DEFAULT_RETRY_DELAY
    ): Promise<{ success: boolean; token?: string; error?: string }> {
        const lockKey = `lock:${key}`;
        const token = crypto.randomBytes(16).toString("hex");

        logger.debug(
            "Attempting to acquire distributed lock",
            withOperationContext("system", {
                lockKey,
                ttl,
                maxRetries,
                action: "distributed_lock_acquire_attempt"
            })
        );

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const client = await redis.getClient();

                // Use SET with NX (only if not exists) and PX (expiry in milliseconds)
                const result = await client.set(lockKey, token, "PX", ttl, "NX");

                if (result === "OK") {
                    logger.info(
                        "Distributed lock acquired successfully",
                        withOperationContext("system", {
                            lockKey,
                            token,
                            ttl,
                            attempts: attempt + 1,
                            action: "distributed_lock_acquired"
                        })
                    );
                    return { success: true, token };
                }

                // Lock already exists, wait and retry
                if (attempt < maxRetries - 1) {
                    await new Promise((resolve) => setTimeout(resolve, retryDelay));
                }
            } catch (error) {
                logger.error(
                    "Error acquiring distributed lock",
                    withOperationContext("system", {
                        lockKey,
                        error: error instanceof Error ? error.message : String(error),
                        attempt,
                        action: "distributed_lock_acquire_error"
                    })
                );

                if (attempt === maxRetries - 1) {
                    return {
                        success: false,
                        error: `Failed to acquire lock after ${maxRetries} attempts`
                    };
                }
            }
        }

        logger.warn(
            "Failed to acquire distributed lock - timeout",
            withOperationContext("system", {
                lockKey,
                maxRetries,
                totalWaitTime: maxRetries * retryDelay,
                action: "distributed_lock_acquire_timeout"
            })
        );

        return {
            success: false,
            error: `Lock acquisition timeout after ${maxRetries} retries`
        };
    }

    /**
     * Release a distributed lock
     * @param key - The lock key
     * @param token - The lock token (to ensure we only release our own lock)
     * @returns Success flag
     */
    static async release(key: string, token: string): Promise<boolean> {
        const lockKey = `lock:${key}`;

        try {
            const client = await redis.getClient();

            // Lua script to ensure atomic check-and-delete
            // Only delete if the token matches (to prevent releasing someone else's lock)
            const luaScript = `
                if redis.call("get", KEYS[1]) == ARGV[1] then
                    return redis.call("del", KEYS[1])
                else
                    return 0
                end
            `;

            const result = (await client.eval(luaScript, 1, lockKey, token)) as number;

            if (result === 1) {
                logger.debug(
                    "Distributed lock released successfully",
                    withOperationContext("system", {
                        lockKey,
                        token,
                        action: "distributed_lock_released"
                    })
                );
                return true;
            } else {
                logger.warn(
                    "Failed to release lock - token mismatch or lock expired",
                    withOperationContext("system", {
                        lockKey,
                        token,
                        action: "distributed_lock_release_failed"
                    })
                );
                return false;
            }
        } catch (error) {
            logger.error(
                "Error releasing distributed lock",
                withOperationContext("system", {
                    lockKey,
                    token,
                    error: error instanceof Error ? error.message : String(error),
                    action: "distributed_lock_release_error"
                })
            );
            return false;
        }
    }

    /**
     * Execute a function with distributed lock protection
     * @param key - The lock key
     * @param fn - The function to execute
     * @param options - Lock options (ttl, maxRetries, retryDelay)
     * @returns The result of the function or error
     */
    static async withLock<T>(
        key: string,
        fn: () => Promise<T>,
        options?: {
            ttl?: number;
            maxRetries?: number;
            retryDelay?: number;
        }
    ): Promise<{ success: boolean; data?: T; error?: string }> {
        const lock = await this.acquire(key, options?.ttl, options?.maxRetries, options?.retryDelay);

        if (!lock.success) {
            return { success: false, error: lock.error };
        }

        try {
            const data = await fn();
            return { success: true, data };
        } catch (error) {
            logger.error(
                "Error executing function with distributed lock",
                withOperationContext("system", {
                    key,
                    error: error instanceof Error ? error.message : String(error),
                    action: "distributed_lock_execution_error"
                })
            );
            return {
                success: false,
                error: error instanceof Error ? error.message : "Function execution failed"
            };
        } finally {
            if (lock.token) {
                await this.release(key, lock.token);
            }
        }
    }

    /**
     * Check if a lock exists
     * @param key - The lock key
     * @returns Boolean indicating if lock exists
     */
    static async exists(key: string): Promise<boolean> {
        const lockKey = `lock:${key}`;
        try {
            const exists = await redis.exists(lockKey);
            return exists === 1;
        } catch (error) {
            logger.error(
                "Error checking lock existence",
                withOperationContext("system", {
                    lockKey,
                    error: error instanceof Error ? error.message : String(error),
                    action: "distributed_lock_exists_error"
                })
            );
            return false;
        }
    }
}

/**
 * Helper function to create standardized lock keys
 */
export const LockKeys = {
    pinSet: (userId: string, pinType: "unlock" | "transaction") => `pin:set:${pinType}:${userId}`,

    pinUpdate: (userId: string, pinType: "unlock" | "transaction") => `pin:update:${pinType}:${userId}`,

    pinReset: (userId: string, pinType: "unlock" | "transaction") => `pin:reset:${pinType}:${userId}`,

    profileUpdate: (userId: string) => `profile:update:${userId}`,

    walletOperation: (userId: string, operation: string) => `wallet:${operation}:${userId}`,

    transactionCreate: (userId: string, idempotencyKey?: string) =>
        idempotencyKey ? `transaction:create:${idempotencyKey}` : `transaction:create:${userId}:${Date.now()}`,

    kycUpdate: (userId: string) => `kyc:update:${userId}`,

    deviceToken: (userId: string) => `device:token:${userId}`,

    mfaSetup: (userId: string) => `mfa:setup:${userId}`,

    currencyUpdate: (userId: string) => `currency:update:${userId}`
};
