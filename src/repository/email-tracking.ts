import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "../config/db";
import { emailLogs, NewEmailLog } from "../db/schema/email/email-log.schema";
import { emailEvents, NewEmailEvent } from "../db/schema/email/email-events.schema";

export class EmailTrackingRepository {
    private db = getDb();

    get client() {
        return this.db;
    }

    async createEmailLog(data: NewEmailLog) {
        const result = await this.db.insert(emailLogs).values(data).returning();
        return result[0];
    }

    async findByMessageId(messageId: string, withEvents = false) {
        const [log] = await this.db.select().from(emailLogs).where(eq(emailLogs.messageId, messageId)).limit(1);
        if (!log) return null;
        if (withEvents) {
            const events = await this.db.select().from(emailEvents).where(eq(emailEvents.emailLogId, log.id));
            return {
                ...log,
                events,
            };
        }

        return log;
    }

    async findLogsByRecipient(recipient: string, params: { offset: number; limit: number }) {
        const { offset = 0, limit = 10 } = params;

        return this.db
            .select()
            .from(emailLogs)
            .where(eq(emailLogs.to, recipient))
            .orderBy(desc(emailLogs.createdAt))
            .limit(limit)
            .offset(offset);
    }

    async updateEmailLog(messageId: string, data: Partial<NewEmailLog>) {
        const result = await this.db
            .update(emailLogs)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(emailLogs.messageId, messageId))
            .returning();
        return result[0];
    }

    async createEmailEvent(data: NewEmailEvent) {
        const result = await this.db.insert(emailEvents).values(data).returning();
        return result[0];
    }

    async getEmailEvents(emailLogId: string, params: { limit: number; offset: number }) {
        return this.db
            .select()
            .from(emailEvents)
            .where(eq(emailEvents.emailLogId, emailLogId))
            .orderBy(desc(emailEvents.timestamp))
            .limit(params.limit)
            .offset(params.offset);
    }

    async getEmailStats(params: { startDate?: Date; endDate?: Date; recipient?: string }) {
        const { startDate, endDate, recipient } = params;
        const conditions = [];

        if (startDate) {
            conditions.push(gte(emailLogs.sentAt, startDate));
        }
        if (endDate) {
            conditions.push(lte(emailLogs.sentAt, endDate));
        }
        if (recipient) {
            conditions.push(eq(emailLogs.to, recipient));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const [stats] = await this.db
            .select({
                totalSent: sql<number>`COUNT(*)`,
                delivered: sql<number>`COUNT(*) FILTER (WHERE ${emailLogs.status} = 'delivered')`,
                opened: sql<number>`COUNT(*) FILTER (WHERE ${emailLogs.status} = 'opened')`,
                clicked: sql<number>`COUNT(*) FILTER (WHERE ${emailLogs.status} = 'clicked')`,
                bounced: sql<number>`COUNT(*) FILTER (WHERE ${emailLogs.status} = 'bounced')`,
                failed: sql<number>`COUNT(*) FILTER (WHERE ${emailLogs.status} = 'failed')`,
            })
            .from(emailLogs)
            .where(whereClause);

        return stats;
    }
}
