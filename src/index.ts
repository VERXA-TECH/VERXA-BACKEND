/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-explicit-any */
process.on("uncaughtException", (e) => {
    console.error("Uncaught:", e);
    process.exit(1);
});
process.on("unhandledRejection", (e) => {
    console.error("Unhandled:", e);
    process.exit(1);
});

import cors from "./utils/cors";
import dotenv from "dotenv";
dotenv.config();

import express, { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from "express";
import expressFileUpload from "express-fileupload";
import helmet from "helmet";
import passport from "passport";
import path from "path";
import "./config/db";
import envConfig from "./config/env";
// import { FirebaseAdmin } from "./config/firebase";
import logger from "./config/logger";
import "./config/oauth";
import { getRedisClient } from "./config/redis";

// Workers / Queues
import "./queues/daily.queue";
import "./queues/email.queue";

import globalErrorHandler from "./controllers/error.controller";
import { initPurgeOldQuotesJob } from "./jobs/purge-old-quotes";
import { initIdempotencyCleanup } from "./jobs/idempotency-cleanup.cron";

import { asyncLocalStorageMiddleware } from "./middlewares/async-context";
import { localizationMiddleware } from "./middlewares/localization";
import { globalRateLimiter } from "./middlewares/rate-limiting";
import SessionMiddleware from "./middlewares/session";
import AppRouter from "./routes/app.routes";
import DevEmailPreviewRouter from "./routes/email-preview.routes";

import { socketService } from "./services/socket.service";

import AppError from "./utils/appError";

process.on("uncaughtException", (e) => {
    console.error("Uncaught:", e);
    process.exit(1);
});
process.on("unhandledRejection", (e) => {
    console.error("Unhandled:", e);
    process.exit(1);
});
const app = express();
app.set("json replacer", (_key: any, value: any) => (typeof value === "bigint" ? value.toString() : value));
app.use(
    express.json({
        verify: (req: any, res, buf) => {
            if (req.originalUrl?.startsWith("/api/v1/webhooks")) {
                req.rawBody = Buffer.from(buf);
            }
        }
    })
);
app.set("trust proxy", envConfig.trustProxy);
app.use(express.urlencoded({ extended: true }));

app.use(asyncLocalStorageMiddleware);
app.use(globalRateLimiter);
app.use(cors);
app.use(helmet());
app.use(expressFileUpload({ createParentPath: true, useTempFiles: true }));
app.use(SessionMiddleware.Session);
app.use(localizationMiddleware);
app.use(passport.initialize());
app.use(passport.session());
app.use(
    "/static",
    express.static(path.join(process.cwd(), "static"), {
        dotfiles: "deny",
        etag: true,
        maxAge: "1d",
        redirect: false,
        lastModified: true,
        setHeaders: (res) => {
            res.setHeader("Cache-Control", "public, max-age=86400, immutable");
        }
    })
);
if (envConfig.env !== "production") {
    app.use("/dev", DevEmailPreviewRouter);
}

(async () => {
    try {
        await getRedisClient();
        // await FirebaseAdmin.initialize();
        initPurgeOldQuotesJob();
        initIdempotencyCleanup();
      
        logger.info("Services initialized successfully");
        //Debugging purposes
        logger.info(`Admin client URL: ${envConfig.adminClientUrl}`);
    } catch (e) {
        logger.error("Failed to initialize services", e);
        process.exit(1);
    }
})();
app.get("/", (_req: ExpressRequest, res: ExpressResponse) => {
    res.status(200).json({
        data: `Boilerplate Application${process.env.NODE_ENV === "production" ? "" : ` - ${process.env.NODE_ENV}`}`
    });
});

try {
    app.use("/api", AppRouter);
} catch (e) {
    console.error("[BOOT] Failed to import AppRouter:", e);
    process.exit(1);
}

app.all("*", (req: ExpressRequest, _res: ExpressResponse, next: NextFunction) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

const port = process.env.PORT || 8000;
const server = app.listen(port, () => {
    logger.info(`Verxa Server running faster than you, on port: ${port}`);
});

try {
    socketService.init(server);
} catch (error) {
    logger.error("Failed to initialize socket service:", { error });
}
