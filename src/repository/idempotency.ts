import { getDb, type DbClient } from "../config/db";
import { and, eq, lt, or, isNull } from "drizzle-orm";
import { idempotency_keys } from "../db/schema";

export class IdempotencyRepository {
    private db = getDb();

    async acquire(
        scope: string,
        key: string,
        ttlSeconds = 300,
        tx: DbClient = this.db
    ): Promise<{ acquired: boolean; existingResponse: any }> {
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + ttlSeconds);

        const inserted = await tx
            .insert(idempotency_keys)
            .values({ scope, key, response: null, expiresAt })
            .onConflictDoNothing()
            .returning({ key: idempotency_keys.key });

        if (inserted.length > 0) {
            return { acquired: true, existingResponse: null };
        }

        const existing = await tx
            .select()
            .from(idempotency_keys)
            .where(and(eq(idempotency_keys.scope, scope), eq(idempotency_keys.key, key)))
            .limit(1);

        const row = existing[0];
        if (!row) {
            return { acquired: true, existingResponse: null };
        }

        if (row.expiresAt && new Date() > row.expiresAt) {
            await tx
                .delete(idempotency_keys)
                .where(and(eq(idempotency_keys.scope, scope), eq(idempotency_keys.key, key)));
            const reinserted = await tx
                .insert(idempotency_keys)
                .values({ scope, key, response: null, expiresAt })
                .onConflictDoNothing()
                .returning({ key: idempotency_keys.key });
            return { acquired: reinserted.length > 0, existingResponse: null };
        }

        return { acquired: false, existingResponse: row.response };
    }

    async complete(scope: string, key: string, response: any, tx: DbClient = this.db) {
        await tx
            .update(idempotency_keys)
            .set({ response })
            .where(and(eq(idempotency_keys.scope, scope), eq(idempotency_keys.key, key)));
    }

    async getKey(scope: string, key: string) {
        const result = await this.db
            .select()
            .from(idempotency_keys)
            .where(and(eq(idempotency_keys.scope, scope), eq(idempotency_keys.key, key)))
            .limit(1);

        return result[0] || null;
    }

    async setKey(scope: string, key: string, response: any, ttlSeconds = 300) {
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + ttlSeconds);

        await this.db.insert(idempotency_keys).values({ scope, key, response, expiresAt }).onConflictDoNothing();
    }

    async deleteExpiredKeys() {
        const result = await this.db
            .delete(idempotency_keys)
            .where(or(lt(idempotency_keys.expiresAt, new Date()), isNull(idempotency_keys.expiresAt)));

        return result.count;
    }
}
