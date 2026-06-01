import express from "express";
import { Routes } from "../types/app.types";
import AuthRouter from "./auth.routes";
import UserRouter from "./user.routes";
import OtpRouter from "./otp.routes";

const AppRouter = express.Router();

const appRoutes: Routes = [
    {
        path: "/auth",
        router: AuthRouter,
    },
    {
        path: "/users",
        router: UserRouter,
    },
    {
        path: "/otp",
        router: OtpRouter,
    },
];

appRoutes.forEach((route) => {
    AppRouter.use(route.path, route.router);
});

export default AppRouter;
