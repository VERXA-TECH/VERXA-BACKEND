import express from "express";
import VerxatagController from "../controllers/verxatag.controller";
import AuthMiddleware from "../middlewares/auth";

const VerxatagRouter = express.Router();

VerxatagRouter.get("/check", VerxatagController.checkAvailability);
VerxatagRouter.post("/claim", AuthMiddleware.protect, VerxatagController.claim);
VerxatagRouter.post("/update", AuthMiddleware.protect, VerxatagController.update);
VerxatagRouter.get("/:username", VerxatagController.getDetails);

export default VerxatagRouter;
