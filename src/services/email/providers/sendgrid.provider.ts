/* eslint-disable @typescript-eslint/no-explicit-any */
import sendGridMail from "@sendgrid/mail";
import logger from "../../../config/logger";
import { EmailProvider, IEmailProvider, SendEmailRequest, SendEmailResponse } from "./email-provider.interface";

export class SendGridProvider implements IEmailProvider {
    public readonly name = EmailProvider.SENDGRID;
    private isInitialized = false;

    constructor(private apiKey: string) {
        if (!apiKey || apiKey.trim() === "") {
            logger.warn("SendGrid API key not provided", {
                provider: this.name,
                action: "sendgrid_initialization_failed"
            });
        } else {
            sendGridMail.setApiKey(apiKey);
            this.isInitialized = true;
            logger.info("SendGrid provider initialized", {
                provider: this.name,
                action: "provider_initialized"
            });
        }
    }

    async send(request: SendEmailRequest): Promise<SendEmailResponse> {
        if (!this.isInitialized) {
            return {
                success: false,
                provider: this.name,
                error: new Error("SendGrid provider not initialized - missing API key"),
                errorCode: "NOT_INITIALIZED"
            };
        }

        try {
            const attachments = request.attachments?.map((attachment) => ({
                filename: attachment.filename,
                content: attachment.content.toString("base64"),
                type: attachment.contentType
            }));

            const mailOptions: sendGridMail.MailDataRequired = {
                from: request.fromName ? `"${request.fromName}" <${request.from}>` : request.from,
                to: request.to,
                subject: request.subject,
                html: request.html,
                attachments
            };

            const [response] = await sendGridMail.send(mailOptions);
            const messageId = response.headers["x-message-id"] as string;

            logger.info("Email sent successfully via SendGrid", {
                provider: this.name,
                to: request.to,
                messageId,
                statusCode: response.statusCode,
                action: "email_sent_success"
            });

            return {
                success: true,
                messageId,
                provider: this.name
            };
        } catch (error: any) {
            logger.error("Failed to send email via SendGrid", {
                provider: this.name,
                to: request.to,
                error: error.message,
                code: error.code,
                statusCode: error.response?.statusCode,
                action: "email_send_failed"
            });

            return {
                success: false,
                provider: this.name,
                error: error,
                errorCode: error.code || error.response?.statusCode?.toString()
            };
        }
    }

    async verify(): Promise<boolean> {
        if (!this.isInitialized) {
            logger.warn("SendGrid provider not initialized", {
                provider: this.name,
                action: "verification_skipped"
            });
            return false;
        }
        return this.isInitialized;
    }

    isPermanentError(error: any): boolean {
        const permanentStatusCodes = [400, 401, 403, 404, 413];

        if (error.response?.statusCode) {
            const statusCode = error.response.statusCode;
            return permanentStatusCodes.includes(statusCode);
        }

        const permanentErrorCodes = [
            "UNAUTHORIZED",
            "FORBIDDEN",
            "INVALID_EMAIL",
            "INVALID_CONTENT",
            "NOT_INITIALIZED"
        ];

        return permanentErrorCodes.includes(error.code) || permanentErrorCodes.includes(error.errorCode);
    }
}
