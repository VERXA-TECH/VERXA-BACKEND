import { eq, and, gt, or } from "drizzle-orm";
import { getDb, DbClient } from "../config/db";
import {
    verxatags,
    type Verxatag,
    type NewVerxatag,
    VerxatagStatus
} from "../db/schema/verxatag/index.schema";
import { reservedVerxatags } from "../db/schema/verxatag/reserved.schema";
import { verxatagHistory } from "../db/schema/verxatag/history.schema";
import { users } from "../db/schema/users.schema";

export class VerxatagRepository {
    private db = getDb();

    get client() {
        return this.db;
    }

    async findActiveByUsername(username: string) {
        const [row] = await this.db
            .select()
            .from(verxatags)
            .where(and(eq(verxatags.username, username.toLowerCase()), eq(verxatags.status, VerxatagStatus.ACTIVE)))
            .limit(1);
        return row ?? null;
    }

    async create(data: NewVerxatag, db: DbClient = this.db): Promise<Verxatag> {
        const result = await db.insert(verxatags).values(data).returning();
        return result[0];
    }

    async update(id: string, data: Partial<NewVerxatag>, db: DbClient = this.db): Promise<Verxatag> {
        const result = await db.update(verxatags).set(data).where(eq(verxatags.id, id)).returning();
        return result[0];
    }

    async findByUsername(username: string) {
        const [result] = await this.db
            .select({
                verxatag: verxatags,
                user: {
                    firstName: users.firstName,
                    lastName: users.lastName,
                    avatar: users.avatar
                }
            })
            .from(verxatags)
            .innerJoin(users, eq(verxatags.userId, users.id))
            .where(eq(verxatags.username, username.toLowerCase()))
            .limit(1);
        return result;
    }

    async findByUserId(userId: string): Promise<Verxatag | undefined> {
        const result = await this.db.select().from(verxatags).where(eq(verxatags.userId, userId));
        return result[0];
    }

    async findActiveByUserId(userId: string): Promise<Verxatag | undefined> {
        const result = await this.db
            .select()
            .from(verxatags)
            .where(and(eq(verxatags.userId, userId), eq(verxatags.status, VerxatagStatus.ACTIVE)));
        return result[0];
    }

    async isUsernameReserved(username: string): Promise<boolean> {
        const result = await this.db.select().from(reservedVerxatags).where(eq(reservedVerxatags.username, username.toLowerCase()));
        return result.length > 0;
    }

    async addToUsernameHistory(
        verxatagId: string,
        oldUsername: string,
        newUsername: string,
        db: DbClient = this.db
    ): Promise<void> {
        await db.insert(verxatagHistory).values({
            verxatagId,
            oldUsername: oldUsername.toLowerCase(),
            newUsername: newUsername.toLowerCase()
        });
    }

    async findByUsernameWithGracePeriod(username: string, gracePeriodDays: number): Promise<Verxatag | undefined> {
        const gracePeriodDate = new Date();
        gracePeriodDate.setDate(gracePeriodDate.getDate() - gracePeriodDays);

        const result = await this.db
            .select()
            .from(verxatags)
            .where(
                and(
                    eq(verxatags.username, username.toLowerCase()),
                    or(
                        eq(verxatags.status, VerxatagStatus.ACTIVE),
                        and(
                            eq(verxatags.status, VerxatagStatus.INACTIVE),
                            gt(verxatags.updatedAt, gracePeriodDate)
                        )
                    )
                )
            );

        return result[0];
    }

    async runTransaction<T>(transactionFn: (db: any) => Promise<T>): Promise<T> {
        return this.db.transaction(transactionFn);
    }

    async deactivate(id: string): Promise<Verxatag> {
        const result = await this.db
            .update(verxatags)
            .set({ status: VerxatagStatus.INACTIVE, updatedAt: new Date() })
            .where(eq(verxatags.id, id))
            .returning();
        return result[0];
    }

    async findAllByUserId(userId: string): Promise<Verxatag[]> {
        const result = await this.db.select().from(verxatags).where(eq(verxatags.userId, userId));
        return result;
    }

    async isUsernameAvailable(username: string, gracePeriodDays: number): Promise<boolean> {
        const gracePeriodDate = new Date();
        gracePeriodDate.setDate(gracePeriodDate.getDate() - gracePeriodDays);

        const result = await this.db
            .select()
            .from(verxatags)
            .where(
                and(
                    eq(verxatags.username, username.toLowerCase()),
                    or(
                        eq(verxatags.status, VerxatagStatus.ACTIVE),
                        and(
                            eq(verxatags.status, VerxatagStatus.INACTIVE),
                            gt(verxatags.updatedAt, gracePeriodDate)
                        )
                    )
                )
            );

        return result.length === 0;
    }
}
