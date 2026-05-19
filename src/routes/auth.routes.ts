import express from "express";
import AuthController from "../controllers/auth.controller";
import AuthMiddleware from "../middlewares/auth";
import { rateLimit } from "express-rate-limit";

const authLimiter = rateLimit({
    windowMs: 1000 * 60 * 60 * 2, 
    limit: 5, 
    message: "Can't signup again now, try later",
});

const AuthRouter = express.Router();

AuthRouter.post("/signup", authLimiter, AuthController.signup);


export default AuthRouter;
