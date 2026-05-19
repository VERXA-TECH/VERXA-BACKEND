export interface RequestContext {
    reqId: string;
    userId?: string;
    userAgent?: string;
    ip?: string;
    path?: string;
    method?: string;
    forwardedFor?: string;
    startTime?: Date;
}
