/* eslint-disable @typescript-eslint/no-explicit-any */
import { AsyncLocalStorage } from "async_hooks";
import { RequestContext } from "../types/context.types";

class AsyncContext {
    private static instance: AsyncContext;
    private asyncLocalStorage: AsyncLocalStorage<RequestContext>;

    private constructor() {
        this.asyncLocalStorage = new AsyncLocalStorage();
    }

    static getInstance(): AsyncContext {
        if (!AsyncContext.instance) {
            AsyncContext.instance = new AsyncContext();
        }
        return AsyncContext.instance;
    }

    run<T>(context: RequestContext, callback: () => T): T {
        return this.asyncLocalStorage.run(context, callback);
    }

    getContext(): RequestContext | undefined {
        return this.asyncLocalStorage.getStore();
    }

    getReqId(): string | undefined {
        return this.getContext()?.reqId;
    }

    getUserId(): string | undefined {
        return this.getContext()?.userId;
    }

    getUserAgent(): string | undefined {
        return this.getContext()?.userAgent;
    }

    getIp(): string | undefined {
        return this.getContext()?.ip;
    }

    enrichWithContext(data: any = {}): any {
        const context = this.getContext();
        if (!context) return data;

        return {
            ...data,
            reqId: context.reqId,
            userId: context.userId,
            userAgent: context.userAgent,
            ip: context.ip,
            path: context.path,
            startTime: context.startTime
        };
    }
    getAuditContext() {
        const ctx = this.getContext();
        return {
            ip: ctx?.ip || null,
            userAgent: ctx?.userAgent || null,
            requestId: ctx?.reqId || null,
            forwardedFor: ctx?.forwardedFor || null,
            userId: ctx?.userId || null,
            startTime: ctx?.startTime || null
        };
    }
}

export const requestContextManager = AsyncContext.getInstance();
export const getCurrentContext = () => requestContextManager.getContext();
export default requestContextManager;
