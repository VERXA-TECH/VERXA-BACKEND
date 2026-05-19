import { AuditLogsRepository } from "../../repository/admin/audit-logs.repository";
import { Role, User } from "../../db/schema/users.schema";
import { AuditLogStatus } from "../../db/schema";
import { RateLimiterRedis } from "rate-limiter-flexible";
import { getRedisClient } from "../../config/redis";
import AppError from "../appError";
import ResponseHelper from "./response.helper";

export class ApprovalQueuedError extends Error {
    constructor(message: string = "Action queued for Superadmin approval") {
        super(message);
        this.name = "ApprovalQueuedError";
    }
}

const auditRepo = new AuditLogsRepository();

let approvalLimiter: RateLimiterRedis | null = null;
const getApprovalLimiter = async () => {
    if (!approvalLimiter) {
        const client = await getRedisClient();
        approvalLimiter = new RateLimiterRedis({
            storeClient: client,
            keyPrefix: "rl:admin:approval",
            points: 1, // 1 request
            duration: 60 // per 60 seconds
        });
    }
    return approvalLimiter;
};

export const checkApproval = async (
    user: User,
    context: {
        action: string;
        resource: string;
        payload: unknown;
        endpoint: string;
        method: string;
        resourceId?: string;
        ip?: string;
    }
) => {
    if (user?.role === Role.SUPER_ADMIN) {
        return;
    }

    try {
        const limiter = await getApprovalLimiter();
        await limiter.consume(`${user.id}:${context.action}`);
    } catch (err: any) {
        if (err !== undefined && err !== null && typeof err.msBeforeNext === "number") {
            const retrySecs = Math.ceil(err.msBeforeNext / 1000);
            throw new AppError(
                `Too many requests for this action. Please wait ${retrySecs} seconds before trying again.`,
                ResponseHelper.TOO_MANY_REQUESTS
            );
        }
        throw err;
    }

    await auditRepo.create({
        adminId: user.id,
        adminRole: user.adminRoleId || user.role,
        action: context.action,
        resource: context.resource,
        resourceId: context.resourceId,
        endpoint: context.endpoint,
        method: context.method,
        payload: context.payload,
        status: AuditLogStatus.PENDING,
        ip: context.ip
    });

    throw new ApprovalQueuedError();
};
