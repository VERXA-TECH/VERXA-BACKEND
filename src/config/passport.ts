/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * OAuth Passport Configuration
 *
 * IMPORTANT: This implementation is designed for MOBILE-ONLY OAuth flows.
 * - Mobile apps perform OAuth authentication on the client side
 * - ID tokens are sent directly to this backend for verification
 * - No state parameter or server-side OAuth redirect flow is implemented
 *
 * WARNING: This implementation is NOT suitable for web-based OAuth flows.
 * If you need to add web OAuth support, we must implement other security measures
 */
import passport from "passport";
import { Strategy as CustomStrategy } from "passport-custom";
import { handleOAuthCallback } from "../services/auth/oauth.service";
import { OAuthTokens, JWTPayload } from "../types/oauth.types";
import jwt, { JwtHeader } from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { OAuth2Client } from "google-auth-library";
import logger from "./logger";
import AppError from "../utils/appError";
import ResponseHelper from "../utils/helpers/response.helper";
import { Request } from "express";
import { redis } from "./redis";

const googleClient = new OAuth2Client();

const appleJwksClient = jwksClient({
    jwksUri: "https://appleid.apple.com/auth/keys",
    cache: true,
    cacheMaxEntries: 5,
    cacheMaxAge: 600000
});

/**
 * Check if a token has already been used to prevent replay attacks
 * @param payload - The JWT payload containing token identifiers
 * @returns true if token has been used before, false otherwise
 */
async function isTokenUsed(payload: JWTPayload): Promise<boolean> {
    // Use jti (JWT ID) if available, otherwise fall back to sub + iat combination
    const tokenId = payload.jti || `${payload.sub}:${payload.iat}`;
    const redisKey = `oauth:used:${tokenId}`;

    try {
        const client = await redis.getClient();
        const exists = await client.exists(redisKey);
        return exists === 1;
    } catch (error) {
        logger.error("Failed to check token usage in Redis", {
            error: error instanceof Error ? error.message : "Unknown error",
            action: "token_usage_check_failed"
        });
        return true;
    }
}

/**
 * Mark a token as used in Redis with TTL based on token expiry
 * @param payload - The JWT payload containing token identifiers and expiry
 */
async function markTokenAsUsed(payload: JWTPayload): Promise<void> {
    const tokenId = payload.jti || `${payload.sub}:${payload.iat}`;
    const redisKey = `oauth:used:${tokenId}`;

    try {
        const client = await redis.getClient();
        // Set TTL to token expiry to 1 hour (3600 seconds)
        const now = Math.floor(Date.now() / 1000);
        const ttl = payload.exp ? Math.max(payload.exp - now, 60) : 3600;

        await client.setex(redisKey, ttl, "1");
        logger.debug("Token marked as used", {
            tokenId,
            ttl,
            action: "token_marked_as_used"
        });
    } catch (error) {
        logger.error("Failed to mark token as used in Redis", {
            error: error instanceof Error ? error.message : "Unknown error",
            action: "mark_token_used_failed"
        });
    }
}

export function configureOauthPassport() {
    logger.info("Configuring  Passport strategies", {
        action: "passport_config_start"
    });

    passport.use(
        "google",
        new CustomStrategy((req: Request, done) => {
            void (async () => {
                try {
                    const { id_token } = req.body;

                    if (!id_token) {
                        return done(new AppError("Google ID token is required", ResponseHelper.BAD_REQUEST), null);
                    }

                    const payload = await verifyGoogleToken(id_token);

                    if (!payload) {
                        return done(new AppError("Invalid Google ID token", ResponseHelper.UNAUTHORIZED), null);
                    }

                    if (!payload.sub || !payload.email) {
                        return done(new AppError("Invalid Google ID token payload", ResponseHelper.UNAUTHORIZED), null);
                    }

                    // Check for token replay attack
                    const hasBeenUsed = await isTokenUsed(payload);
                    if (hasBeenUsed) {
                        logger.warn("Attempted token reuse detected", {
                            provider: "google",
                            sub: payload.sub,
                            action: "token_reuse_attempt"
                        });
                        return done(new AppError("Token already used", ResponseHelper.UNAUTHORIZED), null);
                    }

                    await markTokenAsUsed(payload);

                    const profile = {
                        id: payload.sub,
                        emails: [{ value: payload.email }],
                        name: {
                            givenName: payload.given_name || "",
                            familyName: payload.family_name || ""
                        },
                        photos: payload.picture ? [{ value: payload.picture }] : [],
                        provider: "google",
                        _json: payload
                    };

                    const tokens: OAuthTokens = {
                        access_token: null,
                        refresh_token: undefined,
                        id_token: id_token,
                        expires_at: payload.exp || Math.floor(Date.now() / 1000) + 3600
                    };

                    const result = await handleOAuthCallback("google", profile, tokens);

                    if (!result.success) {
                        return done(new AppError(result.message, ResponseHelper.UNAUTHORIZED), null);
                    }
                    done(null, result.user);
                } catch (error) {
                    logger.error("Google auth error", {
                        error: error instanceof Error ? error.message : "Unknown error",
                        stack: error instanceof Error ? error.stack : undefined,
                        tokenPresent: !!req.body.id_token,
                        tokenLength: req.body.id_token?.length,
                        action: "google_auth_error"
                    });
                    return done(
                        new AppError("Google authentication failed", ResponseHelper.INTERNAL_SERVER_ERROR),
                        null
                    );
                }
            })();
        })
    );

    passport.use(
        "apple",
        new CustomStrategy((req: Request, done) => {
            void (async () => {
                try {
                    const { identity_token, first_name, last_name } = req.body;

                    if (!identity_token) {
                        return done(new AppError("Apple identity token is required", ResponseHelper.BAD_REQUEST), null);
                    }

                    const payload = await verifyAppleToken(identity_token);
                    if (!payload) {
                        return done(new AppError("Invalid Apple identity token", ResponseHelper.UNAUTHORIZED), null);
                    }
                    if (!payload.sub) {
                        return done(
                            new AppError("Invalid Apple identity token payload", ResponseHelper.UNAUTHORIZED),
                            null
                        );
                    }

                    // Check for token replay attack
                    const hasBeenUsed = await isTokenUsed(payload);
                    if (hasBeenUsed) {
                        logger.warn("Attempted token reuse detected", {
                            provider: "apple",
                            sub: payload.sub,
                            action: "token_reuse_attempt"
                        });
                        return done(new AppError("Token already used", ResponseHelper.UNAUTHORIZED), null);
                    }

                    await markTokenAsUsed(payload);

                    const profile = {
                        id: payload.sub,
                        emails: payload.email ? [{ value: payload.email }] : [],
                        name: {
                            givenName: first_name || "",
                            familyName: last_name || ""
                        },
                        provider: "apple",
                        _json: {
                            email: payload.email,
                            email_verified: payload.email_verified === true
                        }
                    };

                    const tokens: OAuthTokens = {
                        access_token: null,
                        refresh_token: undefined,
                        id_token: identity_token,
                        expires_at: payload.exp || Math.floor(Date.now() / 1000) + 3600
                    };

                    const result = await handleOAuthCallback("apple", profile, tokens);

                    if (!result.success) {
                        return done(new AppError(result.message, ResponseHelper.UNAUTHORIZED), null);
                    }

                    done(null, result.user);
                } catch (error) {
                    logger.error("Apple auth error", {
                        error: error instanceof Error ? error.message : "Unknown error",
                        stack: error instanceof Error ? error.stack : undefined,
                        tokenPresent: !!req.body.identity_token,
                        tokenLength: req.body.identity_token?.length,
                        hasFirstName: !!req.body.first_name,
                        hasLastName: !!req.body.last_name,
                        action: "apple_auth_error"
                    });
                    return done(
                        new AppError("Apple authentication failed", ResponseHelper.INTERNAL_SERVER_ERROR),
                        null
                    );
                }
            })();
        })
    );

    async function verifyGoogleToken(token: string): Promise<JWTPayload | null> {
        try {
            const clientIds = [process.env.GOOGLE_IOS_CLIENT_ID, process.env.GOOGLE_ANDROID_CLIENT_ID].filter(
                Boolean
            ) as string[];

            if (clientIds.length === 0) {
                logger.error("No Google client IDs configured");
                return null;
            }

            // Verify token against all client IDs in parallel
            const results = await Promise.allSettled(
                clientIds.map((clientId) =>
                    googleClient.verifyIdToken({
                        idToken: token,
                        audience: clientId
                    })
                )
            );

            const successfulResult = results.find((r) => r.status === "fulfilled");
            if (!successfulResult || successfulResult.status !== "fulfilled") {
                logger.warn("Google token verification failed for all client IDs");
                return null;
            }

            const ticket = successfulResult.value;

            const payload = ticket.getPayload();
            if (!payload) {
                return null;
            }

            const validIssuers = ["accounts.google.com", "https://accounts.google.com"];
            if (!validIssuers.includes(payload.iss || "")) {
                logger.warn("Invalid Google token issuer", { issuer: payload.iss });
                return null;
            }

            const now = Math.floor(Date.now() / 1000);
            if (payload.exp && payload.exp < now) {
                logger.warn("Google token expired", { exp: payload.exp, now });
                return null;
            }

            return {
                sub: payload.sub,
                email: payload.email,
                email_verified: payload.email_verified,
                given_name: payload.given_name,
                family_name: payload.family_name,
                picture: payload.picture,
                exp: payload.exp,
                iat: payload.iat,
                iss: payload.iss,
                aud: payload.aud,
                jti: (payload as any).jti // Include JWT ID for replay protection if present
            };
        } catch (error) {
            logger.error("Google token verification error", {
                error: error instanceof Error ? error.message : "Unknown error"
            });
            return null;
        }
    }

    async function verifyAppleToken(token: string): Promise<JWTPayload | null> {
        try {
            const decodedHeader = jwt.decode(token, { complete: true });
            if (!decodedHeader) {
                logger.error("Failed to decode Apple token header");
                return null;
            }

            const header = decodedHeader.header as JwtHeader;
            const kid = header.kid;

            if (!kid) {
                logger.error("Apple token missing key ID");
                return null;
            }

            const key = await appleJwksClient.getSigningKey(kid);
            const signingKey = key.getPublicKey();

            const decoded = jwt.verify(token, signingKey, {
                algorithms: ["RS256"],
                audience: process.env.APPLE_BUNDLE_ID,
                issuer: "https://appleid.apple.com"
            }) as jwt.JwtPayload;

            if (decoded.iss !== "https://appleid.apple.com") {
                logger.warn("Invalid Apple token issuer", {
                    issuer: decoded.iss,
                    expected: "https://appleid.apple.com"
                });
                return null;
            }

            if (decoded.aud !== process.env.APPLE_BUNDLE_ID) {
                logger.warn("Invalid Apple token audience", {
                    audience: decoded.aud,
                    expected: process.env.APPLE_BUNDLE_ID
                });
                return null;
            }

            const now = Math.floor(Date.now() / 1000);
            if (decoded.exp && decoded.exp < now) {
                logger.warn("Apple token expired", { exp: decoded.exp, now });
                return null;
            }

            return {
                sub: decoded.sub,
                email: decoded.email as string | undefined,
                email_verified: true,
                exp: decoded.exp,
                iat: decoded.iat,
                iss: decoded.iss,
                aud: decoded.aud as string,
                jti: decoded.jti // Include JWT ID for replay protection
            };
        } catch (error) {
            logger.error("Apple token verification error", {
                error: error instanceof Error ? error.message : "Unknown error"
            });
            return null;
        }
    }
}
