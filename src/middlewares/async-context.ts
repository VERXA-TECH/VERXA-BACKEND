import { Request, Response, NextFunction } from "express";
import { requestContextManager } from "../config/async-context";
import logger from "../config/logger";
import DataHelpers from "../utils/helpers/data.helpers";

export const asyncLocalStorageMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const reqId = (req.headers["x-request-id"] as string) || DataHelpers.generateReqId();

    const fwd = req.headers["x-forwarded-for"];
    const forwardedFor = Array.isArray(fwd) ? fwd.join(",") : fwd;
    const first = Array.isArray(fwd) ? fwd[0] : fwd;
    const base = first ?? req.ip ?? "";
    const clientIp = base.split(",")[0].trim();

    const context = {
        reqId: reqId,
        userId: undefined,
        userAgent: req.headers["user-agent"],
        ip: clientIp,
        path: req.path,
        method: req.method,
        forwardedFor: forwardedFor
    };

    res.setHeader("X-Request-ID", reqId);
    (req as any).id = reqId;
    (req as any).reqId = reqId;
    req.headers.reqId = reqId;
    (req as any).clientIp = clientIp;

    logger.debug("Request Started", {
        reqId: reqId,
        method: req.method,
        path: req.path,
        ip: clientIp,
        userAgent: req.headers["user-agent"],
        action: "request_started"
    });

    requestContextManager.run(context, () => {
        res.on("finish", () => {
            const updatedContext = requestContextManager.getContext();
            logger.debug("Request Finished", {
                reqId: reqId,
                method: req.method,
                path: req.path,
                userId: updatedContext?.userId,
                ip: clientIp,
                statusCode: res.statusCode,
                userAgent: req.headers["user-agent"],
                action: "request_finished"
            });
        });
        next();
    });
};

export const getCurrentContext = () => requestContextManager.getContext();
