import express from "express";
import OtpController from "../controllers/otp.controller";

const OtpRouter = express.Router();

OtpRouter.post("/send", OtpController.sendOtp);
OtpRouter.post("/validate", OtpController.validateOtp);

export default OtpRouter;
