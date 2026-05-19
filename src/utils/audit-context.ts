/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request } from "express";
import { getCurrentContext } from "../middlewares/async-context";
import { AuditContext } from "../types/audit.types";
import { sanitizeAuditContext } from "./privacy";

export class AuditContextHelper {
    // For webhooks
    static getWebhookContext(eventId: string, userId?: string): AuditContext {
        const context = getCurrentContext();

        const rawContext = {
            userId: userId || "system",
            ipAddress: context?.ip || "fireblocks-webhook",
            userAgent: context?.userAgent || "fireblocks-webhook",
            requestId: context?.reqId || `webhook-${eventId}-${Date.now()}`,
            startTime: (context as any)?.startTime instanceof Date ? (context as any).startTime : new Date(),
        };

        return sanitizeAuditContext(rawContext);
    }

    static getRequestContext(req?: Request, userId?: string): AuditContext {
        const context = getCurrentContext();
        const rawContext = {
            userId: userId || context?.userId || "unknown",
            ipAddress: context?.ip || "unknown",
            userAgent: context?.userAgent || "unknown",
            requestId: context?.reqId || `req-${Date.now()}`,
            startTime: (context as any)?.startTime instanceof Date ? (context as any).startTime : new Date(),
        };

        return sanitizeAuditContext(rawContext);
    }

    static getSystemContext(userId?: string): AuditContext {
        const context = getCurrentContext();

        const rawContext = {
            userId: userId || context?.userId || "system",
            ipAddress: context?.ip || "system",
            userAgent: context?.userAgent || "system",
            requestId: context?.reqId || `system-${Date.now()}`,
            startTime: (context as any)?.startTime instanceof Date ? (context as any).startTime : new Date(),
        };

        return sanitizeAuditContext(rawContext);
    }

    static getCurrentContext(userId?: string): AuditContext {
        const context = getCurrentContext();
        const rawContext = {
            userId: userId || context?.userId || "unknown",
            ipAddress: context?.ip || "unknown",
            userAgent: context?.userAgent || "unknown",
            requestId: context?.reqId || `unknown-${Date.now()}`,
            startTime: (context as any)?.startTime instanceof Date ? (context as any).startTime : new Date(),
        };

        return sanitizeAuditContext(rawContext);
    }
}
