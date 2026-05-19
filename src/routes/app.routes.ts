import express from "express";
import { Routes } from "../types/app.types";
import AuthRouter from "./auth.routes";

const AppRouter = express.Router();

const appRoutes: Routes = [
    {
        path: "/auth",
        router: AuthRouter,
    },
];

appRoutes.forEach((route) => {
    AppRouter.use(route.path, route.router);
});

export default AppRouter;
