import crypto from "node:crypto";
import { customAlphabet } from "nanoid";
import logger from "../config/logger";
import AppError from "../utils/appError";
import ResponseHelper from "../utils/helpers/response.helper";
import { UserRepository } from "../repository/user";
import { UserDeviceRepository } from "../repository/device";
import { DeviceTrustTokenHistoryRepository } from "../repository/device-trust-token-history";
import DeviceTrustService from "./security/device-trust.service";
import BaseOtpService from "./otp/index.service";
import AuthHelper from "../utils/helpers/auth.helper";
import EmailQueue from "../queues/email.queue";
import { OtpType } from "../utils/constants/otp";

export class OtpService {
    private userRepository = new UserRepository();
    private userDeviceRepository = new UserDeviceRepository();
    private deviceTrustService = new DeviceTrustService();
    private deviceTrustTokenHistoryRepository = new DeviceTrustTokenHistoryRepository();
    private baseOtpService = new BaseOtpService();

    async sendOtp(email: string, purpose: OtpType) {
        const normalizedEmail = email.trim().toLowerCase();
        const user = await this.userRepository.findByEmail(normalizedEmail);

        if (!user) {
            throw new AppError("User not found.", ResponseHelper.RESOURCE_NOT_FOUND);
        }

        if (purpose === "signup_verification" && user.emailVerified) {
            throw new AppError("Email is already verified.", ResponseHelper.BAD_REQUEST);
        }

        const otpResult = await this.baseOtpService.generateAndSendOtp(
            normalizedEmail,
            purpose,
            normalizedEmail
        );

        if (!otpResult.success) {
            throw new AppError(otpResult.message || "Failed to send OTP.", ResponseHelper.INTERNAL_SERVER_ERROR);
        }

        return { email: normalizedEmail };
    }

    async validateOtp(email: string, otp: string, purpose: OtpType, deviceInfo?: any, ip?: string) {
        const normalizedEmail = email.trim().toLowerCase();
        const user = await this.userRepository.findByEmail(normalizedEmail);

        if (!user) {
            throw new AppError("User not found.", ResponseHelper.RESOURCE_NOT_FOUND);
        }

        const otpResult = await this.baseOtpService.validateOtp(normalizedEmail, purpose, otp);

        if (!otpResult.success) {
            throw new AppError(otpResult.message || "Invalid or expired OTP.", ResponseHelper.BAD_REQUEST);
        }

        let responseData: any = {};

        if (purpose === "signup_verification") {
            // Update User as verified
            let referralCode = user.referralCode;
            if (!referralCode) {
                const generateCode = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 7);
                referralCode = `VX-${generateCode()}`;
                let exists = await this.userRepository.findByReferralCode(referralCode);
                let attempts = 0;
                while (exists && attempts < 10) {
                    referralCode = `VX-${generateCode()}`;
                    exists = await this.userRepository.findByReferralCode(referralCode);
                    attempts++;
                }
            }

            await this.userRepository.update(user.id, {
                emailVerified: true,
                emailVerifiedAt: new Date(),
                referralCode,
            });

            // Queue welcome email
            try {
                await EmailQueue.add({
                    type: "welcome",
                    email: normalizedEmail,
                    name: user.firstName || normalizedEmail.split("@")[0],
                });
            } catch (queueError) {
                logger.error("Failed to queue welcome email", { error: queueError, email: normalizedEmail });
            }

            // Generate JWT Tokens
            const jti = crypto.randomUUID();
            const accessToken = await AuthHelper.createAuthToken(user.id);
            const refreshToken = AuthHelper.createRefreshToken(user.id, jti);

            // Handle Device Trust Activation
            let deviceTrustToken = null;
            if (deviceInfo && deviceInfo.uniqueId) {
                const device = await this.userDeviceRepository.findByDeviceId(deviceInfo.uniqueId, user.id);
                if (device) {
                    const trustRecord = await this.deviceTrustService.createTrustRecord();
                    deviceTrustToken = trustRecord.token;

                    await this.userDeviceRepository.activateTrustedDevice(
                        device.id,
                        user.id,
                        trustRecord.tokenHash,
                        trustRecord.issuedAt,
                        trustRecord.expiresAt,
                        user.country || undefined,
                        ip
                    );

                    await this.deviceTrustTokenHistoryRepository.add({
                        deviceId: device.id,
                        tokenHash: trustRecord.tokenHash,
                        expiresAt: trustRecord.expiresAt,
                    });

                    const refreshExpiry = new Date(Date.now() + AuthHelper.refreshExpiresMs());
                    const refreshHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
                    await this.userDeviceRepository.rotateRefreshToken(
                        device.id,
                        jti,
                        refreshHash,
                        refreshExpiry,
                        user.country || undefined,
                        ip
                    );
                }
            }

            responseData = {
                accessToken,
                refreshToken,
                deviceTrustToken,
                user: {
                    id: user.id,
                    email: user.email,
                    referralCode,
                },
            };
        }

        return responseData;
    }
}

export default OtpService;
