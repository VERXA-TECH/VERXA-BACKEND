import { Request, Response, NextFunction } from "express";
import { RateLimiterRedis, RateLimiterMemory } from "rate-limiter-flexible";
import { getRedisClient } from "../config/redis";
import ResponseHelper from "../utils/helpers/response.helper";
import EmailService from "../services/email/email.service";
import logger from "../config/logger";

export type KeyGenerator = (req: Request) => string;
export type SkipFn = (req: Request) => boolean;
export type OnBlocked = (args: { req: Request; key: string; retrySecs: number }) => void | Promise<void>;

export interface LimiterOptions {
    keyPrefix: string;
    points: number; // max number of requests within duration
    duration: number; // per seconds window
    blockDuration?: number; // seconds to block after consuming more than points
    keyGenerator?: KeyGenerator;
    skip?: SkipFn;
    onBlocked?: OnBlocked;
}

/**
 * Distributed rate limiter middleware backed by Redis.
 * - Safe for horizontal scaling
 * - Pluggable key generator (default uses req.clientIp || req.ip)
 * - Sets standard rate limit headers and Retry-After on block
 */
export function createRateLimiter(options: LimiterOptions) {
    const { keyPrefix, points, duration, blockDuration = 0, keyGenerator, skip, onBlocked } = options;

    let limiter: RateLimiterRedis | null = null;

    async function getLimiter() {
        if (!limiter) {
            const client = await getRedisClient();
            limiter = new RateLimiterRedis({
                storeClient: client,
                keyPrefix,
                points,
                duration,
                blockDuration,
                insuranceLimiter: new RateLimiterMemory({ points, duration })
            });
        }
        return limiter;
    }

    const defaultKeyGen: KeyGenerator = (req) => {
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = req.ip || forwarded || req.socket.remoteAddress || "";
        return String(ip);
    };

    return async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
        try {
            if (skip && skip(req)) return next();

            const key = (keyGenerator || defaultKeyGen)(req);
            const rl = await getLimiter();
            const result = await rl.consume(key, 1);

            res.setHeader("X-RateLimit-Limit", String(points));
            res.setHeader("X-RateLimit-Remaining", String(Math.max(0, result.remainingPoints)));
            res.setHeader("X-RateLimit-Reset", String(Math.floor((Date.now() + result.msBeforeNext) / 1000)));

            return next();
        } catch (err: any) {
            if (err && typeof err.msBeforeNext === "number") {
                const retrySecs = Math.ceil(err.msBeforeNext / 1000);
                const key = (keyGenerator || defaultKeyGen)(req);
                if (onBlocked) {
                    try {
                        await onBlocked({ req, key, retrySecs });
                    } catch {
                        // ignore onBlocked errors
                    }
                }
                res.setHeader("Retry-After", String(retrySecs));
                res.setHeader("X-RateLimit-Limit", String(points));
                res.setHeader("X-RateLimit-Remaining", "0");
                res.setHeader("X-RateLimit-Reset", String(Math.floor((Date.now() + err.msBeforeNext) / 1000)));
                logger.info(`Rate limit exceeded for key: ${key}`);
                return ResponseHelper.sendResponse(res, {
                    message: "Too many requests. Please try again later.",
                    statusCode: 429
                });
            }
            return next(err);
        }
    };
}

// Global app limiter: 1000 requests per 15 minutes per IP
export const globalRateLimiter = createRateLimiter({
    keyPrefix: "rl:global",
    points: 1000,
    duration: 15 * 60
});

// Signup limiter: 5 attempts per 2 hours combining IP + email to reduce abuse
export const signupRateLimiter = createRateLimiter({
    keyPrefix: "rl:signup",
    points: 5,
    duration: 2 * 60 * 60,
    keyGenerator: (req) => {
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");
        const email = String(req.body?.email || "").toLowerCase();
        return `${ip}:${email}`;
    }
});

// Login limiter: per-IP and per-email presets
export const loginRateLimiter = createRateLimiter({
    keyPrefix: "rl:login:ip",
    points: 20,
    duration: 15 * 60
});

export const swapQuoteRateLimiter = createRateLimiter({
    keyPrefix: "rl:swap:quote",
    points: 10,
    duration: 60,
    blockDuration: 60,
    keyGenerator: (req) => {
        const userId = (req as any).user?.id;
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");
        return userId ? `user:${userId}` : `ip:${ip}`;
    }
});

export const swapExecuteRateLimiter = createRateLimiter({
    keyPrefix: "rl:swap:execute",
    points: 5,
    duration: 5 * 60,
    blockDuration: 5 * 60,
    keyGenerator: (req) => {
        const userId = (req as any).user?.id;
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");
        return userId ? `user:${userId}` : `ip:${ip}`;
    },
    onBlocked: async ({ req, retrySecs }) => {
        const userId = (req as any).user?.id;
        logger.warn(`[RateLimit] Swap execution temporarily blocked for user ${userId || "unknown"} (${retrySecs}s)`);
    }
});

export const loginPerEmailLimiter = createRateLimiter({
    keyPrefix: "rl:login:email",
    points: 10,
    duration: 15 * 60,
    keyGenerator: (req) => String(req.body?.email || "").toLowerCase()
});

export const sumSubwebhookLimiter = createRateLimiter({
    keyPrefix: "rl:webhooks:sumsub",
    points: 20,
    duration: 15 * 60,
    keyGenerator: (req) => String(req.headers?.["x-payload-digest"] || "").toLowerCase()
});

// Production Fireblocks webhook rate limiter (strict limits)
export const fireblockswebhookLimiter = createRateLimiter({
    keyPrefix: "rl:webhooks:fireblocks",
    points: 20,
    duration: 15 * 60,
    keyGenerator: (req) => String(req.headers?.["fireblocks-signature"] || "").toLowerCase()
});

// Test Fireblocks webhook rate limiter (relaxed limits, but never unlimited)
// Used for E2E testing to prevent DoS while allowing test execution
export const fireblocksTestWebhookLimiter = createRateLimiter({
    keyPrefix: "rl:webhooks:fireblocks:test", // Separate Redis key space
    points: 1000, // High limit for parallel test execution
    duration: 60, // Short window (1 minute)
    keyGenerator: (req) => String(req.ip || "test") // Rate limit by IP
});

export const sendgridRateLimiter = createRateLimiter({
    keyPrefix: "rl:webhooks:sendgrid",
    points: 100,
    duration: 60,
    keyGenerator: () => "sendgrid"
});

export const airaloWebhookLimiter = createRateLimiter({
    keyPrefix: "rl:webhooks:airalo",
    points: 50,
    duration: 60,
    keyGenerator: (req) => String(req.headers?.["airalo-signature"] || "airalo").toLowerCase()
});

export const telegramWebhookLimiter = createRateLimiter({
    keyPrefix: "rl:webhooks:telegram",
    points: 100,
    duration: 60,
    keyGenerator: (req) => {
        const chatId = req.body?.message?.chat?.id;
        if (chatId) {
            return `chat:${chatId}`;
        }
        return String(req.headers?.["x-telegram-bot-api-secret-token"] || "telegram");
    }
});

export const fiveWestWebhookLimiter = createRateLimiter({
    keyPrefix: "rl:webhooks:fivewest",
    points: 20,
    duration: 15 * 60,
    keyGenerator: (req) => {
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        return String(req.ip || forwarded || req.socket.remoteAddress || "fivewest");
    }
});

export const webhookRelayLimiter = createRateLimiter({
    keyPrefix: "rl:webhooks:relay",
    points: 20,
    duration: 15 * 60,
    keyGenerator: (req) => {
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        return String(req.ip || forwarded || req.socket.remoteAddress || "relay");
    }
});

export const transactPayWebhookLimiter = createRateLimiter({
    keyPrefix: "rl:webhooks:transactpay",
    points: 50,
    duration: 60,
    keyGenerator: (req) => {
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        return String(req.ip || forwarded || req.socket.remoteAddress || "transactpay");
    }
});

// Wallet transaction list rate limiter (environment-aware)
// E2E tests get relaxed limits
export const walletTransactionLimiter = createRateLimiter({
    keyPrefix: process.env.E2E_TEST === "true" ? "rl:wallet:transaction:e2e" : "rl:wallet:transaction",
    points: process.env.E2E_TEST === "true" ? 200 : 20, // E2E: 200/min, Prod/Unit: 20/min
    duration: 60,
    keyGenerator: (req) => String(req.headers?.["ip"] || "").toLowerCase()
});

// Transfer rate limiter (environment-aware)
// Production: Strict limits to prevent abuse
// E2E tests get relaxed limits
export const transferLimiter = createRateLimiter({
    keyPrefix: process.env.E2E_TEST === "true" ? "rl:wallet:transfer:e2e" : "rl:wallet:transfer",
    points: process.env.E2E_TEST === "true" ? 100 : 5, // E2E: 100/min, Prod/Unit: 5/min
    duration: 60,
    keyGenerator: (req) => {
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const rawIp = req.ip || forwarded || req.socket.remoteAddress || "";
        const ip = String(rawIp);
        const email = String(req.body?.email || "").toLowerCase();
        return `${email}:${ip}`;
    }
});

export const payoutRateLimiter = createRateLimiter({
    keyPrefix: "rl:payout",
    points: 5,
    duration: 5 * 60,
    blockDuration: 5 * 60,
    keyGenerator: (req) => {
        const userId = (req as any).user?.id;
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");
        return userId ? `user:${userId}` : `ip:${ip}`;
    },
    onBlocked: async ({ req, retrySecs }) => {
        const userId = (req as any).user?.id;
        logger.warn(`Payout temp blocked for user ${userId || "unknown"} (${retrySecs}s)`);
    }
});

export const verifyMfaRateLimiter = createRateLimiter({
    keyPrefix: "rl:mfa:verify",
    points: 10,
    duration: 15 * 60,
    blockDuration: 60 * 60,
    keyGenerator: (req) => {
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const rawIp = req.ip || forwarded || req.socket.remoteAddress || "";
        const ip = String(rawIp);
        const email = String(req.body?.email || "").toLowerCase();
        return `${email}:${ip}`;
    },
    onBlocked: async ({ req, retrySecs }) => {
        const email = String(req.body?.email || "").toLowerCase();
        if (!email) return;
        const emailService = new EmailService();
        await emailService.sendEmail({
            to: email,
            subject: "MFA Temporarily Locked Due to Too Many Attempts - Verxa",
            template: "mfa-blocked",
            context: {
                retryMinutes: Math.ceil(retrySecs / 60),
                ipAddress: ((): string => {
                    const xff2 = req.headers["x-forwarded-for"];
                    const forwarded2 = Array.isArray(xff2) ? xff2[0] : xff2;
                    return String(req.ip || forwarded2 || req.socket.remoteAddress || "");
                })(),
                userEmail: email
            }
        });
    }
});

export const failedLoginAttemptsRateLimiter = createRateLimiter({
    keyPrefix: "rl:login:failed",
    points: 3,
    duration: 24 * 60 * 60,
    blockDuration: 60 * 60,
    keyGenerator: (req) => {
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const rawIp = req.ip || forwarded || req.socket.remoteAddress || "";
        const ip = String(rawIp);
        const email = String(req.body?.email || "").toLowerCase();
        return `${email}:${ip}`;
    },
    onBlocked: async ({ req, retrySecs }) => {
        const email = String(req.body?.email || "").toLowerCase();
        if (!email) return;

        const redisClient = await getRedisClient();
        const alertKey = `alert:login:blocked:${email}`;
        const existingAlert = await redisClient.get(alertKey);
        if (existingAlert) {
            return;
        }
        await redisClient.setex(alertKey, 24 * 60 * 60, "sent");

        const emailService = new EmailService();
        await emailService.sendEmail({
            to: email,
            subject: "Security Alert - Login Blocked - Verxa",
            template: "login-security-alert",
            context: {
                retryMinutes: Math.ceil(retrySecs / 60),
                ipAddress: ((): string => {
                    const xff2 = req.headers["x-forwarded-for"];
                    const forwarded2 = Array.isArray(xff2) ? xff2[0] : xff2;
                    return String(req.ip || forwarded2 || req.socket.remoteAddress || "");
                })(),
                userEmail: email
            }
        });
    }
});
export const redbillerWebhookLimiter = createRateLimiter({
    keyPrefix: "rl:redbiller:callback",
    points: 3,
    duration: 60,
    blockDuration: 5 * 60,
    keyGenerator: (req) => {
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const rawIp = req.ip || forwarded || req.socket.remoteAddress || "";
        const ip = String(rawIp);

        const { details, response } = req.body;
        if (details && response) {
            const { reference, sub_account } = details;
            const { reference: userId } = sub_account;
            const responseText = String(response).toLowerCase();

            return `${responseText}:${userId}:${reference}`;
        }
        return `${ip}`;
    }
});

export const transactionPinResetRateLimiter = createRateLimiter({
    keyPrefix: "rl:transaction-pin:reset",
    points: 3,
    duration: 60 * 60,
    blockDuration: 60 * 60,
    keyGenerator: (req) => {
        const userId = (req as any).user?.id;
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");

        return userId ? `user:${userId}` : `ip:${ip}`;
    },
    onBlocked: async ({ req, retrySecs }) => {
        const userId = (req as any).user?.id;
        const email = (req as any).user?.email;
        const user = (req as any).user;

        if (!email) return;

        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ipAddress = String(req.ip || forwarded || req.socket.remoteAddress || "");

        try {
            const emailService = new EmailService();
            await emailService.sendTransactionPinBlocked(
                email,
                user?.username || email.split("@")[0],
                Math.ceil(retrySecs / 60),
                ipAddress
            );
        } catch (error) {
            logger.error(`Transaction pin reset email failed for user ${userId}:`, error);
        }
    }
});

export const notificationPreferencesRateLimiter = createRateLimiter({
    keyPrefix: "rl:notification:preferences",
    points: 10,
    duration: 5 * 60,
    blockDuration: 15 * 60,
    keyGenerator: (req) => {
        const userId = (req as any).userId;
        if (!userId) {
            const xff = req.headers["x-forwarded-for"];
            const forwarded = Array.isArray(xff) ? xff[0] : xff;
            return String(req.ip || forwarded || req.socket.remoteAddress || "unknown");
        }
        return `user:${userId}`;
    }
});

export const deviceTokenUpdateRateLimiter = createRateLimiter({
    keyPrefix: "rl:device:token",
    points: 5,
    duration: 5 * 60,
    blockDuration: 30 * 60,
    keyGenerator: (req) => {
        const userId = (req as any).userId;
        if (!userId) {
            const xff = req.headers["x-forwarded-for"];
            const forwarded = Array.isArray(xff) ? xff[0] : xff;
            return String(req.ip || forwarded || req.socket.remoteAddress || "unknown");
        }
        return `user:${userId}`;
    }
});

export const profileUpdateRateLimiter = createRateLimiter({
    keyPrefix: "rl:profile:update",
    points: 5,
    duration: 60 * 60,
    blockDuration: 60 * 60,
    keyGenerator: (req) => {
        const userId = (req as any).userId;
        if (!userId) {
            const xff = req.headers["x-forwarded-for"];
            const forwarded = Array.isArray(xff) ? xff[0] : xff;
            return String(req.ip || forwarded || req.socket.remoteAddress || "unknown");
        }
        return `user:${userId}`;
    }
});

export const profileUpdateOtpRateLimiter = createRateLimiter({
    keyPrefix: "rl:profile:update:otp",
    points: 5,
    duration: 60 * 60,
    blockDuration: 60 * 60,
    keyGenerator: (req) => {
        const userId = (req as any).userId;
        if (!userId) {
            const xff = req.headers["x-forwarded-for"];
            const forwarded = Array.isArray(xff) ? xff[0] : xff;
            return String(req.ip || forwarded || req.socket.remoteAddress || "unknown");
        }
        return `user:${userId}`;
    }
});

export const otpGenerationRateLimiter = createRateLimiter({
    keyPrefix: "rl:otp:generate",
    points: 5,
    duration: 60 * 60,
    blockDuration: 60 * 60,
    keyGenerator: (req) => {
        const identifier = String(req.body?.identifier || "").toLowerCase();
        const email = String(req.body?.email || "").toLowerCase();
        const type = String(req.body?.type || "");
        return `${identifier || email}:${type}`;
    }
});

export const otpValidationRateLimiter = createRateLimiter({
    keyPrefix: "rl:otp:validate",
    points: 5,
    duration: 60 * 60,
    blockDuration: 60 * 60,
    keyGenerator: (req) => {
        const identifier = String(req.body?.identifier || "").toLowerCase();
        const type = String(req.body?.type || "");
        return `${identifier}:${type}`;
    }
});

export const bvnVerifyRateLimiter = createRateLimiter({
    keyPrefix: "rl:kyc:bvn",
    points: 3,
    duration: 60 * 60,
    blockDuration: 60 * 60,
    keyGenerator: (req) => {
        const userId = (req as any).userId;
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");

        return userId ? `user:${userId}` : `ip:${ip}`;
    },
    onBlocked: async ({ req, retrySecs }) => {
        const userId = (req as any).userId;
        logger.warn(
            `[rate-limit] BVN verification is temporarily blocked for user ${userId || "unknown"} (${retrySecs}s)`
        );
    }
});

export const emailSendingRateLimiter = createRateLimiter({
    keyPrefix: "rl:email:send",
    points: 10,
    duration: 60 * 60,
    blockDuration: 60 * 60,
    keyGenerator: (req) => {
        const userId = (req as any).user?.id;
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");

        return userId ? `user:${userId}` : `ip:${ip}`;
    }
});

export const resetPasswordRateLimiter = createRateLimiter({
    keyPrefix: "rl:auth:reset-password",
    points: 5,
    duration: 15 * 60,
    blockDuration: 60 * 60,
    keyGenerator: (req) => {
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const rawIp = req.ip || forwarded || req.socket.remoteAddress || "";
        const ip = String(rawIp);
        const email = String(req.body?.email || "").toLowerCase();
        return `${email}:${ip}`;
    }
});

export const esimCountriesRateLimiter = createRateLimiter({
    keyPrefix: "rl:esim:countries",
    points: 5,
    duration: 60,
    blockDuration: 60,
    keyGenerator: (req) => {
        const userId = (req as any).userId;
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");

        return userId ? `user:${userId}` : `ip:${ip}`;
    }
});

export const esimDataPlansRateLimiter = createRateLimiter({
    keyPrefix: "rl:esim:data-plans",
    points: 10,
    duration: 60,
    blockDuration: 60,
    keyGenerator: (req) => {
        const userId = (req as any).userId;
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");

        return userId ? `user:${userId}` : `ip:${ip}`;
    }
});

export const esimTopUpPackagesRateLimiter = createRateLimiter({
    keyPrefix: "rl:esim:topup-packages",
    points: 15,
    duration: 60,
    blockDuration: 60,
    keyGenerator: (req) => {
        const userId = (req as any).userId;
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");

        return userId ? `user:${userId}` : `ip:${ip}`;
    }
});

export const esimPurchaseRateLimiter = createRateLimiter({
    keyPrefix: "rl:esim:purchase",
    points: 3,
    duration: 60,
    blockDuration: 300,
    keyGenerator: (req) => {
        const userId = (req as any).userId;
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");

        return userId ? `user:${userId}` : `ip:${ip}`;
    }
});

export const esimTopupRateLimiter = createRateLimiter({
    keyPrefix: "rl:esim:topup",
    points: 3,
    duration: 60,
    blockDuration: 300,
    keyGenerator: (req) => {
        const userId = (req as any).userId;
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");

        return userId ? `user:${userId}` : `ip:${ip}`;
    }
});

export const esimTransactionsRateLimiter = createRateLimiter({
    keyPrefix: "rl:esim:transactions",
    points: 20,
    duration: 60,
    blockDuration: 60,
    keyGenerator: (req) => {
        const userId = (req as any).userId;
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");

        return userId ? `user:${userId}` : `ip:${ip}`;
    }
});

export const esimTransactionReceiptRateLimiter = createRateLimiter({
    keyPrefix: "rl:esim:transaction-receipt",
    points: 10,
    duration: 60,
    blockDuration: 60,
    keyGenerator: (req) => {
        const txnId = (req as any).params?.txnId;
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");

        return txnId ? `txn:${txnId}` : `ip:${ip}`;
    }
});

export const esimClaimRateLimiter = createRateLimiter({
    keyPrefix: "rl:esim:claim",
    points: 5,
    duration: 60 * 60,
    blockDuration: 60 * 60,
    keyGenerator: (req) => {
        const userId = (req as any).userId;
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");

        return userId ? `user:${userId}` : `ip:${ip}`;
    },
    onBlocked: async ({ req, retrySecs }) => {
        const userId = (req as any).userId;
        const transferCode = String(req.body?.transferCode || "unknown");
        logger.warn(`[RateLimit] eSIM claim temporarily blocked for user ${userId || "unknown"} (${retrySecs}s)`, {
            userId,
            transferCode,
            ip: ((): string => {
                const xff2 = req.headers["x-forwarded-for"];
                const forwarded2 = Array.isArray(xff2) ? xff2[0] : xff2;
                return String(req.ip || forwarded2 || req.socket.remoteAddress || "");
            })()
        });
    }
});

export const cipherManualRotationRateLimiter = createRateLimiter({
    keyPrefix: "rl:admin:cipher:rotate",
    points: 3,
    duration: 60 * 60,
    blockDuration: 60 * 60,
    keyGenerator: (req) => {
        const userId = (req as any).userId;
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");

        return userId ? `user:${userId}` : `ip:${ip}`;
    },
    onBlocked: async ({ req, retrySecs }) => {
        const userId = (req as any).userId;
        const cipherTypes = req.body?.cipherTypes || "all";
        logger.warn(
            `[RateLimit] Manual cipher rotation temporarily blocked for admin ${userId || "unknown"} (${retrySecs}s)`,
            {
                userId,
                cipherTypes,
                ip: ((): string => {
                    const xff2 = req.headers["x-forwarded-for"];
                    const forwarded2 = Array.isArray(xff2) ? xff2[0] : xff2;
                    return String(req.ip || forwarded2 || req.socket.remoteAddress || "");
                })()
            }
        );
    }
});

export const cipherStatusRateLimiter = createRateLimiter({
    keyPrefix: "rl:admin:cipher:status",
    points: 30,
    duration: 60,
    blockDuration: 60,
    keyGenerator: (req) => {
        const userId = (req as any).userId;
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");

        return userId ? `user:${userId}` : `ip:${ip}`;
    }
});

export const assetHistoricalPricesRateLimiter = createRateLimiter({
    keyPrefix: "rl:assets:historical-prices",
    points: 10,
    duration: 60,
    blockDuration: 60,
    keyGenerator: (req) => {
        const userId = (req as any).user?.id;
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");

        return userId ? `user:${userId}` : `ip:${ip}`;
    }
});

export const estimateFeeLimiter = createRateLimiter({
    keyPrefix: "rl:wallet:estimate-fee",
    points: 10,
    duration: 60,
    blockDuration: 60,
    keyGenerator: (req) => {
        const userId = (req as any).user?.id;
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");

        return userId ? `user:${userId}` : `ip:${ip}`;
    }
});

export const adminRolePermissionRateLimiter = createRateLimiter({
    keyPrefix: "rl:admin:role-permission",
    points: 20,
    duration: 60 * 60,
    blockDuration: 60 * 60,
    keyGenerator: (req) => {
        const userId = (req as any).user?.id;
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");

        return userId ? `user:${userId}` : `ip:${ip}`;
    }
});

export const adminInviteRateLimiter = createRateLimiter({
    keyPrefix: "rl:admin:invite",
    points: 10,
    duration: 60 * 60,
    blockDuration: 60 * 60,
    keyGenerator: (req) => {
        const userId = (req as any).user?.id;
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");

        return userId ? `user:${userId}` : `ip:${ip}`;
    }
});

export const adminAuditApprovalRateLimiter = createRateLimiter({
    keyPrefix: "rl:admin:audit-approval",
    points: 30,
    duration: 60 * 60,
    blockDuration: 60 * 60,
    keyGenerator: (req) => {
        const userId = (req as any).user?.id;
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");

        return userId ? `user:${userId}` : `ip:${ip}`;
    }
});

export const adminPasswordValidationRateLimiter = createRateLimiter({
    keyPrefix: "rl:admin:password-validate",
    points: 5,
    duration: 15 * 60,
    blockDuration: 15 * 60,
    keyGenerator: (req) => {
        const userId = (req as any).user?.id;
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");

        return userId ? `user:${userId}` : `ip:${ip}`;
    }
});

// Account statement rate limiter: 5 requests per hour per user
export const statementRequestLimiter = createRateLimiter({
    keyPrefix: "rl:wallet:statement",
    points: 5,
    duration: 60 * 60, // 1 hour
    blockDuration: 60 * 60, // Block for 1 hour
    keyGenerator: (req) => {
        const userId = (req as any).user?.id;
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");

        return userId ? `user:${userId}` : `ip:${ip}`;
    },
    onBlocked: async ({ req, retrySecs }) => {
        const userId = (req as any).user?.id;
        logger.warn(
            `[RateLimit] Statement request temporarily blocked for user ${userId || "unknown"} (${retrySecs}s)`
        );
    }
});

export const adminLoginRateLimiter = createRateLimiter({
    keyPrefix: "rl:admin:login",
    points: 10,
    duration: 15 * 60,
    blockDuration: 15 * 60,
    keyGenerator: (req) => {
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = String(req.ip || forwarded || req.socket.remoteAddress || "");
        const email = String(req.body?.email || "").toLowerCase();
        return `${email}:${ip}`;
    }
});

export default createRateLimiter;
