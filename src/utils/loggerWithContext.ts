import { requestContextManager } from "../config/async-context";

export function withContext(meta?: Record<string, any>): Record<string, any> {
    return requestContextManager.enrichWithContext(meta);
}

export function withRequestContext(): Record<string, any> {
    return requestContextManager.getAuditContext();
}

export function withOperationContext(
    operationType: "webhook" | "system" | "admin" | "api" | "cron" | "e2e-webhook-auth",
    meta?: Record<string, any>
): Record<string, any> {
    const asyncContext = requestContextManager.getContext();

    return {
        operationType,
        ...(asyncContext?.reqId && { reqId: asyncContext.reqId }),
        ...(asyncContext?.ip && { sourceIp: asyncContext.ip }),
        ...(asyncContext?.userAgent && { userAgent: asyncContext.userAgent }),
        ...(asyncContext?.path && { path: asyncContext.path }),
        ...(asyncContext?.method && { method: asyncContext.method }),
        ...(meta || {}),
    };
}
