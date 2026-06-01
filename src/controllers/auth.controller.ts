import logger from "../config/logger";
import AppError from "../utils/appError";
import ControllerHelper from "../utils/helpers/controller.helper";
import ResponseHelper from "../utils/helpers/response.helper";
import AuthValidator from "../validators/auth.validator";
import AuthService from "../services/auth.service";

export default class AuthController {
    static signup = ControllerHelper.createHandler("signup", async (req, res, next) => {
        const validation = AuthValidator.signup(req.body);
        if (validation.error) {
            logger.debug(`${req.headers.reqName} request body validation failed`, {
                data: req.body,
            });
            return next(new AppError(validation.error.message, ResponseHelper.BAD_REQUEST));
        }

        const { email, country, deviceInfo } = req.body;
        const authService = new AuthService();
        const result = await authService.signup(email, country, deviceInfo, req.ip || "", req.get("User-Agent") || "");

        ResponseHelper.sendSuccessResponse(res, {
            message: "Signup initiated. Verification code sent to your email.",
            data: result,
        });
    });
}
