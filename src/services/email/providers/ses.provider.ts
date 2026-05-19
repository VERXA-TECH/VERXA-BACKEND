/* eslint-disable @typescript-eslint/no-explicit-any */
import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import nodemailer from "nodemailer";
import logger from "../../../config/logger";
import { EmailProvider, IEmailProvider, SendEmailRequest, SendEmailResponse } from "./email-provider.interface";

export class SesProvider implements IEmailProvider {
    public readonly name = EmailProvider.SES;
    private sesClient: SESClient | null = null;
    private transporter: nodemailer.Transporter | null = null;
    private isInitialized = false;

    constructor(
        private config: {
            region: string;
            profile?: string;
            configurationSet?: string;
        }
    ) {
        if (!config.region || config.region.trim() === "") {
            logger.warn("AWS SES configuration incomplete", {
                provider: this.name,
                region: config.region,
                action: "ses_initialization_warning"
            });
            return;
        }

        try {
            const clientConfig: any = {
                apiVersion: "2010-12-01",
                region: config.region,
                credentials: defaultProvider({
                    profile: config.profile || undefined
                })
            };

            this.sesClient = new SESClient(clientConfig);

            this.transporter = nodemailer.createTransport({
                SES: { ses: this.sesClient, aws: { SendRawEmailCommand } }
            } as any);

            this.isInitialized = true;

            logger.info("AWS SES provider initialized", {
                provider: this.name,
                region: config.region,
                configurationSet: config.configurationSet,
                action: "provider_initialized"
            });
        } catch (error: any) {
            logger.error("Failed to initialize AWS SES provider", {
                provider: this.name,
                error: error.message,
                action: "ses_initialization_failed"
            });
        }
    }

    async send(request: SendEmailRequest): Promise<SendEmailResponse> {
        if (!this.isInitialized || !this.transporter) {
            return {
                success: false,
                provider: this.name,
                error: new Error("SES provider not initialized - check configuration"),
                errorCode: "NOT_INITIALIZED"
            };
        }

        try {
            const mailOptions: any = {
                from: request.fromName ? `"${request.fromName}" <${request.from}>` : request.from,
                to: request.to,
                subject: request.subject,
                html: request.html,
                attachments: request.attachments?.map((attachment) => ({
                    filename: attachment.filename,
                    content: attachment.content,
                    contentType: attachment.contentType
                }))
            };

            const info = await this.transporter.sendMail(mailOptions);

            logger.info("Email sent successfully via AWS SES", {
                provider: this.name,
                to: request.to,
                messageId: info.messageId,
                response: info.response,
                action: "email_sent_success"
            });

            return {
                success: true,
                messageId: info.messageId,
                provider: this.name
            };
        } catch (error: any) {
            logger.error("Failed to send email via AWS SES", {
                provider: this.name,
                to: request.to,
                error: error.message,
                code: error.code,
                name: error.name,
                statusCode: error.$metadata?.httpStatusCode,
                action: "email_send_failed"
            });

            return {
                success: false,
                provider: this.name,
                error: error,
                errorCode: error.code || error.name
            };
        }
    }

    async verify(): Promise<boolean> {
        if (!this.isInitialized || !this.transporter) {
            logger.warn("SES provider not initialized", {
                provider: this.name,
                action: "verification_skipped"
            });
            return false;
        }

        try {
            // Test the transporter
            await this.transporter.verify();
            logger.info("SES connection verified successfully", {
                provider: this.name,
                region: this.config.region,
                action: "ses_verification_success"
            });
            return true;
        } catch (error: any) {
            logger.error("SES connection verification failed", {
                provider: this.name,
                error: error.message,
                code: error.code,
                action: "ses_verification_failed"
            });
            return false;
        }
    }

    isPermanentError(error: any): boolean {
        // AWS SES permanent error codes
        const permanentErrorCodes = [
            "MessageRejected",
            "MailFromDomainNotVerified",
            "ConfigurationSetDoesNotExist",
            "InvalidParameterValue",
            "ValidationError",
            "AccountSendingPausedException",
            "NOT_INITIALIZED"
        ];

        // Check AWS SDK error codes
        if (error.code && permanentErrorCodes.includes(error.code)) {
            return true;
        }

        if (error.name && permanentErrorCodes.includes(error.name)) {
            return true;
        }

        if (error.$metadata?.httpStatusCode) {
            const statusCode = error.$metadata.httpStatusCode;
            // 4xx errors are generally permanent (client errors)
            if (statusCode >= 400 && statusCode < 500) {
                return true;
            }
        }

        return false;
    }

    async close(): Promise<void> {
        if (this.sesClient) {
            this.sesClient.destroy();
            logger.info("AWS SES client closed", {
                provider: this.name,
                action: "ses_client_closed"
            });
        }
    }
}
