import { VerxatagRepository } from "../repository/verxatag";
import { UserRepository } from "../repository/user";
import AppError from "../utils/appError";
import ResponseHelper from "../utils/helpers/response.helper";
import UsernameNormalizer from "../utils/helpers/username-normalizer.helper";
import { usernameRegex } from "../config/username.regex";
import { type Verxatag, VerxatagStatus } from "../db/schema/verxatag/index.schema";
import PinService from "./pin.service";
import EmailService from "./email/email.service";
import logger from "../config/logger";
import { withContext } from "../utils/loggerWithContext";

export class VerxatagService {
    private static RESERVED_USERNAMES = new Set([
        "admin",
        "support",
        "help",
        "contact",
        "info",
        "test",
        "demo",
        "verxa",
        "verxatag",
        "api",
        "docs",
        "dashboard",
        "login",
        "logout",
        "register",
        "reset",
        "forgot",
        "password",
        "verification",
        "verification-request",
        "verification-code",
        "verification-code-request",
        "mfa",
        "2fa",
        "2fa-setup"
    ]);

    constructor(
        private verxatagRepo: VerxatagRepository = new VerxatagRepository(),
        private userRepo: UserRepository = new UserRepository(),
        private pinService: PinService = new PinService(),
        private emailService: EmailService = new EmailService()
    ) {}

    private isWithinSameYear(date: Date | null): boolean {
        if (!date) return false;
        const currentYear = new Date().getFullYear();
        return date.getFullYear() === currentYear;
    }

    async checkUsernameAvailability(username: string, userId?: string) {
        const normalizedUsername = UsernameNormalizer.normalize(username);

        // Validate username format
        if (!UsernameNormalizer.validate(normalizedUsername)) {
            return {
                available: false,
                reason: "Username must be between 3 and 30 characters and contain only alphanumeric characters, underscores, hyphens, or dots",
                normalizedUsername,
                displayUsername: UsernameNormalizer.formatDisplayName(normalizedUsername)
            };
        }

        // Check if username is reserved
        if (VerxatagService.RESERVED_USERNAMES.has(normalizedUsername)) {
            return {
                available: false,
                reason: "reserved",
                normalizedUsername,
                displayUsername: UsernameNormalizer.formatDisplayName(normalizedUsername)
            };
        }

        // Check database reserved usernames
        const isdbReserved = await this.verxatagRepo.isUsernameReserved(normalizedUsername);
        if (isdbReserved) {
            return {
                available: false,
                reason: "reserved",
                normalizedUsername,
                displayUsername: UsernameNormalizer.formatDisplayName(normalizedUsername)
            };
        }

        // Check if username is already taken by another user
        const existingUser = await this.userRepo.findByUsername(normalizedUsername);
        if (existingUser && existingUser.id !== userId) {
            return {
                available: false,
                reason: "Username is already taken by another user",
                normalizedUsername,
                displayUsername: UsernameNormalizer.formatDisplayName(normalizedUsername)
            };
        }

        // Check if username is available considering grace period
        const verxatag = await this.verxatagRepo.findByUsernameWithGracePeriod(
            normalizedUsername,
            usernameRegex.Grace_Period_Days
        );
        const available = !verxatag;

        return {
            available,
            normalizedUsername,
            displayUsername: UsernameNormalizer.formatDisplayName(normalizedUsername),
            reason: available ? undefined : "Username is not available"
        };
    }

    async claimVerxatag(userId: string, username: string) {
        logger.debug(
            "claimVerxatag called with:",
            withContext({ userId, username, action: "claim_verxatag" })
        );

        if (!userId) {
            throw new Error("User ID is required");
        }

        const normalizedUsername = UsernameNormalizer.normalize(username);

        let verxatag: Verxatag | undefined;
        await this.verxatagRepo.client.transaction(async (tx) => {
            const { available, reason } = await this.checkUsernameAvailability(username, userId);
            if (!available) {
                throw new AppError(reason || "Username is not available", ResponseHelper.CONFLICT);
            }

            // Check if user already has an active Verxatag
            const existingVerxatag = await this.verxatagRepo.findActiveByUserId(userId);
            if (existingVerxatag && existingVerxatag.status === VerxatagStatus.ACTIVE) {
                throw new AppError("You already have an active Verxatag", ResponseHelper.CONFLICT);
            }

            if (existingVerxatag) {
                const updatedRecord = await this.verxatagRepo.update(
                    existingVerxatag.id,
                    {
                        username: normalizedUsername,
                        status: VerxatagStatus.ACTIVE,
                        updatedAt: new Date()
                    },
                    tx
                );
                if (!updatedRecord) {
                    throw new AppError("Failed to update Verxatag", ResponseHelper.INTERNAL_SERVER_ERROR);
                }
                verxatag = updatedRecord;
            } else {
                // Create new Verxatag
                const createRecord = await this.verxatagRepo.create(
                    {
                        userId,
                        username: normalizedUsername,
                        changeCount: 0,
                        status: VerxatagStatus.ACTIVE
                    },
                    tx
                );
                if (!createRecord) {
                    throw new AppError("Failed to create Verxatag", ResponseHelper.INTERNAL_SERVER_ERROR);
                }
                verxatag = createRecord;
            }

            // Update user's username field
            await this.userRepo.updateUsername(userId, UsernameNormalizer.formatDisplayName(normalizedUsername), tx);
        });

        logger.debug(
            "Verxatag claimed successfully",
            withContext({
                userId,
                username: normalizedUsername,
                displayUsername: UsernameNormalizer.formatDisplayName(normalizedUsername),
                action: "verxatag_claimed"
            })
        );

        return {
            ...(verxatag ?? {}),
            displayUsername: UsernameNormalizer.formatDisplayName(normalizedUsername)
        };
    }

    async updateVerxatag(userId: string, newUsername: string, transactionPin: string) {
        const existingVerxatag = await this.verxatagRepo.findActiveByUserId(userId);

        if (!existingVerxatag) {
            throw new AppError("User does not have an active Verxatag", ResponseHelper.RESOURCE_NOT_FOUND);
        }

        // Check change limit: max 2 updates per year
        if (existingVerxatag.changeCount >= 2 && this.isWithinSameYear(existingVerxatag.updatedAt)) {
            logger.warn(
                "Verxatag update blocked due to change limits",
                withContext({
                    userId,
                    username: existingVerxatag.username,
                    currentChangeCount: existingVerxatag.changeCount,
                    maxAllowed: 2,
                    action: "verxatag_update_blocked"
                })
            );
            throw new AppError(
                "You have reached the maximum number of username changes for this year",
                ResponseHelper.FORBIDDEN
            );
        }

        const normalizedNewUsername = UsernameNormalizer.normalize(newUsername);

        if (normalizedNewUsername === existingVerxatag.username) {
            throw new AppError("The new username is the same as your current username", ResponseHelper.CONFLICT);
        }

        const { available, reason } = await this.checkUsernameAvailability(normalizedNewUsername, userId);
        if (!available) {
            throw new AppError(reason || "Username is not available", ResponseHelper.CONFLICT);
        }

        // Verify transaction pin
        const transactionVerification = await this.pinService.verifyTransactionPin(userId, transactionPin);

        if (!transactionVerification.success) {
            if (transactionVerification.blocked) {
                logger.warn(
                    "Verxatag update transaction pin verification blocked",
                    withContext({
                        userId,
                        username: normalizedNewUsername,
                        attempts: transactionVerification.attempts,
                        blocked: transactionVerification.blocked,
                        action: "verxatag_verify_transaction_pin_blocked"
                    })
                );
                throw new AppError(
                    "Your account has been temporarily locked due to multiple failed attempts. Please try again in a few minutes",
                    ResponseHelper.FORBIDDEN
                );
            }
            const remaining = transactionVerification.attempts ? Math.max(0, 5 - transactionVerification.attempts) : 0;
            logger.warn(
                "Verxatag update transaction pin verification failed",
                withContext({
                    userId,
                    username: normalizedNewUsername,
                    attempts: transactionVerification.attempts,
                    remainingAttempts: remaining || undefined,
                    action: "verxatag_verify_transaction_pin_failed"
                })
            );
            throw new AppError(
                `Invalid transaction pin. ${remaining > 0 ? `${remaining} attempts remaining` : ""}`.trim(),
                ResponseHelper.UNAUTHORIZED
            );
        }

        const result = await this.verxatagRepo.client.transaction(async (tx) => {
            const newChangeCount = this.isWithinSameYear(existingVerxatag.updatedAt)
                ? existingVerxatag.changeCount + 1
                : 1;

            const updatedRecord = await this.verxatagRepo.update(
                existingVerxatag.id,
                {
                    username: normalizedNewUsername,
                    changeCount: newChangeCount,
                    updatedAt: new Date()
                },
                tx
            );

            if (!updatedRecord) {
                throw new AppError("Failed to update Verxatag", ResponseHelper.INTERNAL_SERVER_ERROR);
            }

            // Update user's username field
            await this.userRepo.updateUsername(userId, UsernameNormalizer.formatDisplayName(normalizedNewUsername), tx);

            // Record in history
            await this.verxatagRepo.addToUsernameHistory(
                existingVerxatag.id,
                existingVerxatag.username,
                normalizedNewUsername,
                tx
            );
            return updatedRecord;
        });

        logger.debug(
            "Verxatag updated successfully",
            withContext({
                userId,
                oldUsername: existingVerxatag.username,
                newUsername: normalizedNewUsername,
                changeCount: result.changeCount,
                changesRemaining: 2 - result.changeCount,
                action: "verxatag_updated"
            })
        );

        // Send email to user
        await this.sendVerxatagUpdatedNotification(userId, existingVerxatag.username, normalizedNewUsername);

        return {
            ...result,
            changesRemaining: 2 - result.changeCount,
            displayUsername: UsernameNormalizer.formatDisplayName(normalizedNewUsername)
        };
    }

    private async sendVerxatagUpdatedNotification(userId: string, oldUsername: string, newUsername: string) {
        try {
            const user = await this.userRepo.findById(userId);
            if (!user || !user.email) {
                logger.warn("User not found or has no email address for verxatag update email");
                return;
            }

            const displayOldUsername = UsernameNormalizer.formatDisplayName(oldUsername);
            const displayNewUsername = UsernameNormalizer.formatDisplayName(newUsername);

            await this.emailService.sendVerxaIdUpdatedEmail(
                user.email,
                user.username || "",
                displayOldUsername,
                displayNewUsername
            );
        } catch (error) {
            logger.error("Failed to send verxatag update email notification:", error);
        }
    }

    async getVerxatag(username: string) {
        const normalizedUsername = UsernameNormalizer.normalize(username);

        const result = await this.verxatagRepo.findByUsername(normalizedUsername);
        if (!result) {
            throw new AppError("Verxatag not found", ResponseHelper.RESOURCE_NOT_FOUND);
        }

        const { verxatag, user } = result;
        const fullname = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();

        return {
            ...verxatag,
            displayUsername: UsernameNormalizer.formatDisplayName(normalizedUsername),
            status: verxatag.status,
            fullname,
            avatar: user.avatar ?? ""
        };
    }
}

export default VerxatagService;
