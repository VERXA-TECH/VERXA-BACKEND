import { and, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { DbClient, getDb } from "../config/db";
import { userDevices, type NewUserDevice, type UserDevice, UserDeviceStatus } from "../db/schema/devices.schema";

export class UserDeviceRepository {
    private db = getDb();

    async create(data: NewUserDevice, db: DbClient = this.db): Promise<UserDevice> {
        const res = await db.insert(userDevices).values(data).returning();
        return res[0];
    }

    async findByUserId(userId: string): Promise<UserDevice[]> {
        const res = await this.db.select().from(userDevices).where(eq(userDevices.userId, userId));
        return res;
    }

    async findLatestCountry(userId: string): Promise<string | null> {
        const res = await this.db
            .select({ country: userDevices.country })
            .from(userDevices)
            .where(and(eq(userDevices.userId, userId), isNotNull(userDevices.country)))
            .orderBy(desc(userDevices.lastActiveAt))
            .limit(1);
        return res[0]?.country ?? null;
    }

    async findByDeviceId(deviceId: string, userId: string): Promise<UserDevice | undefined> {
        const res = await this.db
            .select()
            .from(userDevices)
            .where(and(eq(userDevices.deviceId, deviceId), eq(userDevices.userId, userId)))
            .limit(1);
        return res[0];
    }

    async findLatestPendingByUserId(userId: string): Promise<UserDevice | undefined> {
        const res = await this.db
            .select()
            .from(userDevices)
            .where(and(eq(userDevices.userId, userId), eq(userDevices.status, UserDeviceStatus.PENDING)))
            .orderBy(desc(userDevices.createdAt))
            .limit(1);
        return res[0];
    }

    async findById(id: string): Promise<UserDevice | undefined> {
        const res = await this.db.select().from(userDevices).where(eq(userDevices.id, id)).limit(1);
        return res[0];
    }

    async findByRefreshJti(jti: string): Promise<UserDevice | undefined> {
        const res = await this.db.select().from(userDevices).where(eq(userDevices.refreshTokenJti, jti)).limit(1);
        return res[0];
    }

    async findByUserIds(userIds: string[]): Promise<UserDevice[]> {
        const res = await this.db.select().from(userDevices).where(inArray(userDevices.userId, userIds));
        return res;
    }

    async findUsersDeviceToken(
        userIds: string[],
    ): Promise<{ id: string; userId: string; deviceId: string; deviceToken: string | null }[]> {
        const res = await this.db
            .select({
                id: userDevices.id,
                userId: userDevices.userId,
                deviceId: userDevices.deviceId,
                deviceToken: userDevices.deviceToken,
            })
            .from(userDevices)
            .where(inArray(userDevices.userId, userIds));
        return res;
    }

    async recordLoginObservation(
        id: string,
        userId: string,
        country?: string,
        ip?: string,
        db: DbClient = this.db,
    ): Promise<void> {
        const set: Partial<NewUserDevice> = { lastActiveAt: new Date() };
        if (country) {
            set.country = country;
            set.lastCountry = country;
        }
        if (ip) {
            set.ip = ip;
        }

        await db
            .update(userDevices)
            .set(set)
            .where(and(eq(userDevices.id, id), eq(userDevices.userId, userId)));
    }

    async activateTrustedDevice(
        id: string,
        userId: string,
        trustTokenHash: string,
        trustTokenIssuedAt: Date,
        trustTokenExpiresAt: Date,
        country?: string,
        ip?: string,
        db: DbClient = this.db,
    ): Promise<void> {
        const set: Partial<NewUserDevice> = {
            status: UserDeviceStatus.ACTIVE,
            deviceTrustTokenHash: trustTokenHash,
            deviceTrustTokenIssuedAt: trustTokenIssuedAt,
            deviceTrustTokenExpiresAt: trustTokenExpiresAt,
            lastActiveAt: new Date(),
            revokedAt: null,
        };
        if (country) {
            set.country = country;
            set.lastCountry = country;
        }
        if (ip) {
            set.ip = ip;
        }

        const result = await db
            .update(userDevices)
            .set(set)
            .where(and(eq(userDevices.id, id), eq(userDevices.userId, userId)))
            .returning({ id: userDevices.id });

        if (result.length === 0) {
            throw new Error("Device not found or access denied");
        }
    }

    async updateCountry(id: string, userId: string, country: string): Promise<void> {
        await this.db
            .update(userDevices)
            .set({ country, lastCountry: country, lastActiveAt: new Date() })
            .where(and(eq(userDevices.id, id), eq(userDevices.userId, userId)));
    }

    async revokeById(id: string): Promise<void> {
        await this.db
            .update(userDevices)
            .set({
                status: UserDeviceStatus.REVOKED,
                revokedAt: new Date(),
                deviceTrustTokenHash: null,
                deviceTrustTokenIssuedAt: null,
                deviceTrustTokenExpiresAt: null,
            })
            .where(eq(userDevices.id, id));
    }

    async rotateRefreshToken(
        id: string,
        newJti: string,
        newHash: string,
        newExpiry: Date,
        country?: string,
        ip?: string,
        db: DbClient = this.db,
    ): Promise<void> {
        const set: Partial<NewUserDevice> = {
            refreshTokenJti: newJti,
            refreshTokenHash: newHash,
            expiresAt: newExpiry,
            lastActiveAt: new Date(),
        };
        if (country) {
            set.country = country;
            set.lastCountry = country;
        }
        if (ip) {
            set.ip = ip;
        }
        await db.update(userDevices).set(set).where(eq(userDevices.id, id));
    }

    async revokeAllByUserId(userId: string): Promise<void> {
        await this.db
            .update(userDevices)
            .set({
                status: UserDeviceStatus.REVOKED,
                revokedAt: new Date(),
                deviceTrustTokenHash: null,
                deviceTrustTokenIssuedAt: null,
                deviceTrustTokenExpiresAt: null,
            })
            .where(eq(userDevices.userId, userId));
    }

    async updateDeviceToken(id: string, userId: string, deviceToken: string): Promise<void> {
        const result = await this.db
            .update(userDevices)
            .set({ deviceToken, lastActiveAt: new Date() })
            .where(and(eq(userDevices.id, id), eq(userDevices.userId, userId)))
            .returning({ id: userDevices.id });

        if (result.length === 0) {
            throw new Error("Device not found or access denied");
        }
    }

    async clearDeviceTokens(deviceIds: string[], expectedTokens?: string[]): Promise<{ clearedCount: number }> {
        if (deviceIds.length === 0) return { clearedCount: 0 };

        const result =
            expectedTokens && expectedTokens.length > 0
                ? await this.db
                      .update(userDevices)
                      .set({ deviceToken: null })
                      .where(and(inArray(userDevices.id, deviceIds), inArray(userDevices.deviceToken, expectedTokens)))
                      .returning({ id: userDevices.id })
                : await this.db
                      .update(userDevices)
                      .set({ deviceToken: null })
                      .where(inArray(userDevices.id, deviceIds))
                      .returning({ id: userDevices.id });

        return { clearedCount: result.length };
    }

    async clearStaleDeviceTokens(inactiveDays: number = 180): Promise<{ clearedCount: number }> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);

        const result = await this.db
            .update(userDevices)
            .set({ deviceToken: null })
            .where(and(isNotNull(userDevices.deviceToken), lt(userDevices.lastActiveAt, cutoffDate)))
            .returning({ id: userDevices.id });

        return { clearedCount: result.length };
    }
    async countByFingerprintHash(fingerprintHash: string): Promise<number> {
        const [result] = await this.db
            .select({ count: sql<number>`count(distinct ${userDevices.userId})` })
            .from(userDevices)
            .where(eq(userDevices.fingerprintHash, fingerprintHash));
        return Number(result?.count || 0);
    }
}
