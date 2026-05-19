import { NextFunction, Request, Response } from "express";
import { requestContextManager } from "../config/async-context";
import logger from "../config/logger";
import { UserRepository } from "../repository/user";
import AppError from "../utils/appError";
import AuthHelper from "../utils/helpers/auth.helper";
import PinHelper from "../utils/helpers/pin.helper";
import ResponseHelper from "../utils/helpers/response.helper";
import { withContext } from "../utils/loggerWithContext";

class AuthMiddleware {
    static async protect(req: Request, res: Response, next: NextFunction) {
        try {
            let token;
            if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
                token = req.headers.authorization.split(" ")[1];
            }
            if (!token) {
                logger.warn(
                    "Unauthorized request without token",
                    withContext({
                        userAgent: req.headers["user-agent"],
                        path: req.path,
                        ip: req.ip,
                        action: "unauthorized_request_without_token"
                    })
                );
                return next(
                    new AppError("You are not logged in. Please provide a valid token.", ResponseHelper.UNAUTHORIZED)
                );
            }
            const decoded = await AuthHelper.verifyAndDecodeToken(token);
            req.userId = decoded.id;

            const context = requestContextManager.getContext();
            if (context) {
                context.userId = decoded.id;
            }

            const userRepository = new UserRepository();
            const user = await userRepository.findById(decoded.id);

            if (!user) {
                logger.warn(
                    "Authentication failed - user not found",
                    withContext({
                        userId: decoded.id,
                        ip: req.ip,
                        path: req.path,
                        action: "authentication_failed_user_not_found"
                    })
                );
                throw new AppError("User not found", ResponseHelper.UNAUTHORIZED);
            }

            logger.info(
                "User authenticated successfully",
                withContext({
                    userId: user.id,
                    email: user.email,
                    ip: req.ip,
                    userAgent: req.get("User-Agent"),
                    path: req.path,
                    action: "authentication_success"
                })
            );

            if (user?.lockoutUntil && new Date(user.lockoutUntil) > new Date()) {
                logger.warn(
                    "Authentication blocked - account locked",
                    withContext({
                        userId: user.id,
                        email: user.email,
                        ip: req.ip,
                        lockoutUntil: user.lockoutUntil,
                        action: "authentication_blocked_account_locked"
                    })
                );

                throw new AppError(
                    "Account locked due to too many failed attempts. Try again later.",
                    ResponseHelper.FORBIDDEN
                );
            }

            if (user?.isArchived) {
                logger.warn(
                    "Authentication blocked - account archived",
                    withContext({
                        userId: user.id,
                        email: user.email,
                        ip: req.ip,
                        action: "authentication_blocked_account_archived"
                    })
                );
                throw new AppError("Account archieved. Contact Support", ResponseHelper.FORBIDDEN);
            }

            if (!user?.isActive) {
                logger.warn(
                    "Authentication blocked - account suspended",
                    withContext({
                        userId: user.id,
                        email: user.email,
                        ip: req.ip,
                        action: "authentication_blocked_account_suspended"
                    })
                );
                throw new AppError("Account suspended. Contact Support", ResponseHelper.FORBIDDEN);
            }

            const { passwordHash: _ph, unlockPinHash: _uph, txnPinHash: _tph, mfaSecretEnc: _mfa, ...safeUser } = user;
            req.user = safeUser;
            req.body.email = user.email;

            return next();
        } catch (error) {
            logger.error(
                "Authentication failed",
                withContext({
                    ip: req.ip,
                    path: req.path,
                    error: error instanceof Error ? error.message : "Unknown error",
                    stack: error instanceof Error ? error.stack : undefined,
                    action: "authentication_failed"
                })
            );
            next(error);
        }
    }

    static async checkAccountLockout(req: Request, res: Response, next: NextFunction) {
        const startTime = Date.now();
        try {
            const { email } = req.body;
            const userRepository = new UserRepository();
            const user = await userRepository.findByEmail(email);

            if (user?.lockoutUntil && new Date(user.lockoutUntil) > new Date()) {
                const minutesLeft = Math.ceil((new Date(user.lockoutUntil).getTime() - Date.now()) / (60 * 1000));
                logger.warn(
                    "Login blocked - account locked",
                    withContext({
                        userId: user.id,
                        email: user.email,
                        ip: req.ip,
                        lockoutUntil: user.lockoutUntil,
                        action: "login_blocked_account_locked",
                        duration_ms: Date.now() - startTime
                    })
                );

                throw new AppError(
                    "Account locked due to too many failed attempts. Try again later.",
                    ResponseHelper.FORBIDDEN,
                    { isLocked: true, lockoutMinutes: minutesLeft }
                );
            }

            logger.debug(
                "Account lockout check passed",
                withContext({
                    email: email,
                    ip: req.ip,
                    action: "lockout_check_passed",
                    duration_ms: Date.now() - startTime
                })
            );

            req.user = user;
            return next();
        } catch (error) {
            logger.error(
                "Account lockout check error",
                withContext({
                    email: req.body.email,
                    ip: req.ip,
                    error: error instanceof Error ? error.message : "Unknown error",
                    stack: error instanceof Error ? error.stack : undefined,
                    action: "lockout_check_error",
                    duration_ms: Date.now() - startTime
                })
            );
            next(error);
        }
    }

    static checkPinBlocked(type: "unlock" | "transaction") {
        return async (req: Request, res: Response, next: NextFunction) => {
            const startTime = Date.now();
            try {
                const userId = (req as any).userId;
                if (!userId) {
                    logger.warn(
                        "PIN check failed - no user ID",
                        withContext({
                            ip: req.ip,
                            path: req.path,
                            action: "pin_check_failed_no_user",
                            duration_ms: Date.now() - startTime
                        })
                    );
                    return next(new AppError("Unauthorized", ResponseHelper.UNAUTHORIZED));
                }

                const pinBlocked = await PinHelper.checkPinBlocked(userId, type);
                if (pinBlocked) {
                    const remainingTime = await PinHelper.getRemainingBlockTime(userId, type);
                    logger.warn(
                        "Operation blocked - PIN locked",
                        withContext({
                            userId: userId,
                            pinType: type,
                            remainingTime: remainingTime,
                            ip: req.ip,
                            path: req.path,
                            action: "operation_blocked_pin_locked",
                            duration_ms: Date.now() - startTime
                        })
                    );
                    const duration = remainingTime ? PinHelper.formatLockoutDuration(remainingTime) : "some time";
                    return next(
                        new AppError(
                            `Pin blocked due to too many failed attempts. Try again in ${duration}.`,
                            ResponseHelper.FORBIDDEN
                        )
                    );
                }
                logger.debug(
                    "Pin check passed",
                    withContext({
                        ip: req.ip,
                        path: req.path,
                        action: "pin_check_passed",
                        duration_ms: Date.now() - startTime
                    })
                );
                return next();
            } catch (error) {
                logger.error(
                    "Pin check failed",
                    withContext({
                        ip: req.ip,
                        path: req.path,
                        error: error instanceof Error ? error.message : "Unknown error",
                        stack: error instanceof Error ? error.stack : undefined,
                        action: "pin_check_failed",
                        duration_ms: Date.now() - startTime
                    })
                );
                next(error);
            }
        };
    }

    static restrictTo(...roles: Array<"admin" | "super-admin" | "merchant" | "basic-user">) {
        return (req: Request, res: Response, next: NextFunction) => {
            const user = req.user;
            if (!user) {
                return next(new AppError("Unauthorized", ResponseHelper.UNAUTHORIZED));
            }

            // super-admin always allowed
            if (user.role === "super-admin") return next();

            if (!user.role || !roles.includes(user.role as any)) {
                logger.warn(
                    "Authorization failed - insufficient role",
                    withContext({
                        userId: user.id,
                        userRole: user.role,
                        requiredRoles: roles,
                        path: req.path,
                        action: "authorization_failed_insufficient_role"
                    })
                );
                return next(new AppError("Forbidden", ResponseHelper.FORBIDDEN));
            }

            return next();
        };
    }
}

export default AuthMiddleware;
