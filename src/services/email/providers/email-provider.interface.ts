/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Email Provider Interface
 *
 * Defines the contract for all email providers in the system.
 * This enables the Strategy pattern for multi-provider email delivery.
 */

export enum EmailProvider {
    SMTP = "smtp",
    RESEND = "resend",
}

export interface EmailAttachment {
    filename: string;
    content: string | Buffer;
    contentType?: string;
}

export interface SendEmailRequest {
    from?: string;
    fromName?: string;
    to: string;
    subject: string;
    html: string;
    attachments?: EmailAttachment[];

    // Resend-native (optional — ignored by non-Resend providers)
    scheduledAt?: string; // ISO-8601 future timestamp for scheduled delivery
    tags?: { name: string; value: string }[];
    listUnsubscribeHeader?: string; // e.g. "<mailto:unsub@jeroidpay.com>, <https://...>"
    testMode?: boolean; // redirect to Resend test sink, no real delivery
}

export type BatchEmailRequest = SendEmailRequest[];

export interface SendEmailResponse {
    success: boolean;
    messageId?: string;
    provider: string;
    from?: string;
    error?: Error;
    errorCode?: string;
}

export interface SendBatchEmailResponse {
    results: SendEmailResponse[];
    successCount: number;
    failureCount: number;
}

export interface IEmailProvider {
    /**
     * Unique identifier for the provider
     */
    readonly name: EmailProvider;

    /**
     * Send a single email through this provider
     */
    send(request: SendEmailRequest): Promise<SendEmailResponse>;

    /**
     * Send multiple emails in a single batch (optional — providers that don't support it
     * will fall back to sequential sends)
     */
    sendBatch?(requests: BatchEmailRequest): Promise<SendBatchEmailResponse>;

    /**
     * Verify the provider connection/configuration
     * @returns Promise resolving to true if provider is ready
     */
    verify(): Promise<boolean>;

    /**
     * Check if an error is permanent (non-retryable)
     * Used by retry logic to determine whether to retry
     * @param error The error to check
     * @returns true if error is permanent and should not be retried
     */
    isPermanentError(error: any): boolean;
}
