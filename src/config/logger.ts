import { createLogger, format, transports } from "winston";
import flatted from "flatted";
import path from "path";
import fs from "fs";
import requestContextManager from "./async-context";

const { combine, splat, timestamp, printf, json, errors } = format;

const logsDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const isProduction = process.env.NODE_ENV === "production";
const isDevelopment = process.env.NODE_ENV === "development";

// use context
const contextFormat = format((info) => {
    const context = requestContextManager.getContext();
    if (context) {
        info.reqId = context.reqId;
        info.userId = context.userId;
        info.userAgent = context.userAgent;
        info.ip = context.ip;
        info.path = context.path;
    }
    return info;
});

const bigIntReplacer = (_key: string, value: any) => (typeof value === "bigint" ? value.toString() : value);

const consoleFormat = printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level.toUpperCase()}]: ${message} `;
    if (metadata && Object.keys(metadata).length > 0) {
        if (level.toUpperCase() === "ERROR") {
            msg += flatted.stringify(metadata, bigIntReplacer);
        } else {
            msg += JSON.stringify(metadata, bigIntReplacer);
        }
    }
    return msg;
});

const productionFormat = combine(
    timestamp(),
    errors({ stack: true }),
    contextFormat(),
    json({ replacer: bigIntReplacer })
);

const developmentFormat = combine(splat(), timestamp(), consoleFormat);

const loggerTransports: any[] = [];

if (isProduction) {
    loggerTransports.push(
        new transports.File({
            filename: path.join(logsDir, "error.log"),
            level: "error",
            maxsize: 5242880,
            maxFiles: 10,
            tailable: true,
            format: productionFormat
        }),
        new transports.File({
            filename: path.join(logsDir, "combined.log"),
            level: "info",
            maxsize: 5242880,
            maxFiles: 5,
            tailable: true,
            format: productionFormat
        }),
        new transports.Console({
            level: "error",
            format: productionFormat
        })
    );
} else {
    loggerTransports.push(
        new transports.Console({
            level: isDevelopment ? "debug" : "info",
            format: developmentFormat
        })
    );
}

const logger = createLogger({
    level: isProduction ? "info" : "debug",
    format: isProduction ? productionFormat : developmentFormat,
    transports: loggerTransports,
    exitOnError: false,
    rejectionHandlers: isProduction
        ? [
            new transports.File({
                filename: path.join(logsDir, "rejections.log"),
                maxsize: 5242880,
                maxFiles: 3
            })
        ]
        : [],
    exceptionHandlers: isProduction
        ? [
            new transports.File({
                filename: path.join(logsDir, "exceptions.log"),
                maxsize: 5242880,
                maxFiles: 3
            })
        ]
        : []
});

if (isProduction) {
    logger.info("Logger initialized for production", {
        level: logger.level,
        transports: logger.transports.length,
        logsDirectory: logsDir
    });
}

export default logger;
