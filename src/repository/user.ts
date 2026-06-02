/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { eq, sql, and, ne, desc, isNull, asc, inArray, notInArray } from "drizzle-orm";
 import { customAlphabet }  from "nanoid";

import { DbClient, getDb } from "../config/db";
import {
    users,
    type User,
    type NewUser,
    Currency,
    Role,
    AvatarHistory,
    AvatarHistoryEntry
} from "../db/schema/users.schema";
import { PersonalInformation } from "../validators/user.validator";
import { kyc_applications, kyc_profiles } from "../db/schema/kyc/kyc.schema";
import { transactions } from "../db/schema/finance/transactions.schema";

export type { User, NewUser, AvatarHistory, AvatarHistoryEntry };

export type PublicUser = Pick<
    User,
    | "id"
    | "email"
    | "username"
    | "firstName"
    | "lastName"
    | "phoneNumber"
    | "country"
    | "referredBy"
    | "isActive"
    | "emailVerified"
    | "emailVerifiedAt"
    | "createdAt"
    | "updatedAt"
    | "isArchived"
    | "avatar"
> & {
    unlockPinSet: boolean;
    transactionPinSet: boolean;
};

export class UserRepository {
    private db = getDb();

    get client() {
        return this.db;
    }

    async archiveDueBatch(batchSize: number): Promise<{ count: number; ids: string[] }> {
        const res = (await this.db.execute(
            sql /* sql */ `
      WITH to_archive AS (
        SELECT id
        FROM "users"
        WHERE
          "is_archived" = false
          AND "delete_effective_at" IS NOT NULL
          AND "delete_effective_at" <= NOW()
        ORDER BY "delete_effective_at" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${batchSize}
      )
      UPDATE "users" u
      SET
        "is_archived"         = true,
        "is_active"           = false,
        "archived_at"         = NOW(),
        "archive_reason"      = COALESCE(u."archive_reason", 'user_requested'),
        "delete_requested_at" = NULL,
        "delete_effective_at" = NULL
      FROM to_archive ta
      WHERE u."id" = ta."id"
      RETURNING u."id"::text AS id;
    `,
        )) as unknown as { rows?: Array<{ id: string }>; rowCount?: number };

        const ids = res.rows?.map((r) => r.id) ?? [];
        const count = (res as any).rowCount ?? ids.length ?? 0;
        return { count, ids };
    }

    async getById(userId: string) {
        const rows = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
        return rows[0];
    }

    async cancelPendingDeletion(userId: string) {
        await this.db
            .update(users)
            .set({
                deleteRequestedAt: null,
                deleteEffectiveAt: null,
                archiveReason: null,
            })
            .where(eq(users.id, userId));
    }

    async setPendingDeletion(userId: string, reason = "user_requested") {
        const now = new Date();
        const effective = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000);
        await this.db
            .update(users)
            .set({
                deleteRequestedAt: now,
                deleteEffectiveAt: effective,
                archiveReason: reason,
            })
            .where(eq(users.id, userId));
    }

    async getMfaByUserId(userId: string) {
        const rows = await this.db
            .select({
                id: users.id,
                mfaEnabled: users.mfaEnabled,
                mfaSecretEnc: users.mfaSecretEnc,
                email: users.email,
                username: users.username,
            })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);
        return rows[0];
    }

    async setMfaSecret(userId: string, secretEnc: string) {
        await this.db.update(users).set({ mfaSecretEnc: secretEnc }).where(eq(users.id, userId));
    }

    async enableMfa(userId: string) {
        await this.db.update(users).set({ mfaEnabled: true }).where(eq(users.id, userId));
    }

    async disableMfa(userId: string) {
        await this.db.update(users).set({ mfaEnabled: false, mfaSecretEnc: null }).where(eq(users.id, userId));
    }

    async findPublicById(id: string): Promise<PublicUser | undefined> {
        const rows = await this.db
            .select({
                id: users.id,
                email: users.email,
                username: users.username,
                firstName: users.firstName,
                lastName: users.lastName,
                phoneNumber: users.phoneNumber,
                country: users.country,
                referredBy: users.referredBy,
                isActive: users.isActive,
                emailVerified: users.emailVerified,
                emailVerifiedAt: users.emailVerifiedAt,
                mfaEnabled: users.mfaEnabled,
                pushNotificationEnabled: users.pushNotificationEnabled,
                emailNotificationEnabled: users.emailNotificationEnabled,
                telegramNotificationEnabled: users.telegramNotificationEnabled,
                biometricEnabled: users.biometricEnabled,
                createdAt: users.createdAt,
                updatedAt: users.updatedAt,
                isArchived: users.isArchived,
                avatar: users.avatar,
                unlockPinSet: sql<boolean>`(${users.unlockPinHash} IS NOT NULL)`,
                transactionPinSet: sql<boolean>`(${users.txnPinHash} IS NOT NULL)`,
            })
            .from(users)
            .where(eq(users.id, id))
            .limit(1);

        return rows[0];
    }

    async findById(id: string, tx?: DbClient): Promise<User | undefined> {
        const db = tx ?? this.db;
        const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
        return rows[0];
    }

    async findByEmail(email: string): Promise<User | undefined> {
        const result = await this.db
            .select()
            .from(users)
            .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
        return result[0];
    }

    async findByUsername(username: string): Promise<User | undefined> {
        const rows = await this.db
            .select()
            .from(users)
            .where(sql`lower(${users.username}) = ${username.toLowerCase()}`)
            .limit(1);
        return rows[0];
    }

    async isUsernameAvailable(username: string, excludeUserId?: string): Promise<boolean> {
        const rows = await this.db
            .select({ id: users.id })
            .from(users)
            .where(
                excludeUserId
                    ? and(sql`lower(${users.username}) = ${username.toLowerCase()}`, ne(users.id, excludeUserId))
                    : sql`lower(${users.username}) = ${username.toLowerCase()}`,
            )
            .limit(1);
        return !rows[0];
    }

    async updateUsername(userId: string, username: string, db: DbClient = this.db): Promise<void> {
        await db.update(users).set({ username }).where(eq(users.id, userId));
    }
    async findByPhoneNumber(phoneNumber: string): Promise<User | undefined> {
        const result = await this.db.select().from(users).where(eq(users.phoneNumber, phoneNumber));
        return result[0];
    }

    async create(userData: NewUser, db: DbClient = this.db): Promise<User> {
        const result = await db.insert(users).values(userData).returning();
        return result[0];
    }

    async incrementFailedAttempts(userId: string): Promise<void> {
        await this.db
            .update(users)
            .set({ failedLoginAttempts: sql`${users.failedLoginAttempts} + 1` })
            .where(eq(users.id, userId));
    }

    async resetFailedAttempts(userId: string): Promise<void> {
        await this.db.update(users).set({ failedLoginAttempts: 0, lockoutUntil: null }).where(eq(users.id, userId));
    }

    async setLockout(userId: string, until: Date): Promise<void> {
        await this.db.update(users).set({ lockoutUntil: until }).where(eq(users.id, userId));
    }

    async updateEmailVerification(userId: string, emailVerified: boolean): Promise<void> {
        await this.db
            .update(users)
            .set({ emailVerified, emailVerifiedAt: emailVerified ? new Date() : null })
            .where(eq(users.id, userId));
    }

    async updatePersonalInformation(userId: string, data: PersonalInformation): Promise<{ updated: boolean }> {
        const result = (await this.db.execute(sql`
            UPDATE "users"
            SET
                "first_name" = ${data.firstName},
                "last_name" = ${data.lastName},
                "phone_number" = ${data.phoneNumber},
                "email" = ${data.email},
                "updated_at" = NOW()
            WHERE "id" = ${userId}
                AND ("first_name" IS NULL OR "first_name" = ${data.firstName})
                AND ("last_name" IS NULL OR "last_name" = ${data.lastName})
            RETURNING "id"
        `)) as unknown as { rowCount?: number };

        return { updated: (result.rowCount ?? 0) > 0 };
    }

    async updateUnlockPin(userId: string, unlockPinHash: string) {
        await this.db.update(users).set({ unlockPinHash }).where(eq(users.id, userId));
    }

    async updateTransactionPin(userId: string, txnPinHash: string) {
        await this.db.update(users).set({ txnPinHash }).where(eq(users.id, userId));
    }

    async updateCurrency(userId: string, currency: Currency): Promise<void> {
        await this.db.update(users).set({ currency }).where(eq(users.id, userId));
    }

    async update(userId: string, data: Partial<User>, db: DbClient = this.db): Promise<void> {
        await db.update(users).set(data).where(eq(users.id, userId));
    }

    async updateAmbassadorStatus(userId: string, isAmbassador: boolean) {
        await this.db.update(users).set({ isAmbassador }).where(eq(users.id, userId));
    }

    async updateAvatar(userId: string, avatar: string, avatarHistory: AvatarHistory, tx?: DbClient) {
        const db = tx ?? this.db;
        return db.update(users).set({ avatar, avatarHistory, updatedAt: new Date() }).where(eq(users.id, userId));
    }

    async setPndStatus(userId: string, isPnd: boolean, reason: string, tx?: DbClient) {
        const db = tx ?? this.db;
        return db.update(users).set({ isPnd, pndReason: reason, updatedAt: new Date() }).where(eq(users.id, userId));
    }

    /**
     * Add an avatar to user's history with FIFO queue logic (max 5 avatars)
     * Returns the removed avatar if capacity was exceeded
     */
    async addAvatarToHistory(
        userId: string,
        avatarUrl: string,
        storageKey: string,
        db: DbClient = this.db,
    ): Promise<{ removedAvatar?: { url: string; key: string } }> {
        const MAX_HISTORY_SIZE = 5;

        return await this.db.transaction(async (tx) => {
            const user = await tx
                .select({ avatarHistory: users.avatarHistory })
                .from(users)
                .where(eq(users.id, userId))
                .for("update")
                .limit(1);

            if (!user[0]) {
                throw new Error("User not found");
            }

            const avatarHistory: AvatarHistory = user[0].avatarHistory || {
                current: null,
                history: [],
            };

            const newEntry: AvatarHistoryEntry = {
                url: avatarUrl,
                uploadedAt: new Date(),
                key: storageKey,
            };

            // FIFO logic: remove oldest if at capacity
            let removedAvatar: { url: string; key: string } | undefined;
            if (avatarHistory.history.length >= MAX_HISTORY_SIZE) {
                const oldest = avatarHistory.history.shift(); // Remove first (oldest)
                if (oldest) {
                    removedAvatar = { url: oldest.url, key: oldest.key };
                }
            }

            // Add new avatar to history
            avatarHistory.history.push(newEntry);
            avatarHistory.current = avatarUrl;

            await tx
                .update(users)
                .set({
                    avatar: avatarUrl,
                    avatarHistory: avatarHistory as any,
                })
                .where(eq(users.id, userId));

            return { removedAvatar };
        });
    }

    async getAvatarHistory(userId: string): Promise<AvatarHistory | null> {
        const user = await this.db
            .select({ avatarHistory: users.avatarHistory })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

        if (!user[0]) {
            return null;
        }

        return user[0].avatarHistory || { current: null, history: [] };
    }

    /**
     * Restore an avatar from user's history to current
     */
    async restoreAvatarFromHistory(userId: string, avatarUrl: string, db: DbClient = this.db): Promise<void> {
        await this.db.transaction(async (tx) => {
            // Get current avatar history with row lock
            const user = await tx
                .select({ avatarHistory: users.avatarHistory })
                .from(users)
                .where(eq(users.id, userId))
                .for("update")
                .limit(1);

            if (!user[0]) {
                throw new Error("User not found");
            }

            const avatarHistory = user[0].avatarHistory;
            if (!avatarHistory || !avatarHistory.history) {
                throw new Error("No avatar history found");
            }

            // Check if avatar exists in history
            const avatarExists = avatarHistory.history.some((entry) => entry.url === avatarUrl);
            if (!avatarExists) {
                throw new Error("Avatar not found in history");
            }

            // Update current avatar (keep it in history)
            avatarHistory.current = avatarUrl;

            await tx
                .update(users)
                .set({
                    avatar: avatarUrl,
                    avatarHistory: avatarHistory as any,
                })
                .where(eq(users.id, userId));
        });
    }

    async resolveUserIdByApplicantId(applicantId: string, db: DbClient = this.db): Promise<string | null> {
        if (!applicantId) return null;

        const apps = await db
            .select({ userId: kyc_applications.userId })
            .from(kyc_applications)
            .where(eq(kyc_applications.applicantId, applicantId))
            .orderBy(desc(kyc_applications.createdAt))
            .limit(1);

        if (apps[0]?.userId) return apps[0].userId;

        const profs = await db
            .select({ userId: kyc_profiles.userId })
            .from(kyc_profiles)
            .where(eq(kyc_profiles.applicantId, applicantId))
            .limit(1);

        return profs[0]?.userId ?? null;
    }

    async getReferralStats(userId: string) {
        const totalReferrals = (await this.db.execute(sql`
            SELECT COUNT(*) as total_referrals
            FROM users 
            WHERE referred_by = ${userId} 
            AND is_active = true
        `)) as unknown as { rows: Array<{ total_referrals: number }> };

        const verifiedReferrals = (await this.db.execute(sql`
            SELECT COUNT(*) as verified_referrals
            FROM users 
            WHERE referred_by = ${userId} 
            AND is_active = true 
            AND email_verified = true
        `)) as unknown as { rows: Array<{ verified_referrals: number }> };

        const recentReferrals = (await this.db.execute(sql`
            SELECT COUNT(*) as recent_referrals
            FROM users 
            WHERE referred_by = ${userId} 
            AND is_active = true
            AND created_at >= NOW() - INTERVAL '30 days'
        `)) as unknown as { rows: Array<{ recent_referrals: number }> };

        return {
            total: Number(totalReferrals.rows?.[0]?.total_referrals || 0),
            verified: Number(verifiedReferrals.rows?.[0]?.verified_referrals || 0),
            recent: Number(recentReferrals.rows?.[0]?.recent_referrals || 0),
        };
    }

    async getReferralBreakdownByCountry(userId: string) {
        const result = (await this.db.execute(sql`
            SELECT 
                country,
                COUNT(*) as count
            FROM users 
            WHERE referred_by = ${userId} 
            AND is_active = true
            AND country IS NOT NULL
            GROUP BY country
            ORDER BY count DESC
            LIMIT 10
        `)) as unknown as { rows: Array<{ country: string; count: number }> };

        return (
            result.rows?.map((row) => ({
                country: row.country,
                count: Number(row.count),
            })) || []
        );
    }

    async getReferralMonthlyTrends(userId: string) {
        const result = (await this.db.execute(sql`
            SELECT 
                DATE_TRUNC('month', created_at) as month,
                COUNT(*) as referrals_count
            FROM users 
            WHERE referred_by = ${userId} 
            AND is_active = true
            AND created_at >= NOW() - INTERVAL '12 months'
            GROUP BY DATE_TRUNC('month', created_at)
            ORDER BY month ASC
        `)) as unknown as { rows: Array<{ month: Date; referrals_count: number }> };

        return (
            result.rows?.map((row) => ({
                month: row.month,
                referralsCount: Number(row.referrals_count),
            })) || []
        );
    }

    async getUserNotificationPreference(userId: string) {
        const result = await this.db
            .select({
                id: users.id,
                pushNotificationEnabled: users.pushNotificationEnabled,
                emailNotificationEnabled: users.emailNotificationEnabled,
            })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);
        return result[0];
    }

    async getUsersNotificationPreference(userIds: string[]) {
        const result = await this.db
            .select({
                id: users.id,
                pushNotificationEnabled: users.pushNotificationEnabled,
                emailNotificationEnabled: users.emailNotificationEnabled,
            })
            .from(users)
            .where(inArray(users.id, userIds));
        return result;
    }

    async updateNotificationPreference(
        userId: string,
        options: { pushNotificationEnabled?: boolean; emailNotificationEnabled?: boolean },
    ) {
        const { pushNotificationEnabled, emailNotificationEnabled } = options;
        await this.db
            .update(users)
            .set({ pushNotificationEnabled, emailNotificationEnabled })
            .where(eq(users.id, userId));
    }

    async updateTelegramSettings(
        userId: string,
        data: { telegramChatId?: string | null; telegramLinkedAt?: Date | null; telegramNotificationEnabled?: boolean },
    ) {
        await this.db.update(users).set(data).where(eq(users.id, userId));
    }

    async findByTelegramChatId(chatId: string) {
        const [user] = await this.db.select().from(users).where(eq(users.telegramChatId, chatId)).limit(1);
        return user || null;
    }

    async getUserStats() {
        const hasTransaction = sql`EXISTS (SELECT 1 FROM ${transactions} WHERE ${transactions.userId} = ${users.id})`;

        const [result] = await this.db
            .select({
                total: sql<number>`count(*)`,
                active: sql<number>`count(*) filter (where ${hasTransaction} AND ${users.isActive} = true)`,
                provisioned: sql<number>`count(*) filter (where NOT ${hasTransaction} AND ${users.isActive} = true)`,
                inactive: sql<number>`count(*) filter (where ${users.isActive} = false)`,
                pnd: sql<number>`count(*) filter (where ${users.isPnd} = true)`,
                archived: sql<number>`count(*) filter (where ${users.isArchived} = true)`,
            })
            .from(users)
            .where(eq(users.role, Role.BASIC_USER));

        return {
            total: Number(result?.total || 0),
            active: Number(result?.active || 0),
            provisioned: Number(result?.provisioned || 0),
            inactive: Number(result?.inactive || 0),
            pnd: Number(result?.pnd || 0),
            archived: Number(result?.archived || 0),
        };
    }
}
