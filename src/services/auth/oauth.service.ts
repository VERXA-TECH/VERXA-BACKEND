/* eslint-disable @typescript-eslint/no-explicit-any */
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../../config/db";
import { users } from "../../db/schema/users.schema";
import {
    OAuthTokens,
    OAuthProvider,
    OAuthResponse,
    OAuthSuccessResponse,
    OAuthErrorResponse,
    OAuthProfile
} from "../../types/oauth.types";
import { encrypt, decrypt } from "../../utils/helpers/encryption.helper";
import { oauthProviders } from "../../db/schema/oauth.schema";
import logger from "../../config/logger";

import { getRandomAvatar } from "../../utils/constants/avatars";

export const handleOAuthCallback = async (
    provider: OAuthProvider,
    profile: OAuthProfile,
    tokens: OAuthTokens
): Promise<OAuthResponse> => {
    try {
        logger.info(`Handling Oauth callback for ${provider}`);

        const db = getDb();

        const email = profile.emails?.[0]?.value || profile.email || profile._json?.email;
        if (!email) {
            logger.debug("OAuth Failed - missing email", {
                provider: provider,
                profileData: profile,
                action: "oauth_failed_missing_email"
            });
            return { success: false, message: "Email required from Oauth provider" };
        }

        const normalizedEmail = email.toLowerCase();

        const existingProvider = await db
            .select()
            .from(oauthProviders)
            .where(and(eq(oauthProviders.provider, provider), eq(oauthProviders.providerId, profile.id)))
            .limit(1);

        if (existingProvider.length > 0) {
            await updateTokens(existingProvider[0].id, tokens);
            const user = await db.select().from(users).where(eq(users.id, existingProvider[0].userId)).limit(1);

            logger.debug("OAuth login successful", {
                userId: user[0].id,
                isNewUser: false,
                action: "oauth_login_success"
            });

            return { success: true, user: user[0] } as OAuthSuccessResponse;
        }

        const existingUser = await db
            .select()
            .from(users)
            .where(sql`lower(${users.email}) = ${normalizedEmail}`)
            .limit(1);

        if (existingUser.length > 0) {
            await db.transaction(async (tx) => {
                await createProviderConnectionIn(tx, existingUser[0].id, provider, profile, tokens);
            });

            logger.info("Existing user connect OAuth Provider", {
                userId: existingUser[0].id,
                email: normalizedEmail,
                provider: provider,
                providerId: profile.id,
                isNewUser: false,
                action: "oauth_login_success"
            });

            return { success: true, user: existingUser[0] } as OAuthSuccessResponse;
        }

        return createUserWithProvider(normalizedEmail, provider, profile, tokens);
    } catch (error) {
        logger.error("Error handling oauth callback", {
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            action: "oauth_callback_error"
        });
        return { success: false, message: "Error handling oauth callback" } as OAuthErrorResponse;
    }
};

const createUserWithProvider = async (email: string, provider: OAuthProvider, profile: any, tokens: OAuthTokens) => {
    try {
        const db = getDb();

        const firstName = profile.name?.givenName || profile._json.name?.givenName || "";
        const lastName = profile.name?.familyName || profile._json.name?.familyName || "";
        const isEmailVerified =
            profile.email_verified || profile.verified_email || profile._json?.email_verified || false;

        const result = await db.transaction(async (tx) => {
            const [newUser] = await tx
                .insert(users)
                .values({
                    email: email,
                    username: "",
                    passwordHash: "",
                    firstName: firstName,
                    lastName: lastName,
                    emailVerified: isEmailVerified,
                    emailVerifiedAt: isEmailVerified ? new Date() : null,
                    avatar: getRandomAvatar().url
                })
                .returning();

            logger.info("New user created via OAuth", {
                userId: newUser.id,
                email: email,
                provider: provider,
                providerId: profile.id,
                emailVerified: isEmailVerified,
                action: "oauth_create_user"
            });
            await createProviderConnectionIn(tx, newUser.id, provider, profile, tokens);

            return newUser;
        });

      
        return { success: true, user: result } as OAuthSuccessResponse;
    } catch (error) {
        logger.error("Error creating user with oauth provider", {
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            action: "oauth_create_user_error"
        });
        return {
            success: false,
            message: "Error creating user with oauth provider"
        } as OAuthErrorResponse;
    }
};

const createProviderConnectionIn = async (
    tx: any,
    userId: string,
    provider: OAuthProvider,
    profile: any,
    tokens: OAuthTokens
) => {
    const encryptedAccessToken = tokens.access_token ? encrypt(tokens.access_token) : null;
    const encryptedRefreshToken = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;
    const encryptedIdToken = tokens.id_token ? encrypt(tokens.id_token) : null;

    await tx.insert(oauthProviders).values({
        userId: userId,
        provider: provider,
        providerId: profile.id,
        accessToken: encryptedAccessToken ? JSON.stringify(encryptedAccessToken) : null,
        refreshToken: encryptedRefreshToken ? JSON.stringify(encryptedRefreshToken) : null,
        idToken: encryptedIdToken ? JSON.stringify(encryptedIdToken) : null,
        tokenExpiry: tokens.expires_at ? new Date(tokens.expires_at * 1000) : null
    });

    logger.debug("New OAuth provider created", {
        userId: userId,
        provider: provider,
        providerId: profile.id,
        action: "oauth_create_provider"
    });
};

const updateTokens = async (providerId: string, tokens: OAuthTokens) => {
    const db = getDb();

    const encryptedAccessToken = tokens.access_token ? encrypt(tokens.access_token) : null;
    const encryptedRefreshToken = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;
    const encryptedIdToken = tokens.id_token ? encrypt(tokens.id_token) : null;

    await db
        .update(oauthProviders)
        .set({
            accessToken: encryptedAccessToken ? JSON.stringify(encryptedAccessToken) : null,
            refreshToken: encryptedRefreshToken ? JSON.stringify(encryptedRefreshToken) : null,
            idToken: encryptedIdToken ? JSON.stringify(encryptedIdToken) : null,
            tokenExpiry: tokens.expires_at ? new Date(tokens.expires_at * 1000) : null,
            updatedAt: new Date()
        })
        .where(eq(oauthProviders.id, providerId));

    logger.debug("OAuth tokens updated successfully", {
        providerId: providerId,
        action: "oauth_update_tokens",
        hasNewAccessToken: encryptedAccessToken ? true : false,
        hasNewRefreshToken: encryptedRefreshToken ? true : false,
        updatedAt: new Date()
    });
};

export const decryptTokens = async (userId: string, provider: OAuthProvider) => {
    try {
        const db = getDb();

        const result = await db
            .select()
            .from(oauthProviders)
            .where(and(eq(oauthProviders.userId, userId), eq(oauthProviders.provider, provider)))
            .limit(1);

        if (result.length === 0) {
            logger.warn("OAuth token decryption failed -no provide", {
                userId: userId,
                provider: provider,
                reason: "No OAuth provider found for user",
                action: "oauth_token_decryption_failed"
            });
            return { success: false, message: "No OAuth provider found for user" };
        }

        const oauthProvider = result[0];

        let accessToken = null;
        let refreshToken = null;
        let idToken = null;

        if (oauthProvider.accessToken) {
            const { iv, encryptedData, authTag } = JSON.parse(oauthProvider.accessToken);
            accessToken = decrypt(encryptedData, iv, authTag);
        }

        if (oauthProvider.refreshToken) {
            const { iv, encryptedData, authTag } = JSON.parse(oauthProvider.refreshToken);
            refreshToken = decrypt(encryptedData, iv, authTag);
        }

        if (oauthProvider.idToken) {
            const { iv, encryptedData, authTag } = JSON.parse(oauthProvider.idToken);
            idToken = decrypt(encryptedData, iv, authTag);
        }

        logger.debug("OAuth tokens decrypted successfully", {
            userId: userId,
            provider: provider,
            purpose: "api_access",
            updatedAt: new Date(),
            action: "oauth_decrypt_tokens"
        });

        return {
            success: true,
            data: {
                accessToken,
                refreshToken,
                idToken,
                expiresAt: oauthProvider.tokenExpiry
            }
        };
    } catch (error) {
        logger.error("Failed to get OAuth tokens", {
            userId: userId,
            provider: provider,
            reason: "Failed to get OAuth tokens",
            error: error,
            action: "oauth_decrypt_tokens"
        });
        return { success: false, message: "Failed to get OAuth tokens" };
    }
};
