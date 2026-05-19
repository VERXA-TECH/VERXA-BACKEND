/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response, NextFunction } from "express";
import { LocalizationService } from "../services/localization/index.services";
import { UserRepository } from "../repository/user";
import { SUPPORTED_LANGUAGES, LanguageCode } from "../types/locale.types";
import { Language } from "../db/schema/users.schema";
import logger from "../config/logger";
import { withContext } from "../utils/loggerWithContext";

const localizationService = new LocalizationService(new UserRepository());

function isValidLanguage(language: string): language is LanguageCode {
    return Object.prototype.hasOwnProperty.call(SUPPORTED_LANGUAGES, language);
}

export async function localizationMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
        let language: LanguageCode = Language.EN_US;
        const userId = req.userId;

        if (userId) {
            // authenticated user
            try {
                const userLanguage = await localizationService.getUserLanguage(userId);
                if (userLanguage && isValidLanguage(userLanguage)) {
                    language = userLanguage;
                }
            } catch (error) {
                logger.warn(
                    `Failed to get user language preference for user ${userId}:`,
                    withContext({
                        userId: userId,
                        error: error,
                        action: "failed_to_get_user_language_preference",
                    })
                );
            }
        } else {
            // Unauthenticated user -check session first, then Redis for backup
            if (req.session.preferences?.language && isValidLanguage(req.session.preferences.language)) {
                language = req.session.preferences.language;
            } else {
                try {
                    const sessionLanguage = await localizationService.getSessionLanguage(req.session.id);
                    if (sessionLanguage && isValidLanguage(sessionLanguage)) {
                        language = sessionLanguage as LanguageCode;
                    }
                } catch (error) {
                    logger.warn(
                        "Failed to get session language using default",
                        withContext({
                            error: error,
                            action: "failed_to_get_session_language",
                        })
                    );
                }
            }
        }
        const langConfig = SUPPORTED_LANGUAGES[language];

        req.language = langConfig;

        //set Response Header for language
        res.setHeader("Content-Language", language);
        res.setHeader("X-Timezone", langConfig.timezone);
        res.setHeader("X-TextDirection", langConfig.textDirection);

        next();
    } catch (error) {
        next(error);
    }
}
