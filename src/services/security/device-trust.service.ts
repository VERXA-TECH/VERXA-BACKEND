import crypto from "node:crypto";
import envConfig from "../../config/env";
import { UserDevice, UserDeviceStatus } from "../../db/schema/devices.schema";

export interface DeviceTrustRecord {
    token: string;
    tokenHash: string;
    issuedAt: Date;
    expiresAt: Date;
}

export default class DeviceTrustService {
    hashToken(token: string): string {
        return crypto.createHmac("sha256", envConfig.device.trustTokenSecret).update(token).digest("hex");
    }

    async createTrustRecord(): Promise<DeviceTrustRecord> {
        const token = crypto.randomBytes(32).toString("base64url");
        const issuedAt = new Date();
        const expiresAt = new Date(issuedAt.getTime() + envConfig.device.verificationInterval);

        return {
            token,
            tokenHash: this.hashToken(token),
            issuedAt,
            expiresAt,
        };
    }

    async isTrusted(device: UserDevice | undefined, token?: string): Promise<boolean> {
        if (!device || !token) return false;
        if (device.status !== UserDeviceStatus.ACTIVE || device.revokedAt) return false;
        if (!device.deviceTrustTokenHash || !device.deviceTrustTokenExpiresAt) return false;
        if (device.deviceTrustTokenExpiresAt.getTime() <= Date.now()) return false;

        const incomingHash = this.hashToken(token);
        const incomingBuf = Buffer.from(incomingHash, "hex");
        const storedBuf = Buffer.from(device.deviceTrustTokenHash, "hex");

        if (incomingBuf.length === 0 || incomingBuf.length !== storedBuf.length) return false;

        return crypto.timingSafeEqual(incomingBuf, storedBuf);
    }
}
