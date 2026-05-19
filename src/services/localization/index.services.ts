import { Session } from "express-session";
import { UserRepository } from "../../repository/user";
import { redis } from "../../config/redis";
import { LanguageCode, SUPPORTED_LANGUAGES } from "../../types/locale.types";
import AppError from "../../utils/appError";
import ResponseHelper from "../../utils/helpers/response.helper";
import logger from "../../config/logger";
import { withContext } from "../../utils/loggerWithContext";

export class LocalizationService {
    constructor(private userRepo: UserRepository = new UserRepository()) {}

    async migrateSessionLanguageToUser(session: Session, userId: string): Promise<void> {
        try {
            let language: LanguageCode | null = null;

            if (session.preferences?.language) {
                language = session.preferences.language as LanguageCode;
            }
            //If not in session, check Redis
            else {
                const redisLanguage = await this.getSessionLanguage(session.id);
                if (redisLanguage && this.isValidLanguage(redisLanguage as LanguageCode)) {
                    language = redisLanguage as LanguageCode;
                }
            }

            if (language) {
                // Update user language preference in database
                await this.setUserLanguage(userId, language);

                // clear session and Redis
                if (session.preferences) {
                    delete session.preferences.language;
                }
                await this.clearSessionLanguage(session.id);

                logger.debug(
                    "Migrated language preference for user from session",
                    withContext({
                        userId: userId,
                        language: language,
                        sessionId: session.id,
                        action: "language_migrate_session",
                    })
                );
            }
        } catch (error) {
            logger.error(
                "Failed to migrate language preference for user",
                withContext({
                    userId: userId,
                    sessionId: session.id,
                    error: error instanceof Error ? error.message : "Unknown error",
                    stack: error instanceof Error ? error.stack : undefined,
                    action: "language_migrate_session_failed",
                })
            );
            throw new AppError("Failed to migrate language preference", ResponseHelper.INTERNAL_SERVER_ERROR);
        }
    }

    async setSessionLanguage(session: Session, language: LanguageCode): Promise<void> {
        //Save to session
        if (!session.preferences) {
            session.preferences = {};
        }
        session.preferences.language = language;

        // Cache user language preference in Redis
        await redis.set(`session:${session.id}:language`, language, 60 * 60 * 24);

        logger.debug(
            "Set session language to user",
            withContext({
                userId: session.id,
                language: language,
                action: "language_set_session",
            })
        );
    }

    async setUserLanguage(userId: string, language: LanguageCode): Promise<void> {
        // Update user language preference in database
        await this.userRepo.update(userId, { language });

        // Cache user language preference in Redis
        await this.cacheUserLanguage(userId, language);

        logger.debug(
            "Set user language to user",
            withContext({
                userId: userId,
                language: language,
                action: "language_set_user",
            })
        );
    }

    async getUserLanguage(userId: string): Promise<LanguageCode> {
        // Get from cache
        const cachedLanguage = await this.getCachedUserLanguage(userId);
        if (cachedLanguage && this.isValidLanguage(cachedLanguage as LanguageCode)) {
            logger.debug(
                "Found user language in cache",
                withContext({
                    userId,
                    language: cachedLanguage,
                    action: "user_language_get_cached",
                })
            );
            return cachedLanguage as LanguageCode;
        }

        // if not in cache, get from database
        const user = await this.userRepo.findById(userId);
        if (!user) {
            logger.warn(
                "User not found",
                withContext({
                    userId: userId,
                    action: "language_get_user",
                })
            );
            throw new AppError("User not found", ResponseHelper.BAD_REQUEST);
        }

        const language = (user.language as LanguageCode) || "en-US";

        // Cache user language preference in Redis
        await this.cacheUserLanguage(userId, language);

        logger.debug(
            "Found user language",
            withContext({
                userId: userId,
                language: language,
                action: "language_get_user",
            })
        );

        return language;
    }

    async getSessionLanguage(sessionId: string): Promise<string | null> {
        const redisLanguage = await redis.get(`session:${sessionId}:language`);

        if (redisLanguage) {
            logger.debug(
                "Found session language",
                withContext({
                    sessionId: sessionId,
                    language: redisLanguage,
                    action: "language_get_session",
                })
            );
            return redisLanguage;
        }

        logger.debug(
            "No session language found",
            withContext({
                sessionId: sessionId,
                action: "language_get_session",
            })
        );

        return null;
    }

    async clearSessionLanguage(sessionId: string): Promise<void> {
        await redis.del(`session:${sessionId}:language`);
    }

    async clearUserLanguage(userId: string): Promise<void> {
        await redis.del(`user:preferences:${userId}`);
    }

    private isValidLanguage(language: LanguageCode): boolean {
        return !!SUPPORTED_LANGUAGES[language as LanguageCode];
    }

    private async cacheUserLanguage(userId: string, language: LanguageCode): Promise<void> {
        await redis.set(`user:preferences:${userId}`, language, 60 * 60 * 24 * 7); // 7 days
    }

    private async getCachedUserLanguage(userId: string): Promise<string | null> {
        return await redis.get(`user:preferences:${userId}`);
    }
}
