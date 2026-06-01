import AppError from "../utils/appError";
import ControllerHelper from "../utils/helpers/controller.helper";
import ResponseHelper from "../utils/helpers/response.helper";
import AuthValidator from "../validators/auth.validator";
import OtpService from "../services/otp.service";

export default class OtpController {
    static sendOtp = ControllerHelper.createHandler("sendOtp", async (req, res, next) => {
        const validation = AuthValidator.sendOtp(req.body);
        if (validation.error) {
            return next(new AppError(validation.error.message, ResponseHelper.BAD_REQUEST));
        }

        const { email, purpose } = req.body;
        const otpService = new OtpService();
        const result = await otpService.sendOtp(email, purpose);

        ResponseHelper.sendSuccessResponse(res, {
            message: "Verification code sent successfully.",
            data: result,
        });
    });

    static validateOtp = ControllerHelper.createHandler("validateOtp", async (req, res, next) => {
        const validation = AuthValidator.validateOtp(req.body);
        if (validation.error) {
            return next(new AppError(validation.error.message, ResponseHelper.BAD_REQUEST));
        }

        const { email, otp, purpose, deviceInfo } = req.body;
        const otpService = new OtpService();
        const result = await otpService.validateOtp(email, otp, purpose, deviceInfo, req.ip);

        ResponseHelper.sendSuccessResponse(res, {
            message: "OTP validated successfully.",
            data: result,
        });
    });
}
