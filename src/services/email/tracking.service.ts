/* eslint-disable @typescript-eslint/no-explicit-any */
import { EMAIL_STATUSES, EmailLog, EmailStatus } from "../../db/schema";
import { EmailTrackingRepository } from "../../repository/email-tracking";
import { SendGridEvent, SendGridEventPayload } from "../../types/sendgrid";

export class EmailTrackingService {
    private eventTimestampMap: Partial<Record<SendGridEvent, keyof EmailLog>> = {
        delivered: "deliveredAt",
        open: "openedAt",
        click: "firstClickedAt",
        bounce: "bouncedAt",
        deferred: "failedAt",
    };
    private eventStatusMap: Partial<Record<SendGridEvent, EmailStatus>> = {
        delivered: EmailStatus.DELIVERED,
        open: EmailStatus.OPENED,
        click: EmailStatus.CLICKED,
        bounce: EmailStatus.BOUNCED,
        deferred: EmailStatus.FAILED,
    };

    constructor(private trackingRepository: EmailTrackingRepository = new EmailTrackingRepository()) {}

    async logEmailSent(data: {
        messageId: string;
        from: string;
        to: string;
        subject: string;
        html: string;
        context: Record<string, any>;
    }) {
        await this.trackingRepository.createEmailLog({
            messageId: data.messageId,
            from: data.from,
            to: data.to,
            subject: data.subject,
            html: data.html,
            context: data.context,
        });
    }

    async processSendgridEvent(payload: SendGridEventPayload) {
        const emailLog = await this.trackingRepository.findByMessageId(payload.sg_message_id);
        if (!emailLog) {
            return;
        }

        const timestamp = new Date(+payload.timestamp * 1000);
        await this.trackingRepository.createEmailEvent({
            emailLogId: emailLog.id,
            type: payload.event,
            timestamp,
            ipAddress: payload.ip,
            userAgent: payload.useragent,
            clickedUrl: payload.url,
            reason: payload.reason ?? payload.response,
            error: payload.response,
            metadata: payload,
        });

        switch (payload.event) {
            case "delivered":
                await this.handleTrackingEvent(emailLog.messageId, "delivered", timestamp);
                break;
            case "open":
                await this.handleTrackingEvent(emailLog.messageId, "open", timestamp);
                break;
            case "click":
                await this.handleTrackingEvent(emailLog.messageId, "click", timestamp);
                break;
            case "bounce":
            case "dropped":
                await this.handleTrackingEvent(emailLog.messageId, "bounce", timestamp);
                break;
            case "deferred":
                await this.handleTrackingEvent(emailLog.messageId, "deferred", timestamp);
                break;
            case "processed":
                await this.handleTrackingEvent(emailLog.messageId, "processed", timestamp);
                break;
        }
    }

    private canAdvanceStatus(newStatus: EmailStatus, currentStatus: EmailStatus) {
        return EMAIL_STATUSES.indexOf(newStatus) > EMAIL_STATUSES.indexOf(currentStatus);
    }

    async handleTrackingEvent(messageId: string, event: SendGridEvent, timestamp: Date) {
        const timestampField = this.eventTimestampMap[event];
        const status = this.eventStatusMap[event];
        const log = await this.trackingRepository.findByMessageId(messageId);

        if (!log || !status) return;
        if (!this.canAdvanceStatus(status, log.status)) return;
        if (timestampField && log[timestampField]) return;

        const updateData: Record<string, any> = {
            status,
            updatedAt: new Date(),
        };
        if (timestampField) updateData[timestampField] = timestamp;

        await this.trackingRepository.updateEmailLog(messageId, updateData);
    }

    async getEmailLog(messageId: string) {
        const log = await this.trackingRepository.findByMessageId(messageId, true);
        return log;
    }

    async getRecipientEmailHistory(recipient: string, params: { offset: number; limit: number }) {
        const logs = await this.trackingRepository.findLogsByRecipient(recipient, params);
        return logs;
    }

    async getEmailStats(params: { startDate?: Date; endDate?: Date; recipient?: string }) {
        const stats = await this.trackingRepository.getEmailStats(params);

        const totalSent = Number(stats.totalSent) || 0;
        const delivered = Number(stats.delivered) || 0;
        const opened = Number(stats.opened) || 0;
        const clicked = Number(stats.clicked) || 0;

        return {
            totalSent,
            delivered,
            opened,
            clicked,
            bounced: Number(stats.bounced) || 0,
            failed: Number(stats.failed) || 0,
            deliveryRate: totalSent > 0 ? (delivered / totalSent) * 100 : 0,
            openRate: delivered > 0 ? (opened / delivered) * 100 : 0,
            clickRate: opened > 0 ? (clicked / opened) * 100 : 0,
        };
    }
}
