import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import envConfig from "../../config/env";
import AppError from "../appError";
import { redis } from "../../config/redis";
import ResponseHelper from "./response.helper";

interface DecodedToken {
    id: string;
    iat: number;
    exp: number;
    iss: string;
    aud: string;
}

class AuthHelper {
    static initialize() {
        if (!envConfig.jwt.secret || envConfig.jwt.secret.trim() === "") {
            throw new Error("JWT_SECRET is not defined in environment configuration");
        }
        if (!envConfig.jwt.expiresIn || envConfig.jwt.expiresIn.trim() === "") {
            throw new Error("JWT_EXPIRES_IN is not defined in environment configuration");
        }
        if (!envConfig.jwt.issuer || envConfig.jwt.issuer.trim() === "") {
            throw new Error("JWT_ISSUER is not defined in environment configuration");
        }
        if (!envConfig.jwt.audience || envConfig.jwt.audience.trim() === "") {
            throw new Error("JWT_AUDIENCE is not defined in environment configuration");
        }
        if (!envConfig.bcryptSaltRounds || isNaN(Number(envConfig.bcryptSaltRounds))) {
            throw new Error("BCRYPT_SALT_ROUNDS is not defined or invalid in environment configuration");
        }
    }

    static async verifyAndDecodeRefreshToken(token: string): Promise<DecodedToken & { jti: string; typ?: string }> {
        try {
            const decoded = jwt.verify(token, envConfig.jwt.secret, {
                issuer: envConfig.jwt.issuer,
                audience: envConfig.jwt.audience,
                algorithms: ["HS256"]
            }) as DecodedToken & { jti: string; typ?: string };

            if (decoded.typ && decoded.typ !== "refresh") {
                throw new AppError("Invalid token type", 401);
            }

            if (!decoded.id || !decoded.jti) {
                throw new AppError("Invalid refresh token payload", 401);
            }
            return decoded;
        } catch (error) {
            if (error instanceof Error && error.name === "TokenExpiredError") {
                throw new AppError("Refresh token has expired, please log in again", 401);
            }
            if (error instanceof Error && error.name === "JsonWebTokenError") {
                throw new AppError("Invalid refresh token", 401);
            }
            throw error instanceof AppError ? error : new AppError("Refresh token verification failed", 401);
        }
    }

    static async passwordToHash(text: string): Promise<string> {
        const saltRounds = Number(envConfig.bcryptSaltRounds) || 12;
        try {
            return await bcrypt.hash(text, saltRounds);
        } catch (_error) {
            throw new AppError("Failed to hash password", 500);
        }
    }

    static async createAuthToken(userId: string): Promise<string> {
        const payload = {
            id: userId,
            iss: envConfig.jwt.issuer,
            aud: envConfig.jwt.audience
        };
        const token = jwt.sign(payload, envConfig.jwt.secret, {
            expiresIn: envConfig.jwt.expiresIn,
            algorithm: "HS256"
        });
        const existingToken = await redis.get(`token:${userId}`);
        if (existingToken) {
            await this.blacklistToken(existingToken);
        }
        await redis.set(`token:${userId}`, token);
        return token;
    }

    static createRefreshToken(userId: string, jti: string): string {
        const payload = {
            id: userId,
            jti,
            iss: envConfig.jwt.issuer,
            aud: envConfig.jwt.audience,
            typ: "refresh"
        };
        return jwt.sign(payload, envConfig.jwt.secret, {
            expiresIn: envConfig.jwt.refreshExpiresIn,
            algorithm: "HS256"
        });
    }

    static refreshExpiresMs(): number {
        return this.parseDurationToMs(envConfig.jwt.refreshExpiresIn);
    }

    private static parseDurationToMs(input: string): number {
        // supports formats like '90d', '12h', '30m', '45s'
        const match = /^(\d+)([smhd])?$/.exec(input.trim());
        if (!match) return 0;
        const value = Number(match[1]);
        const unit = match[2] || "s";
        const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
        return value * (multipliers[unit] ?? 1000);
    }

    static async blacklistToken(token: string): Promise<void> {
        // Unit tests can still test blacklisting logic
        if (process.env.E2E_TEST === "true") {
            return;
        }

        try {
            const decoded = jwt.decode(token) as DecodedToken | null;
            let ttl = 0;
            if (decoded?.exp) {
                const expMs = decoded.exp * 1000;
                ttl = Math.max(0, Math.floor((expMs - Date.now()) / 1000));
            }
            if (ttl > 0) {
                await redis.set(`blacklist:${token}`, "1", ttl);
            } else {
                await redis.set(`blacklist:${token}`, "1");
            }
        } catch (_error) {
            throw new AppError("Failed to blacklist token", 500);
        }
    }

    static async verifyBcryptPassword(password: string, hash: string): Promise<boolean> {
        try {
            return await bcrypt.compare(password, hash);
        } catch (_error) {
            throw new AppError("Failed to verify password", 500);
        }
    }

    static async verifyAndDecodeToken(token: string): Promise<DecodedToken> {
        try {
            // Check if the token is blacklisted
            const isBlacklisted = await redis.get(`blacklist:${token}`);
            if (isBlacklisted) {
                throw new AppError("Token has been revoked, please log in again", 401);
            }

            const decoded = jwt.verify(token, envConfig.jwt.secret, {
                issuer: envConfig.jwt.issuer,
                audience: envConfig.jwt.audience,
                algorithms: ["HS256"]
            }) as DecodedToken;

            if (!decoded.id) {
                throw new AppError("Invalid token payload: missing id", 401);
            }

            return decoded;
        } catch (error) {
            if (error instanceof Error && error.name === "TokenExpiredError") {
                throw new AppError("Token has expired, please log in again", 401);
            }
            if (error instanceof Error && error.name === "JsonWebTokenError") {
                throw new AppError("Invalid token, please log in again", 401);
            }
            throw error instanceof AppError ? error : new AppError("Token verification failed", 401);
        }
    }

    static async rateLimitPinAttempts(userId: string) {
        const key = `pin:failures:${userId}`;
        const attempts = await redis.get(key);
        if (attempts && parseInt(attempts) >= envConfig.pin.maxAttempts) {
            throw new AppError("Too many requests. Please try again later.", ResponseHelper.TOO_MANY_REQUESTS);
        }
        return key;
    }
}

AuthHelper.initialize();

export default AuthHelper;
