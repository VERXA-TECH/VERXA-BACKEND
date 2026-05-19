/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Email Provider Interface
 *
 * Defines the contract for all email providers in the system.
 * This enables the Strategy pattern for multi-provider email delivery.
 */

export enum EmailProvider {
    SENDGRID = "sendgrid",
    SMTP = "smtp",
    SES = "ses"
}

export interface EmailAttachment {
    filename: string;
    content: string | Buffer;
    contentType?: string;
}

export interface SendEmailRequest {
    from: string;
    fromName?: string;
    to: string;
    subject: string;
    html: string;
    attachments?: EmailAttachment[];
}

export interface SendEmailResponse {
    success: boolean;
    messageId?: string;
    provider: string;
    error?: Error;
    errorCode?: string;
}

export interface IEmailProvider {
    /**
     * Unique identifier for the provider
     */
    readonly name: EmailProvider;

    /**
     * Send an email through this provider
     * @param request Email request details
     * @returns Promise with send result
     */
    send(request: SendEmailRequest): Promise<SendEmailResponse>;

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
