/* eslint-disable @typescript-eslint/no-explicit-any */
import nodemailer from "nodemailer";
import logger from "../../../config/logger";
import { EmailProvider, IEmailProvider, SendEmailRequest, SendEmailResponse } from "./email-provider.interface";

export class SmtpProvider implements IEmailProvider {
    public readonly name = EmailProvider.SMTP;
    private transporter: nodemailer.Transporter;
    private isVerified = false;

    constructor(
        private config: {
            host: string;
            port: number;
            secure: boolean;
            user: string;
            password: string;
        }
    ) {
        if (
            !config.host ||
            !config.user ||
            !config.password ||
            config.host.trim() === "" ||
            config.user.trim() === "" ||
            config.password.trim() === ""
        ) {
            logger.warn("SMTP configuration incomplete", {
                provider: this.name,
                host: config.host,
                user: config.user,
                hasPassword: !!config.password,
                action: "smtp_initialization_warning"
            });
        }

        this.transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: {
                user: config.user,
                pass: config.password
            },
            pool: true,
            maxConnections: 5,
            maxMessages: 100,
            rateDelta: 1000,
            rateLimit: 10
        });

        logger.info("SMTP provider initialized", {
            provider: this.name,
            host: config.host,
            port: config.port,
            secure: config.secure,
            user: config.user,
            action: "provider_initialized"
        });
    }

    async send(request: SendEmailRequest): Promise<SendEmailResponse> {
        try {
            const mailOptions = {
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

            logger.info("Email sent successfully via SMTP", {
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
            logger.error("Failed to send email via SMTP", {
                provider: this.name,
                to: request.to,
                error: error.message,
                code: error.code,
                command: error.command,
                responseCode: error.responseCode,
                action: "email_send_failed"
            });

            return {
                success: false,
                provider: this.name,
                error: error,
                errorCode: error.code || error.responseCode?.toString()
            };
        }
    }

    async verify(): Promise<boolean> {
        if (this.isVerified) {
            return true;
        }

        try {
            await this.transporter.verify();
            this.isVerified = true;
            logger.info("SMTP connection verified successfully", {
                provider: this.name,
                host: this.config.host,
                action: "smtp_verification_success"
            });
            return true;
        } catch (error: any) {
            logger.error("SMTP connection verification failed", {
                provider: this.name,
                host: this.config.host,
                error: error.message,
                code: error.code,
                action: "smtp_verification_failed"
            });
            return false;
        }
    }

    isPermanentError(error: any): boolean {
        const permanentCodes = ["EAUTH", "EENVELOPE", "EMESSAGE"];

        const permanentResponseCodes = [501, 502, 503, 504, 550, 551, 552, 553, 554];

        if (permanentCodes.includes(error.code)) {
            return true;
        }

        if (error.responseCode && permanentResponseCodes.includes(error.responseCode)) {
            return true;
        }

        // 4xx errors are generally temporary (except authentication)
        // 5xx errors are generally permanent
        if (error.responseCode >= 500 && error.responseCode < 600) {
            return true;
        }

        return false;
    }

    async close(): Promise<void> {
        if (this.transporter) {
            this.transporter.close();
            logger.info("SMTP connection pool closed", {
                provider: this.name,
                action: "smtp_connection_closed"
            });
        }
    }
}
