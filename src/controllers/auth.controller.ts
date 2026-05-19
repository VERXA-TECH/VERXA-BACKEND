import logger from "../config/logger";
import AppError from "../utils/appError";

import ControllerHelper from "../utils/helpers/controller.helper";
import ResponseHelper from "../utils/helpers/response.helper";
import AuthValidator from "../validators/auth.validator";

export default class AuthController {
    static signup = ControllerHelper.createHandler("signup", async (req, res, next) => {
        const validation = AuthValidator.signup(req.body);
        if (validation.error) {
            logger.debug(`${req.headers.reqName} request body validation failed [${req.headers.reqId}]`, {
                data: req.body,
            });
            return next(new AppError(validation.error.message, ResponseHelper.BAD_REQUEST));
        }

        ResponseHelper.sendSuccessResponse(res, {
            message: "User signed up successfully",
            data: {},
        });
    });
}
