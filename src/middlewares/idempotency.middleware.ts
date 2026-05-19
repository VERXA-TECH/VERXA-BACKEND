/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { redis } from "../config/redis";
import logger from "../config/logger";
import { withContext } from "../utils/loggerWithContext";
import AppError from "../utils/appError";
import ResponseHelper from "../utils/helpers/response.helper";

/**
 * Idempotency Middleware
 * Prevents duplicate request processing for critical operations
 *
 * Uses a combination of user ID, endpoint, and request body to create
 * an idempotency key that prevents race conditions
 */
export class IdempotencyMiddleware {
    private static readonly DEFAULT_TTL = 60; // 60 seconds
    private static readonly PROCESSING_TTL = 30; // 30 seconds for processing

    /**
     * Generate idempotency key based on request parameters
     * @param userId - User ID making the request
     * @param endpoint - API endpoint being called
     * @param body - Request body
     * @returns Generated idempotency key
     */
    private static generateKey(userId: string, endpoint: string, body?: any): string {
        // Sort body keys for consistent hashing
        const sortedBody = body ? JSON.stringify(body, Object.keys(body).sort()) : "";
        const hash = crypto
            .createHash("sha256")
            .update(`${userId}:${endpoint}:${sortedBody}`)
            .digest("hex")
            .substring(0, 16);
        return `idempotency:${endpoint}:${userId}:${hash}`;
    }

    /**
     * Create middleware for idempotency protection
     * @param options - Configuration options
     * @returns Express middleware function
     */
    static create(options?: { ttl?: number; includeBody?: boolean; customKeyGenerator?: (req: Request) => string }) {
        return async (req: Request, res: Response, next: NextFunction) => {
            try {
                const userId = (req as any).userId || (req as any).user?.id;
                if (!userId) {
                    return next(new AppError("Unauthorized", ResponseHelper.UNAUTHORIZED));
                }

                // Generate idempotency key
                const endpoint = req.route?.path || req.path;
                const key = options?.customKeyGenerator
                    ? options.customKeyGenerator(req)
                    : this.generateKey(userId, endpoint, options?.includeBody !== false ? req.body : undefined);

                // Check if request is already being processed
                const existingResult = await redis.get(key);

                if (existingResult) {
                    const data = JSON.parse(existingResult);

                    if (data.status === "processing") {
                        logger.warn(
                            "Duplicate request detected - still processing",
                            withContext({
                                userId,
                                endpoint,
                                key,
                                action: "idempotency_duplicate_processing"
                            })
                        );

                        return res.status(409).json({
                            error: "Request is already being processed. Please wait and try again.",
                            code: "DUPLICATE_REQUEST_PROCESSING"
                        });
                    }

                    if (data.status === "completed" && data.response) {
                        logger.info(
                            "Duplicate request detected - returning cached response",
                            withContext({
                                userId,
                                endpoint,
                                key,
                                action: "idempotency_cached_response"
                            })
                        );

                        // Return cached successful response
                        return res.status(data.statusCode || 200).json(data.response);
                    }

                    if (data.status === "failed" && data.error) {
                        logger.info(
                            "Duplicate request detected - returning cached error",
                            withContext({
                                userId,
                                endpoint,
                                key,
                                action: "idempotency_cached_error"
                            })
                        );

                        // Return cached error response
                        return res.status(data.statusCode || 400).json({
                            error: data.error
                        });
                    }
                }

                await redis.set(
                    key,
                    JSON.stringify({ status: "processing", timestamp: Date.now() }),
                    this.PROCESSING_TTL
                );

                const originalJson = res.json.bind(res);
                const originalStatus = res.status.bind(res);
                let responseStatusCode = 200;

                // Override status to capture status code
                res.status = function (code: number) {
                    responseStatusCode = code;
                    return originalStatus(code);
                };

                res.json = function (body: any) {
                    const ttl = options?.ttl || IdempotencyMiddleware.DEFAULT_TTL;

                    if (responseStatusCode >= 200 && responseStatusCode < 300) {
                        redis
                            .set(
                                key,
                                JSON.stringify({
                                    status: "completed",
                                    response: body,
                                    statusCode: responseStatusCode,
                                    timestamp: Date.now()
                                }),
                                ttl
                            )
                            .catch((error) => {
                                logger.error(
                                    "Failed to cache idempotent response",
                                    withContext({
                                        key,
                                        error: error instanceof Error ? error.message : String(error),
                                        action: "idempotency_cache_error"
                                    })
                                );
                            });
                    } else if (responseStatusCode >= 400) {
                        redis
                            .set(
                                key,
                                JSON.stringify({
                                    status: "failed",
                                    error: body.error || body.message || "Request failed",
                                    statusCode: responseStatusCode,
                                    timestamp: Date.now()
                                }),
                                Math.min(ttl / 2, 30) // Cache errors for shorter duration
                            )
                            .catch((error) => {
                                logger.error(
                                    "Failed to cache idempotent error",
                                    withContext({
                                        key,
                                        error: error instanceof Error ? error.message : String(error),
                                        action: "idempotency_cache_error"
                                    })
                                );
                            });
                    }

                    return originalJson(body);
                };

                const errorHandler = (_error: any) => {
                    redis.del(key).catch((delError) => {
                        logger.error(
                            "Failed to delete idempotency key after error",
                            withContext({
                                key,
                                error: delError instanceof Error ? delError.message : String(delError),
                                action: "idempotency_key_delete_error"
                            })
                        );
                    });
                };

                res.on("error", errorHandler);
                res.on("finish", () => {
                    res.removeListener("error", errorHandler);
                });

                next();
            } catch (error) {
                logger.error(
                    "Idempotency middleware error",
                    withContext({
                        error: error instanceof Error ? error.message : String(error),
                        stack: error instanceof Error ? error.stack : undefined,
                        action: "idempotency_middleware_error"
                    })
                );

                // Continue without idempotency protection if middleware fails
                next();
            }
        };
    }

    /**
     * Create middleware for critical operations that should only run once
     * @param operationName - Name of the operation for logging
     * @returns Express middleware function
     */
    static forOperation(operationName: string) {
        return this.create({
            ttl: 300, // 5 minutes for critical operations
            includeBody: true,
            customKeyGenerator: (req: Request) => {
                const userId = (req as any).userId || (req as any).user?.id;
                return `critical:${operationName}:${userId}`;
            }
        });
    }
}

// Export convenience methods for common use cases
export const idempotentPinSet = IdempotencyMiddleware.create({
    ttl: 60,
    includeBody: true
});

export const idempotentMfaSetup = IdempotencyMiddleware.forOperation("mfa-setup");

export const idempotentCurrencySet = IdempotencyMiddleware.forOperation("currency-set");

export const idempotentProfileUpdate = IdempotencyMiddleware.create({
    ttl: 30,
    includeBody: true
});

export const idempotentDeviceToken = IdempotencyMiddleware.create({
    ttl: 60,
    includeBody: true
});
