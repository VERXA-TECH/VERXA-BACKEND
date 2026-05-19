import crypto from "node:crypto";

export interface FingerprintPayload {
    ip?: string;
    userAgent?: string;
    deviceUniqueId?: string;
    screen?: { width?: number; height?: number };
    timezone?: string;
}

export default class FingerprintHelper {
    static hash(payload: FingerprintPayload): string {
        const data = JSON.stringify({
            ip: payload.ip || "",
            ua: payload.userAgent || "",
            duid: payload.deviceUniqueId || "",
            screen: payload.screen || {},
            tz: payload.timezone || "",
        });
        return crypto.createHash("sha256").update(data).digest("hex");
    }
}
