import AppError from "../utils/appError";
import ControllerHelper from "../utils/helpers/controller.helper";
import ResponseHelper from "../utils/helpers/response.helper";
import UserValidator from "../validators/user.validator";
import UserService from "../services/user.service";

export default class UserController {
    static updateBasicProfile = ControllerHelper.createHandler("updateBasicProfile", async (req, res, next) => {
        const validation = UserValidator.basicProfile(req.body);
        if (validation.error) {
            return next(new AppError(validation.error.message, ResponseHelper.BAD_REQUEST));
        }

        const userId = req.userId;
        if (!userId) {
            return next(new AppError("User not authenticated.", ResponseHelper.UNAUTHORIZED));
        }

        const userService = new UserService();
        await userService.updateBasicProfile(userId, req.body);

        ResponseHelper.sendSuccessResponse(res, {
            message: "Basic profile information updated successfully.",
            data: {},
        });
    });

    static createPassword = ControllerHelper.createHandler("createPassword", async (req, res, next) => {
        const validation = UserValidator.createPassword(req.body);
        if (validation.error) {
            return next(new AppError(validation.error.message, ResponseHelper.BAD_REQUEST));
        }

        const userId = req.userId;
        if (!userId) {
            return next(new AppError("User not authenticated.", ResponseHelper.UNAUTHORIZED));
        }

        const { password } = req.body;
        const userService = new UserService();
        await userService.createPassword(userId, password);

        ResponseHelper.sendSuccessResponse(res, {
            message: "Password created successfully.",
            data: {},
        });
    });

    static updatePurposes = ControllerHelper.createHandler("updatePurposes", async (req, res, next) => {
        const validation = UserValidator.updatePurposes(req.body);
        if (validation.error) {
            return next(new AppError(validation.error.message, ResponseHelper.BAD_REQUEST));
        }

        const userId = req.userId;
        if (!userId) {
            return next(new AppError("User not authenticated.", ResponseHelper.UNAUTHORIZED));
        }

        const { purposes } = req.body;
        const userService = new UserService();
        await userService.updatePurposes(userId, purposes);

        ResponseHelper.sendSuccessResponse(res, {
            message: "Purposes updated successfully.",
            data: {},
        });
    });
}
