import express from "express";
import VerxatagController from "../controllers/verxatag.controller";
import AuthMiddleware from "../middlewares/auth";

const VerxatagRouter = express.Router();

VerxatagRouter.get("/check",AuthMiddleware.protect, VerxatagController.checkAvailability);
VerxatagRouter.post("/claim", AuthMiddleware.protect, VerxatagController.claim);
// VerxatagRouter.post("/update", AuthMiddleware.protect, VerxatagController.update);
VerxatagRouter.get("/:username",AuthMiddleware.protect, VerxatagController.getDetails);

export default VerxatagRouter;
