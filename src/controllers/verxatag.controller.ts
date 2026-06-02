import AppError from "../utils/appError";
import ControllerHelper from "../utils/helpers/controller.helper";
import ResponseHelper from "../utils/helpers/response.helper";
import VerxatagValidator from "../validators/verxatag.validator";
import VerxatagService from "../services/verxatag.service";

export default class VerxatagController {
    static checkAvailability = ControllerHelper.createHandler("checkAvailability", async (req, res, next) => {
        const validation = VerxatagValidator.checkAvailability(req.query);
        if (validation.error) {
            return next(new AppError(validation.error.message, ResponseHelper.BAD_REQUEST));
        }

        const { username } = req.query as { username: string };
        const userId = req.userId; // optional, check if passed from token

        const verxatagService = new VerxatagService();
        const result = await verxatagService.checkUsernameAvailability(username, userId);

        ResponseHelper.sendSuccessResponse(res, {
            message: "Username availability checked.",
            data: result
        });
    });

    static claim = ControllerHelper.createHandler("claim", async (req, res, next) => {
        const validation = VerxatagValidator.claim(req.body);
        if (validation.error) {
            return next(new AppError(validation.error.message, ResponseHelper.BAD_REQUEST));
        }

        const { username } = req.body;
        const userId = req.userId;
        if (!userId) {
            return next(new AppError("User not authenticated.", ResponseHelper.UNAUTHORIZED));
        }

        const verxatagService = new VerxatagService();
        const result = await verxatagService.claimVerxatag(userId, username);

        ResponseHelper.sendSuccessResponse(res, {
            message: "Verxatag claimed successfully.",
            data: result
        });
    });

    static update = ControllerHelper.createHandler("update", async (req, res, next) => {
        const validation = VerxatagValidator.update(req.body);
        if (validation.error) {
            return next(new AppError(validation.error.message, ResponseHelper.BAD_REQUEST));
        }

        const { username, transactionPin } = req.body;
        const userId = req.userId;
        if (!userId) {
            return next(new AppError("User not authenticated.", ResponseHelper.UNAUTHORIZED));
        }

        const verxatagService = new VerxatagService();
        const result = await verxatagService.updateVerxatag(userId, username, transactionPin);

        ResponseHelper.sendSuccessResponse(res, {
            message: "Verxatag updated successfully.",
            data: result
        });
    });

    static getDetails = ControllerHelper.createHandler("getDetails", async (req, res, next) => {
        const { username } = req.params;
        if (!username) {
            return next(new AppError("Username parameter is required.", ResponseHelper.BAD_REQUEST));
        }

        const verxatagService = new VerxatagService();
        const result = await verxatagService.getVerxatag(username);

        ResponseHelper.sendSuccessResponse(res, {
            message: "Verxatag details retrieved successfully.",
            data: result
        });
    });
}
