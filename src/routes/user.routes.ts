import express from "express";
import UserController from "../controllers/user.controller";
import AuthMiddleware from "../middlewares/auth";

const UserRouter = express.Router();

UserRouter.use(AuthMiddleware.protect);

UserRouter.patch("/profile/basic", UserController.updateBasicProfile);
UserRouter.post("/profile/password", UserController.createPassword);
UserRouter.post("/profile/purposes", UserController.updatePurposes);

export default UserRouter;
