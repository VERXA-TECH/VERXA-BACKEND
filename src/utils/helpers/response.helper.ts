import { Response } from "express";
import logger from "../../config/logger";

export default class ResponseHelper {
    static OK = 200;
    static RESOURCE_CREATED = 201;
    static ACCEPTED = 202;
    static NO_CONTENT = 204;
    static UNAUTHORIZED = 401;
    static RESOURCE_NOT_FOUND = 404;
    static BAD_REQUEST = 400;
    static FORBIDDEN = 403;
    static INTERNAL_SERVER_ERROR = 500;
    static BAD_GATEWAY = 502;
    static SERVICE_UNAVAILABLE = 503;
    static CONFLICT = 409;
    static TOO_MANY_REQUESTS = 509;

    static sendResponse(
        res: Response,
        {
            message,
            data,
            statusCode,
            meta,
        }: {
            message?: string;
            data?: { [key: string]: any };
            statusCode: number;
            meta?: { [key: string]: any };
        }
    ) {
        const body: { [key: string]: any } = {
            status:
                statusCode <= 199
                    ? "info"
                    : statusCode > 199 && statusCode <= 299
                    ? "success"
                    : statusCode > 299 && statusCode <= 399
                    ? "redirection"
                    : statusCode > 399 && statusCode <= 499
                    ? "fail"
                    : "error",
        };
        if (message) body.message = message;
        if (data) body.data = data;
        if (meta) body.meta = meta;
        const { reqName, reqId } = res.req.headers;
        logger.info(`Responded to ${reqName} request [${reqId}]`, {
            // response: { body },
            code: statusCode,
            body,
        });
        res.status(statusCode).json(body);
    }

    static sendSuccessResponse(
        res: Response,
        {
            message,
            data,
            statusCode,
            meta,
        }: {
            message?: string;
            data?: { [key: string]: any };
            statusCode?: number;
            meta?: { [key: string]: any };
        }
    ) {
        ResponseHelper.sendResponse(res, {
            message,
            data,
            statusCode: statusCode || ResponseHelper.OK,
            meta,
        });
    }
}
