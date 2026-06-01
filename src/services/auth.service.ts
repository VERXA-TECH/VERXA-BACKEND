import crypto from "node:crypto";
import AppError from "../utils/appError";
import ResponseHelper from "../utils/helpers/response.helper";
import { UserRepository } from "../repository/user";
import { UserDeviceRepository } from "../repository/device";
import OtpService from "./otp/index.service";
import { UserDeviceStatus } from "../db/schema/devices.schema";

export class AuthService {
    private userRepository = new UserRepository();
    private userDeviceRepository = new UserDeviceRepository();
    private otpService = new OtpService();

    async signup(email: string, country: string, deviceInfo: any, ip: string, userAgent: string) {
        const normalizedEmail = email.trim().toLowerCase();

        let user = await this.userRepository.findByEmail(normalizedEmail);

        if (user) {
            if (user.emailVerified) {
                throw new AppError("Account already exists with this email address.", ResponseHelper.BAD_REQUEST);
            }
            // Update country if changed
            if (user.country !== country) {
                await this.userRepository.update(user.id, { country });
                user.country = country;
            }
        } else {
            // Create user
            user = await this.userRepository.create({
                email: normalizedEmail,
                country,
                emailVerified: false,
            });
        }

        // Capture Device Info
        const fingerprintSource = `${deviceInfo.uniqueId}:${deviceInfo.os}:${deviceInfo.name}`;
        const fingerprintHash = crypto.createHash("sha256").update(fingerprintSource).digest("hex");

        const existingDevice = await this.userDeviceRepository.findByDeviceId(deviceInfo.uniqueId, user.id);
        if (!existingDevice) {
            await this.userDeviceRepository.create({
                userId: user.id,
                deviceId: deviceInfo.uniqueId,
                deviceName: deviceInfo.name,
                os: deviceInfo.os,
                fingerprintHash,
                ip,
                userAgent,
                status: UserDeviceStatus.PENDING,
            });
        } else {
            await this.userDeviceRepository.recordLoginObservation(
                existingDevice.id,
                user.id,
                country,
                ip
            );
        }

        // Send OTP
        const otpResult = await this.otpService.generateAndSendOtp(
            normalizedEmail,
            "signup_verification",
            normalizedEmail
        );

        if (!otpResult.success) {
            throw new AppError(otpResult.message || "Failed to send verification code.", ResponseHelper.INTERNAL_SERVER_ERROR);
        }

        return { email: normalizedEmail };
    }
}

export default AuthService;
