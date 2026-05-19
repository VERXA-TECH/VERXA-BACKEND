import { RequestHandler } from "express";
import logger from "../../config/logger";

export default class ControllerHelper {
    static createHandler(reqName: string, fn: RequestHandler): RequestHandler {
        return async (req, res, next) => {
            try {
                const data: { [key: string]: any } = {
                    id: req.headers.reqId
                };
                if (req.body) data.body = { ...req.body };
                // if (req.params) data.params = { ...req.params };
                // if (req.query) data.query = { ...req.query };
                logger.info(`New ${reqName} request [${req.headers.reqId}]`, data);
                req.headers.reqName = reqName;
                res.req.headers.reqName = reqName;
                await Promise.resolve(fn(req, res, next));
            } catch (error) {
                next(error);
            }
        };
    }
}
