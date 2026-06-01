import { eq, inArray, lt } from "drizzle-orm";
import { DbClient, getDb } from "../config/db";
import {
    deviceTrustTokenHistory,
    type NewDeviceTrustTokenHistory,
    type DeviceTrustTokenHistory,
} from "../db/schema/device-trust-token-history.schema";

export class DeviceTrustTokenHistoryRepository {
    private db = getDb();

    async add(data: NewDeviceTrustTokenHistory, db: DbClient = this.db): Promise<void> {
        await db.insert(deviceTrustTokenHistory).values(data);
    }

    async findByHash(tokenHash: string, db: DbClient = this.db): Promise<DeviceTrustTokenHistory | undefined> {
        const res = await db
            .select()
            .from(deviceTrustTokenHistory)
            .where(eq(deviceTrustTokenHistory.tokenHash, tokenHash))
            .limit(1);
        return res[0];
    }

    async deleteExpiredBatch(limit = 10_000, graceHours = 24, db: DbClient = this.db): Promise<number> {
        const cutoff = new Date(Date.now() - graceHours * 3_600_000);
        const res = await db
            .delete(deviceTrustTokenHistory)
            .where(
                inArray(
                    deviceTrustTokenHistory.id,
                    db
                        .select({ id: deviceTrustTokenHistory.id })
                        .from(deviceTrustTokenHistory)
                        .where(lt(deviceTrustTokenHistory.expiresAt, cutoff))
                        .orderBy(deviceTrustTokenHistory.expiresAt)
                        .limit(limit),
                ),
            )
            .returning({ id: deviceTrustTokenHistory.id });
        return res.length;
    }
}
