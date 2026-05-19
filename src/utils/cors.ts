import cors, { CorsOptions } from "cors";
import envConfig from "../config/env";
import AppError from "./appError";

const CORS_OPTIONS: CorsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        const allowedOrigins = envConfig.cors.allowedOrigins;

        if (!origin || allowedOrigins.some((allowedOrigin) => origin === allowedOrigin)) {
            callback(null, true);
        } else {
            callback(new AppError("Not allowed by CORS", 403));
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "x-refresh-token", "idempotency-key"]
};

export default cors(CORS_OPTIONS);
