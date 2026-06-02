import express from "express";
import UserController from "../controllers/user.controller";
import AuthMiddleware from "../middlewares/auth";
import {
    profileUpdateRateLimiter,
    profilePasswordRateLimiter,
    profilePurposesRateLimiter,
} from "../middlewares/rate-limiting";

const UserRouter = express.Router();

UserRouter.use(AuthMiddleware.protect);

UserRouter.patch("/profile/basic", profileUpdateRateLimiter, UserController.updateBasicProfile);
UserRouter.post("/profile/password", profilePasswordRateLimiter, UserController.createPassword);
UserRouter.post("/profile/purposes", profilePurposesRateLimiter, UserController.updatePurposes);

export default UserRouter;
