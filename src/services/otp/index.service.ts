/* eslint-disable @typescript-eslint/no-unused-expressions */
import { randomInt, timingSafeEqual } from "crypto";
import { redis } from "../../config/redis";
import logger from "../../config/logger";
import { OTP_CONFIG, OTP_TYPES, OtpType } from "../../utils/constants/otp";
import EmailService from "../email/email.service";
import { OtpGenerationResult, OtpValidationResult, OtpResendResult } from "../../types/otp.types";
import { withContext } from "../../utils/loggerWithContext";
import envConfig from "../../config/env";

export class OtpService {
    private emailService: EmailService;

    constructor() {
        this.emailService = new EmailService();
    }

    /**
     * Generate a cryptographically secure 6-digit OTP
     */
    private generateOtp(): string {
        return randomInt(100000, 1000000).toString();
    }

    /**
     * Generate Redis keys for OTP operations
     */
    private getRedisKeys(identifier: string, type: OtpType) {
        const normalizedId = identifier.toLowerCase();
        const baseKey = `${OTP_CONFIG.REDIS_KEYS.OTP_PREFIX}:${type}:${normalizedId}`;
        const resendKey = `${OTP_CONFIG.REDIS_KEYS.RESEND_COUNT_PREFIX}:${type}:${normalizedId}`;
        const attemptsKey = `${OTP_CONFIG.REDIS_KEYS.VERIFICATION_ATTEMPTS_PREFIX}:${type}:${normalizedId}`;
        const resendBlockedKey = `${OTP_CONFIG.REDIS_KEYS.BLOCKED_PREFIX}:resend:${type}:${normalizedId}`;
        const verificationBlockedKey = `${OTP_CONFIG.REDIS_KEYS.BLOCKED_PREFIX}:verification:${type}:${normalizedId}`;

        return { baseKey, resendKey, attemptsKey, resendBlockedKey, verificationBlockedKey };
    }

    /**
     * Check if user is blocked from OTP operations
     */
    private async isBlocked(identifier: string, type: OtpType, operation: "resend" | "verification"): Promise<boolean> {
        const { resendBlockedKey, verificationBlockedKey } = this.getRedisKeys(identifier, type);
        const key = operation === "resend" ? resendBlockedKey : verificationBlockedKey;
        const blocked = await redis.get(key);
        return !!blocked;
    }

    /**
     * Block user from OTP operations
     */
    private async blockUser(identifier: string, type: OtpType, operation: "resend" | "verification"): Promise<void> {
        const { resendBlockedKey, verificationBlockedKey } = this.getRedisKeys(identifier, type);
        const key = operation === "resend" ? resendBlockedKey : verificationBlockedKey;
        const blockDuration =
            operation === "resend"
                ? OTP_CONFIG.RESEND_BLOCK_DURATION_HOURS * 3600
                : OTP_CONFIG.VERIFICATION_BLOCK_DURATION_HOURS * 3600;

        await redis.set(key, "blocked", blockDuration);
        logger.info(
            "User blocked for operations",
            withContext({
                identifier: identifier,
                operation: operation,
                blockDuration: blockDuration,
                action: "otp_blocked",
            }),
        );
    }

    /**
     * Generate and send OTP
     */
    async generateAndSendOtp(
        identifier: string,
        type: OtpType,
        email: string,
        userName?: string,
    ): Promise<OtpGenerationResult> {
        try {
            if (await this.isBlocked(identifier, type, "resend")) {
                const { resendBlockedKey } = this.getRedisKeys(identifier, type);
                const ttl = await redis.ttl(resendBlockedKey);
                const nextAllowedTime = new Date(Date.now() + Math.max(ttl, 0) * 1000);
                return {
                    success: false,
                    message: "Too many resend attempts. Please try again later.",
                    isBlocked: true,
                    nextAllowedTime,
                };
            }

            const { resendKey, baseKey } = this.getRedisKeys(identifier, type);
            const resendWindowSeconds = OTP_CONFIG.RESEND_WINDOW_HOURS * 3600;
            const newResendCount = await redis.incrEx(resendKey, resendWindowSeconds);

            if (newResendCount > OTP_CONFIG.MAX_RESEND_ATTEMPTS) {
                await this.blockUser(identifier, type, "resend");
                const nextAllowedTime = new Date(Date.now() + OTP_CONFIG.RESEND_BLOCK_DURATION_HOURS * 3600 * 1000);
                return {
                    success: false,
                    message: `Maximum resend attempts exceeded. Please try again in ${OTP_CONFIG.RESEND_BLOCK_DURATION_HOURS} hour(s).`,
                    isBlocked: true,
                    nextAllowedTime,
                };
            }

            const otp = this.generateOtp();
            const expiresAt = new Date(Date.now() + OTP_CONFIG.EXPIRY_SECONDS * 1000);

            await redis.set(baseKey, otp, OTP_CONFIG.EXPIRY_SECONDS);

            let emailSent = false;
            switch (type) {
                case OTP_TYPES.LOGIN_DEVICE_VERIFICATION:
                    emailSent = await this.emailService.sendLoginVerificationEmail(email, otp, userName);
                    break;
                case OTP_TYPES.FORGOT_PASSWORD:
                    emailSent = await this.emailService.sendForgotPasswordEmail(email, otp, userName);
                    break;
                case OTP_TYPES.UPDATE_USER_PROFILE:
                    emailSent = await this.emailService.sendUpdateUserProfileEmail(email, otp, userName);
                    break;
                case OTP_TYPES.SIGNUP_VERIFICATION:
                case OTP_TYPES.RESET_TRANSACTION_PIN:
                case OTP_TYPES.UPDATE_TRANSACTION_PIN:
                case OTP_TYPES.DISABLE_MFA:
                default:
                    emailSent = await this.emailService.sendOtpEmail(email, otp, userName);
            }

            logger.debug(
                "OTP generated and sent successfully ",
                withContext({
                    type: type,
                    email: email,
                    identifier: identifier,
                    action: "otp_generated",
                }),
            );

            envConfig.env !== "production" && logger.debug(`OTP email sent: ${email} -> ${otp}`);

            if (!emailSent) {
                envConfig.env === "production" && (await redis.del(baseKey));
                return {
                    success: false,
                    message: "Failed to send OTP email. Please try again.",
                };
            }

            return {
                success: true,
                otp,
                message: "OTP generated and sent successfully",
                expiresAt,
            };
        } catch (error) {
            logger.error(
                "Failed to generate OTP",
                withContext({
                    identifier: identifier,
                    error: error instanceof Error ? error.message : "Unknown error",
                    stack: error instanceof Error ? error.stack : undefined,
                    action: "otp_generation_failed",
                }),
            );
            return {
                success: false,
                message: "Failed to generate OTP. Please try again.",
            };
        }
    }

    /**
     * Validate OTP
     */
    async validateOtp(identifier: string, type: OtpType, otp: string): Promise<OtpValidationResult> {
        try {
            if (await this.isBlocked(identifier, type, "verification")) {
                return {
                    success: false,
                    message: "Too many verification attempts. Please try again later.",
                    isBlocked: true,
                };
            }

            const { baseKey, attemptsKey, resendKey } = this.getRedisKeys(identifier, type);
            const attemptsTtl = OTP_CONFIG.VERIFICATION_BLOCK_DURATION_HOURS * 3600;

            const newAttemptCount = await redis.incrEx(attemptsKey, attemptsTtl);

            if (newAttemptCount > OTP_CONFIG.MAX_VERIFICATION_ATTEMPTS) {
                await this.blockUser(identifier, type, "verification");
                return {
                    success: false,
                    message: `Maximum verification attempts exceeded. Please try again in ${OTP_CONFIG.VERIFICATION_BLOCK_DURATION_HOURS} hour(s).`,
                    isBlocked: true,
                };
            }

            const remainingAttempts = OTP_CONFIG.MAX_VERIFICATION_ATTEMPTS - newAttemptCount;

            const storedOtp = await redis.get(baseKey);
            if (!storedOtp) {
                return {
                    success: false,
                    message: "OTP has expired or does not exist.",
                    remainingAttempts,
                };
            }

            if (storedOtp.length !== otp.length || !timingSafeEqual(Buffer.from(storedOtp), Buffer.from(otp))) {
                if (remainingAttempts <= 0) {
                    await this.blockUser(identifier, type, "verification");
                    return {
                        success: false,
                        message: `Maximum verification attempts exceeded. Please try again in ${OTP_CONFIG.VERIFICATION_BLOCK_DURATION_HOURS} hour(s).`,
                        isBlocked: true,
                    };
                }

                return {
                    success: false,
                    message: "Invalid OTP. Please try again.",
                    remainingAttempts,
                };
            }

            const consumed = await redis.getDel(baseKey);
            if (consumed === null) {
                return {
                    success: false,
                    message: "OTP has expired or does not exist.",
                    remainingAttempts,
                };
            }

            await redis.del(attemptsKey);
            await redis.del(resendKey);

            logger.debug(
                "OTP validated successfully",
                withContext({
                    identifier: identifier,
                    type: type,
                    action: "otp_validated",
                }),
            );

            return {
                success: true,
                message: "OTP validated successfully",
            };
        } catch (error) {
            logger.error(
                "Failed to validate OTP",
                withContext({
                    identifier: identifier,
                    error: error instanceof Error ? error.message : "Unknown error",
                    stack: error instanceof Error ? error.stack : undefined,
                    action: "otp_validation_failed",
                }),
            );
            return {
                success: false,
                message: "Failed to validate OTP. Please try again.",
            };
        }
    }

    async checkOtp(identifier: string, type: OtpType, otp: string): Promise<OtpValidationResult> {
        try {
            if (await this.isBlocked(identifier, type, "verification")) {
                return {
                    success: false,
                    message: "Too many verification attempts. Please try again later.",
                    isBlocked: true,
                };
            }

            const { baseKey, attemptsKey } = this.getRedisKeys(identifier, type);
            const attemptsTtl = OTP_CONFIG.VERIFICATION_BLOCK_DURATION_HOURS * 3600;

            const newAttemptCount = await redis.incrEx(attemptsKey, attemptsTtl);

            if (newAttemptCount > OTP_CONFIG.MAX_VERIFICATION_ATTEMPTS) {
                await this.blockUser(identifier, type, "verification");
                return {
                    success: false,
                    message: `Maximum verification attempts exceeded. Please try again in ${OTP_CONFIG.VERIFICATION_BLOCK_DURATION_HOURS} hour(s).`,
                    isBlocked: true,
                };
            }

            const remainingAttempts = OTP_CONFIG.MAX_VERIFICATION_ATTEMPTS - newAttemptCount;

            const storedOtp = await redis.get(baseKey);
            if (!storedOtp) {
                return {
                    success: false,
                    message: "OTP has expired or does not exist.",
                    remainingAttempts,
                };
            }

            if (storedOtp.length !== otp.length || !timingSafeEqual(Buffer.from(storedOtp), Buffer.from(otp))) {
                if (remainingAttempts <= 0) {
                    await this.blockUser(identifier, type, "verification");
                    return {
                        success: false,
                        message: `Maximum verification attempts exceeded. Please try again in ${OTP_CONFIG.VERIFICATION_BLOCK_DURATION_HOURS} hour(s).`,
                        isBlocked: true,
                    };
                }

                return {
                    success: false,
                    message: "Invalid OTP. Please try again.",
                    remainingAttempts,
                };
            }

            await redis.del(attemptsKey);

            logger.debug(
                "OTP checked successfully",
                withContext({
                    identifier: identifier,
                    type: type,
                    action: "otp_checked",
                }),
            );

            return {
                success: true,
                message: "OTP verified",
            };
        } catch (error) {
            logger.error(
                "Failed to check OTP",
                withContext({
                    identifier: identifier,
                    error: error instanceof Error ? error.message : "Unknown error",
                    stack: error instanceof Error ? error.stack : undefined,
                    action: "otp_check_failed",
                }),
            );
            return {
                success: false,
                message: "Failed to validate OTP. Please try again.",
            };
        }
    }

    /**
     * Resend OTP
     */
    async resendOtp(identifier: string, type: OtpType, email: string, userName?: string): Promise<OtpResendResult> {
        try {
            if (await this.isBlocked(identifier, type, "resend")) {
                const { resendBlockedKey } = this.getRedisKeys(identifier, type);
                const ttl = await redis.ttl(resendBlockedKey);
                const nextAllowedTime = new Date(Date.now() + ttl * 1000);

                return {
                    success: false,
                    message: "Too many resend attempts. Please try again later.",
                    isBlocked: true,
                    nextAllowedTime,
                };
            }

            const result = await this.generateAndSendOtp(identifier, type, email, userName);

            if (!result.success) {
                return {
                    success: false,
                    message: result.message,
                    isBlocked: result.isBlocked,
                    nextAllowedTime: result.nextAllowedTime,
                };
            }

            const { resendKey } = this.getRedisKeys(identifier, type);
            const currentCount = parseInt((await redis.get(resendKey)) || "0");
            const remainingAttempts = Math.max(0, OTP_CONFIG.MAX_RESEND_ATTEMPTS - currentCount);

            return {
                success: true,
                message: "OTP resent successfully",
                remainingAttempts,
            };
        } catch (error) {
            logger.error(
                "Failed to resend OTP",
                withContext({
                    identifier: identifier,
                    error: error instanceof Error ? error.message : "Unknown error",
                    stack: error instanceof Error ? error.stack : undefined,
                    action: "otp_resend_failed",
                }),
            );
            return {
                success: false,
                message: "Failed to resend OTP. Please try again.",
            };
        }
    }
}

export default OtpService;
