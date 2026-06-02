import express from "express";
import AuthController from "../controllers/auth.controller";
import { signupRateLimiter } from "../middlewares/rate-limiting";

const AuthRouter = express.Router();

AuthRouter.post("/signup", AuthController.signup);

export default AuthRouter;
