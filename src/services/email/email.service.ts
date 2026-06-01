/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import handlebars from "handlebars";
import fs from "fs/promises";
import path from "path";
import juice from "juice";
import logger from "../../config/logger";
import envConfig from "../../config/env";
import retry from "async-retry";
import { EmailTrackingService } from "./tracking.service";
import { OTP_CONFIG } from "../../utils/constants/otp";
import { EmailProviderFactory } from "./providers/email-provider.factory";
import { SendEmailRequest } from "./providers/email-provider.interface";
import { KycTier } from "../../db/schema";

export interface EmailOptions {
    to: string;
    subject: string;
    template: string;
    context: Record<string, any>;
    attachments?: Array<{
        filename: string;
        content: string | Buffer;
        contentType?: string;
    }>;
}

export type RenderOptions = {
    inlineCss?: boolean;
    absoluteAssetUrls?: boolean;
    baseUrl?: string;
};

export interface AlertDetails {
    attemptCount: number;
    lastAttemptTime: string;
    ipAddress?: string;
    deviceName?: string;
    location?: string;
}

export interface EmailTemplate {
    subject: string;
    html: string;
}

export class EmailService {
    private templateCache: Map<string, handlebars.TemplateDelegate> = new Map();
    private readonly templatesDir = path.join(process.cwd(), "static", "emails");
    private readonly maxCacheSize = 50;
    private providerFactory: EmailProviderFactory;

    constructor(private trackingService: EmailTrackingService = new EmailTrackingService()) {
        this.providerFactory = new EmailProviderFactory();

        logger.info("EmailService initialized", {
            action: "email_service_initialized"
        });

        // Verify providers in background (don't block initialization)
        void this.verifyProvidersAsync();
    }

    /**
     * Verify all providers asynchronously (non-blocking)
     */
    private async verifyProvidersAsync(): Promise<void> {
        try {
            const results = await this.providerFactory.verifyAll();
            logger.info("Email provider verification results", {
                results: Object.fromEntries(results),
                action: "email_providers_verified"
            });
        } catch (error) {
            logger.error("Email provider verification failed:", {
                error: error instanceof Error ? error.message : "Unknown error",
                stack: error instanceof Error ? error.stack : undefined,
                action: "email_provider_verification_failed"
            });
        }
    }

    /**
     * Get provider health status (useful for monitoring/debugging)
     */
    getProviderHealth() {
        return this.providerFactory.getProviderHealth();
    }

    private toAbsoluteAssetUrls(html: string, baseUrl?: string): string {
        const base = (baseUrl ?? envConfig.baseUrl)?.replace(/\/$/, "") || "";
        // Replace src="/static/..." and url(/static/...)
        const srcRe = /src=("|')\s*(\/static\/[^"]+?)(\1)/g;
        const urlRe = /url\(("|')?\s*(\/static\/[^)"']+)(\1)?\)/g;
        return html
            .replace(srcRe, (_m, q, p, q2) => `src=${q}${base}${p}${q2}`)
            .replace(urlRe, (_m, q, p, q2) => `url(${q || ""}${base}${p}${q2 || ""})`);
    }

    async renderTemplate(
        templateName: string,
        context: Record<string, any>,
        options: RenderOptions = {}
    ): Promise<string> {
        const { inlineCss = true, absoluteAssetUrls = true, baseUrl } = options;

        try {
            let compiled = this.templateCache.get(templateName);
            if (!compiled) {
                const templatePath = path.join(this.templatesDir, `${templateName}.hbs`);

                try {
                    await fs.access(templatePath);
                } catch (error) {
                    throw new Error(`Template '${templateName}' not found ${templatePath}`);
                }

                const content = await fs.readFile(templatePath, "utf-8");
                compiled = handlebars.compile(content, { strict: true, noEscape: false });

                if (this.templateCache.size >= this.maxCacheSize) {
                    const firstKey = this.templateCache.keys().next().value;
                    if (firstKey) {
                        this.templateCache.delete(firstKey);
                    }
                }

                this.templateCache.set(templateName, compiled);
            }

            let html = compiled(context);

            if (absoluteAssetUrls) {
                html = this.toAbsoluteAssetUrls(html, baseUrl);
            }

            if (inlineCss) {
                html = await new Promise<string>((resolve, reject) => {
                    juice.juiceResources(
                        html,
                        { webResources: { relativeTo: this.templatesDir } },
                        (err: Error | null, inlined: string) => {
                            if (err) return reject(err);
                            resolve(inlined);
                        }
                    );
                });
            }

            return html;
        } catch (err) {
            logger.error(`Failed to render template - ${templateName}`, err);
            throw err;
        }
    }

    async sendEmail(options: EmailOptions): Promise<boolean> {
        try {
            // E2E test mode: return mock success to prevent actual email sending
            if (process.env.E2E_TEST === "true" && process.env.NODE_ENV === "test") {
                logger.info("[email:mock] sendEmail", {
                    to: options.to,
                    subject: options.subject,
                    template: options.template,
                    context: options.context
                });
                return true;
            }

            const html = await this.renderTemplate(options.template, options.context, {
                inlineCss: true,
                absoluteAssetUrls: true
            });

            const emailRequest: SendEmailRequest = {
                from: envConfig.email.from,
                fromName: envConfig.email.fromName,
                to: options.to,
                subject: options.subject,
                html,
                attachments: options.attachments
            };

            // Use async-retry with provider fallback for maximum reliability
            const response = await retry(
                async (bail: (error: Error) => void, attempt: number) => {
                    try {
                        logger.info(`Attempting to send email (attempt ${attempt})`, {
                            to: options.to,
                            subject: options.subject,
                            attempt,
                            action: "email_send_attempt"
                        });

                        // Provider factory handles fallback internally
                        const result = await this.providerFactory.sendWithFallback(emailRequest);

                        if (result.success) {
                            logger.info(`Email sent successfully to ${options.to}`, {
                                provider: result.provider,
                                messageId: result.messageId,
                                attempt,
                                action: "email_sent_success"
                            });
                            return result;
                        }

                        // If provider says it's a permanent error, bail (don't retry)
                        if (result.errorCode === "NO_PROVIDERS" || result.errorCode === "ALL_PROVIDERS_FAILED") {
                            const error = result.error || new Error("Email sending failed");
                            logger.error(`Permanent error sending email to ${options.to}:`, {
                                errorCode: result.errorCode,
                                provider: result.provider,
                                error: error.message,
                                action: "email_send_permanent_error"
                            });
                            bail(error);
                            return;
                        }

                        // Transient error from provider - retry
                        logger.warn(`Transient error sending email to ${options.to} (attempt ${attempt}):`, {
                            provider: result.provider,
                            errorCode: result.errorCode,
                            error: result.error?.message,
                            action: "email_send_transient_error"
                        });
                        throw result.error || new Error("Email sending failed");
                    } catch (error) {
                        // Unexpected error during send
                        logger.error(`Unexpected error sending email (attempt ${attempt}):`, {
                            to: options.to,
                            error: error instanceof Error ? error.message : String(error),
                            action: "email_send_unexpected_error"
                        });
                        throw error;
                    }
                },
                {
                    retries: 3,
                    factor: 2,
                    minTimeout: 1000,
                    maxTimeout: 5000,
                    randomize: true
                }
            );

            // Track sent email
            if (response?.messageId) {
                await this.trackingService.logEmailSent({
                    messageId: response.messageId,
                    from: `"${envConfig.email.fromName}" <${envConfig.email.from}>`,
                    to: options.to,
                    subject: options.subject,
                    html,
                    context: options.context
                });
            }

            return true;
        } catch (error) {
            logger.error(`Failed to send email to ${options.to} after all retries:`, {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                action: "email_send_final_failure"
            });
            return false;
        }
    }

    async sendOtpEmail(to: string, otp: string, userName?: string): Promise<boolean> {
        return this.sendEmail({
            to,
            subject: "Your Verification Code - Verxa",
            template: "otp-email",
            context: {
                otp,
                userName: userName || "User",
                expiryMinutes: OTP_CONFIG.EXPIRY_SECONDS / 60,
                supportEmail: envConfig.email.supportEmail
            }
        });
    }

    async sendLoginVerificationEmail(to: string, otp: string, userName?: string): Promise<boolean> {
        return this.sendEmail({
            to,
            subject: "Login Verification Code - Verxa",
            template: "login-verification",
            context: {
                otp,
                userName: userName || "User",
                expiryMinutes: OTP_CONFIG.EXPIRY_SECONDS / 60,
                supportEmail: envConfig.email.supportEmail
            }
        });
    }

    async sendForgotPasswordEmail(to: string, otp: string, userName?: string): Promise<boolean> {
        return this.sendEmail({
            to,
            subject: "Reset Your Password - Verxa",
            template: "forgot-password",
            context: {
                otp,
                userName: userName || "User",
                expiryHours: 24,
                supportEmail: envConfig.email.supportEmail
            }
        });
    }

    async sendUpdateUserProfileEmail(to: string, otp: string, userName?: string): Promise<boolean> {
        return this.sendEmail({
            to,
            subject: "Profile Update Verification Code - Verxa",
            template: "update-user-profile",
            context: {
                otp,
                userName: userName || "User",
                expiryMinutes: OTP_CONFIG.EXPIRY_SECONDS / 60,
                supportEmail: envConfig.email.supportEmail
            }
        });
    }

    async sendResetPasswordEmail(to: string, userName?: string): Promise<boolean> {
        return this.sendEmail({
            to,
            subject: "Password Reset Successful - Verxa",
            template: "reset-password",
            context: {
                userName: userName || "User",
                loginLink: `${envConfig.baseUrl}/login`,
                supportEmail: envConfig.email.supportEmail
            }
        });
    }

    async sendLoginSecurityAlert(
        to: string,
        loginDetails: {
            loginTime: string;
            ipAddress?: string;
            deviceName: string;
            operatingSystem: string;
            location?: string;
        },
        userName?: string
    ): Promise<boolean> {
        const ipAddress = loginDetails.ipAddress || "";
        const success = await this.sendEmail({
            to,
            subject: `New Login Notification - IP: ${ipAddress}`,
            template: "login-security-alert",
            context: {
                userName: userName || "",
                userEmail: to,
                loginTime: loginDetails.loginTime,
                ipAddress: loginDetails.ipAddress,
                deviceName: loginDetails.deviceName,
                operatingSystem: loginDetails.operatingSystem,
                location: loginDetails.location,
                supportEmail: envConfig.email.supportEmail
            }
        });

        if (success) {
            logger.info("Login security alert sent successfully", {
                to: to,
                userName: userName,
                ipAddress: ipAddress,
                action: "login_security_alert_sent"
            });
        }
        return success;
    }

    async sendLoginFromDifferentCountryAlert(
        to: string,
        loginDetails: {
            loginTime: string;
            ipAddress?: string;
            deviceName: string;
            operatingSystem: string;
            location?: string;
        },
        userName?: string
    ): Promise<boolean> {
        const ipAddress = loginDetails.ipAddress || "";
        const success = await this.sendEmail({
            to,
            subject: `🚨 SECURITY ALERT: Login from Different Country - ${loginDetails.location || ipAddress}`,
            template: "different-country-login-alert",
            context: {
                userName: userName || "User",
                userEmail: to,
                loginTime: loginDetails.loginTime,
                ipAddress: loginDetails.ipAddress,
                deviceName: loginDetails.deviceName,
                operatingSystem: loginDetails.operatingSystem,
                location: loginDetails.location,
                resetPasswordLink: `${envConfig.baseUrl}/reset-password`, // TODO: Update with correct frontend link
                supportEmail: envConfig.email.supportEmail
            }
        });

        if (success) {
            logger.warn("Different country login alert sent successfully", {
                to: to,
                country: loginDetails.location,
                action: "different_country_alert_sent"
            });
        }
        return success;
    }

    async sendOnboardingEmail(to: string, userName?: string): Promise<boolean> {
        return this.sendEmail({
            to,
            subject: "Verxa - Welcome to Verxa",
            template: "onboarding-email",
            context: {
                userName: userName || "User",
                signupDate: new Date().toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric"
                }),
                supportEmail: envConfig.email.supportEmail
            }
        });
    }

    async sendFailedLoginAttemptsAlert(to: string, alertDetails: AlertDetails, userName?: string): Promise<boolean> {
        const success = await this.sendEmail({
            to,
            subject: `Security Alert - ${alertDetails.attemptCount} Failed Login Attempts - Verxa`,
            template: "failed-login-attempt",
            context: {
                userName: userName || "User",
                attemptCount: alertDetails.attemptCount,
                lastAttemptTime: alertDetails.lastAttemptTime,
                ipAddress: alertDetails.ipAddress,
                deviceName: alertDetails.deviceName,
                location: alertDetails.location,
                supportEmail: envConfig.email.supportEmail,
                resetPasswordLink: "https://yourdomain.com/reset-password" //TODO: GET RESET PASSWORD LINK FROM FRONTEND
            }
        });

        if (success) {
            logger.warn("Security alert sent successfully", {
                to: to,
                userName: userName,
                attemptCount: alertDetails.attemptCount,
                ipAddress: alertDetails.ipAddress,
                deviceName: alertDetails.deviceName,
                action: "security_alert_sent"
            });
        }
        return success;
    }

    async sendVerxaIdUpdatedEmail(
        to: string,
        userName: string,
        oldUsername: string,
        newUsername?: string,
        updateTime: Date = new Date()
    ): Promise<boolean> {
        const success = await this.sendEmail({
            to,
            subject: `Verxa ID updated successfully`,
            template: "verxaid-updated",
            context: {
                userName: userName || "User",
                oldUsername: oldUsername,
                newUsername: newUsername,
                updateTime: updateTime.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZoneName: "short"
                }),
                supportEmail: envConfig.email.supportEmail,
                contactIfNotYou: "If you did not make this change, please contact our support team immediately."
            }
        });

        if (success) {
            logger.info("Verxa ID updated successfully", {
                to: to,
                userName: userName,
                oldUsername: oldUsername,
                newUsername: newUsername,
                updateTime: updateTime.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZoneName: "short"
                }),
                action: "verxaid_updated"
            });
        }
        return success;
    }

    async sendWalletTransactionEmail(
        to: string,
        metadata: {
            userName: string;
            type: "credit" | "debit" | "transfer";
            amount: string;
            currency: string;
            date: string;
            from?: string;
            to?: string;
            transactionReference: string;
            explorerLink?: string;
        }
    ): Promise<boolean> {
        const titleMap = {
            credit: `Wallet Credited - ${metadata.amount} ${metadata.currency}`,
            debit: `Wallet Debited - ${metadata.amount} ${metadata.currency}`,
            transfer: `You just sent ${metadata.amount} ${metadata.currency} to ${metadata.to?.split(" ")[0] || "User"}`
        };
        const title = titleMap[metadata.type];
        return this.sendEmail({
            to,
            subject: "Verxa - Wallet Transaction",
            template: "wallet-transaction",
            context: {
                userName: metadata.userName,
                title,
                amount: metadata.amount,
                currency: metadata.currency,
                date: metadata.date,
                from: metadata.from,
                to: metadata.to,
                transactionReference: metadata.transactionReference,
                explorerLink: metadata.explorerLink,
                supportEmail: envConfig.email.supportEmail
            }
        });
    }

    async sendPayoutCompletedEmail(
        to: string,
        metadata: {
            userName: string;
            amount: string;
            currency: string;
            bankName: string;
            accountNumber: string;
            transactionReference: string;
            date: string;
        }
    ): Promise<boolean> {
        return this.sendEmail({
            to,
            subject: "Success: Payout Disbursed",
            template: "payout-completed",
            context: {
                userName: metadata.userName,
                amount: metadata.amount,
                currency: metadata.currency,
                bankName: metadata.bankName,
                accountNumber: metadata.accountNumber,
                transactionReference: metadata.transactionReference,
                date: metadata.date,
                supportEmail: envConfig.email.supportEmail
            }
        });
    }

    async sendPayoutFailedEmail(
        to: string,
        metadata: {
            userName: string;
            amount: string;
            currency: string;
            reason: string;
            bankName: string;
            accountNumber: string;
            transactionReference: string;
            date: string;
        }
    ): Promise<boolean> {
        return this.sendEmail({
            to,
            subject: "Payout Could Not Be Processed",
            template: "payout-failed",
            context: {
                ...metadata,
                supportEmail: envConfig.email.supportEmail
            }
        });
    }

    async sendCardTransactionEmail(
        to: string,
        metadata: {
            userName: string;
            status: "success" | "failed";
            cardType: string;
            transactionType: string;
            amount: string;
            date: string;
            merchant: string;
            transactionReference: string;
        }
    ): Promise<boolean> {
        const title = metadata.status === "success" ? "Card Transaction Successful!  " : "Card Transaction Failed!";
        return this.sendEmail({
            to,
            subject: "Verxa - Card Transaction",
            template: "card-transaction",
            context: {
                userName: metadata.userName,
                title,
                amount: metadata.amount,
                cardType: metadata.cardType,
                transactionType: metadata.transactionType,
                date: metadata.date,
                merchant: metadata.merchant,
                transactionReference: metadata.transactionReference,
                supportEmail: envConfig.email.supportEmail
            }
        });
    }

    async sendTransactionPinCreated(
        email: string,
        userName: string,
        requestInfo: { ip?: string; userAgent?: string }
    ): Promise<boolean> {
        const success = await this.sendEmail({
            to: email,
            subject: "Transaction PIN Created - Verxa",
            template: "transaction-pin-created",
            context: {
                userName: userName || email.split("@")[0],
                currentTime: new Date().toLocaleDateString(),
                ipAddress: requestInfo.ip || "Unknown",
                deviceInfo: requestInfo.userAgent || "Unknown device",
                supportEmail: envConfig.email.supportEmail
            }
        });

        if (success) {
            logger.info("Transaction PIN Created", {
                to: email,
                userName: userName,
                action: "transaction_pin_created"
            });
        }
        return success;
    }

    async sendSwapEmail(
        to: string,
        metadata: {
            userName: string;
            status: "completed" | "failed";
            fromAsset: string;
            toAsset: string;
            fromAmount: string;
            toAmount: string;
            fee: string;
            rate: string;
            txnId: string;
            date: string;
        }
    ): Promise<boolean> {
        const title = metadata.status === "completed" ? "Swap Successful!" : "Swap Failed!";
        return this.sendEmail({
            to,
            subject: "Verxa - Currency Swap",
            template: "swap-transaction",
            context: {
                userName: metadata.userName,
                title,
                status: metadata.status,
                fromAsset: metadata.fromAsset,
                toAsset: metadata.toAsset,
                fromAmount: metadata.fromAmount,
                toAmount: metadata.toAmount,
                fee: metadata.fee,
                rate: metadata.rate,
                txnId: metadata.txnId,
                date: metadata.date,
                supportEmail: envConfig.email.supportEmail
            }
        });
    }
    async sendTransactionPinResetSuccess(
        email: string,
        userName: string,
        requestInfo: { ip?: string; userAgent?: string }
    ): Promise<boolean> {
        const success = await this.sendEmail({
            to: email,
            subject: "Transaction PIN Successfully Reset - Verxa",
            template: "transaction-pin-reset-success",
            context: {
                userName: userName || email.split("@")[0],
                currentTime: new Date().toLocaleDateString(),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                ipAddress: requestInfo.ip || "Unknown",
                deviceInfo: requestInfo.userAgent || "Unknown device",
                supportEmail: envConfig.email.supportEmail
            }
        });

        if (success) {
            logger.info("Transaction PIN reset success email sent", {
                to: email,
                userName: userName,
                action: "transaction_pin_reset_email_sent"
            });
        }
        return success;
    }

    async sendTransactionPinBlocked(
        to: string,
        userName: string,
        retryMinutes: number,
        ipAddress: string
    ): Promise<boolean> {
        return this.sendEmail({
            to,
            subject: `Transaction PIN Reset Temporarily Blocked  - Verxa`,
            template: "transaction-pin-reset-blocked",
            context: {
                userName: userName || "User",
                retryMinutes: retryMinutes,
                ipAddress: ipAddress,
                currentTime: new Date().toLocaleDateString(),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                supportEmail: envConfig.email.supportEmail
            }
        });
    }

    async sendEsimQrCodeEmail(
        to: string,
        metadata: {
            userName: string;
            qrCode: string;
            qrCodeUrl: string;
            esimId: string;
            transferCode: string;
        }
    ): Promise<boolean> {
        const claimUrl = `${envConfig.baseUrl}/web/esim/claim?esimId=${metadata.esimId}&email=${encodeURIComponent(
            to
        )}`;

        return this.sendEmail({
            to,
            subject: "Your Verxa eSIM QR Code - Claim Ownership",
            template: "esim-qrcode",
            context: {
                userName: metadata.userName,
                qrCode: metadata.qrCode,
                qrCodeUrl: metadata.qrCodeUrl,
                claimUrl: claimUrl,
                transferCode: metadata.transferCode,
                supportEmail: envConfig.email.supportEmail
            }
        });
    }

    async sendEsimOrderCompletedEmail(
        to: string,
        metadata: {
            userName: string;
            orderId: string;
            qrCodeUrl: string;
            iccid: string;
            planId: string;
            createdAt: Date;
        }
    ): Promise<boolean> {
        return this.sendEmail({
            to,
            subject: "Your eSIM Order is Ready!",
            template: "esim-order-completed",
            context: {
                ...metadata,
                supportEmail: envConfig.email.supportEmail
            }
        });
    }

    async sendEsimOrderFailedEmail(
        to: string,
        metadata: {
            userName: string;
            orderId: string;
            planId: string;
            createdAt: Date;
            errorMessage: string;
        }
    ): Promise<boolean> {
        return this.sendEmail({
            to,
            subject: "eSIM Order Failed",
            template: "esim-order-failed",
            context: {
                ...metadata,
                supportEmail: envConfig.email.supportEmail
            }
        });
    }

    async sendEsimTopupActivatedEmail(
        to: string,
        metadata: {
            userName: string;
            currentDataPercentage: string;
            esimId: string;
        }
    ): Promise<boolean> {
        return this.sendEmail({
            to,
            subject: "Your Top-Up Package Will Activate Automatically",
            template: "esim-topup-activated",
            context: {
                userName: metadata.userName,
                currentDataPercentage: metadata.currentDataPercentage,
                esimId: metadata.esimId,
                viewEsimUrl: `${envConfig.baseUrl}/esim/${metadata.esimId}`,
                supportEmail: envConfig.email.supportEmail
            }
        });
    }

    async sendEsimTopupReadyEmail(
        to: string,
        metadata: {
            userName: string;
            orderId: string;
            esimId: string;
            planId: string;
            activatedAt: Date | null;
            expiresAt: Date | null;
        }
    ): Promise<boolean> {
        return this.sendEmail({
            to,
            subject: "Your Top-Up is Ready",
            template: "esim-topup-ready",
            context: {
                userName: metadata.userName,
                orderId: metadata.orderId,
                esimId: metadata.esimId,
                planId: metadata.esimId,
                activatedAt: metadata.activatedAt || new Date(),
                expiresAt: metadata.expiresAt || new Date(),
                viewInstructionsUrl: `${envConfig.baseUrl}/esim/${metadata.esimId}/instructions`,
                supportEmail: envConfig.email.supportEmail
            }
        });
    }

    async sendEsimLowDataEmail(
        to: string,
        metadata: {
            userName: string;
            packageName: string;
            level: string;
            remainingPercentage: number;
        }
    ): Promise<boolean> {
        return this.sendEmail({
            to,
            subject: `Your eSIM Data is Running Low - ${metadata.level}`,
            template: "esim-low-data",
            context: {
                ...metadata,
                supportEmail: envConfig.email.supportEmail
            }
        });
    }

    async sendEsimClaimSuccessEmail(
        to: string,
        metadata: {
            userName: string;
            iccid: string;
            qrCode: string | null;
        }
    ): Promise<boolean> {
        return this.sendEmail({
            to,
            subject: "eSIM Claimed Successfully",
            template: "esim-claim-success",
            context: {
                ...metadata,
                supportEmail: envConfig.email.supportEmail
            }
        });
    }

    async sendEsimReceiptEmail(
        to: string,
        metadata: {
            userName: string;
            invoiceNumber: string;
            txnId: string;
            amount: number | string;
            date: string;
        },
        pdfBuffer: Buffer
    ): Promise<boolean> {
        return this.sendEmail({
            to,
            subject: `eSIM Receipt - ${metadata.invoiceNumber}`,
            template: "esim-receipt",
            context: {
                ...metadata,
                supportEmail: envConfig.email.supportEmail
            },
            attachments: [
                {
                    filename: `receipt-${metadata.invoiceNumber}.pdf`,
                    content: pdfBuffer,
                    contentType: "application/pdf"
                }
            ]
        });
    }

    async sendAdminInvitationEmail(to: string, inviteUrl: string): Promise<boolean> {
        return this.sendEmail({
            to,
            subject: "Admin Dashboard Invitation - Verxa",
            template: "admin-invitation",
            context: {
                inviteUrl,
                expiryHours: 24,
                supportEmail: envConfig.email.supportEmail
            }
        });
    }

    async close(): Promise<void> {
        logger.info("Closing email service connections", {
            action: "email_service_closing"
        });
    }

    async sendKycVerificationSuccessful(to: string, userName: string, tier: KycTier): Promise<boolean> {
        const tierInfo =
            tier === KycTier.TIER2
                ? { level: "Level 2 - Full Verification", title: "Premium Access Unlocked" }
                : { level: "Level 1 - Standard Verification", title: "Account Verified" };

        return this.sendEmail({
            to,
            subject: `KYC Verification Successful - Verxa`,
            template: "kyc-verification-successful",
            context: {
                userName: userName || "User",
                verificationLevel: tierInfo.level,
                verificationDate: new Date().toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric"
                }),
                tier,
                supportEmail: envConfig.email.supportEmail
            }
        });
    }

    async sendKycVerificationFailed(
        to: string,
        userName: string,
        tier: KycTier,
        rejectLabels?: string[]
    ): Promise<boolean> {
        const tierInfo =
            tier === KycTier.TIER2
                ? { level: "Level 2 - Full Verification", title: "Verification Failed" }
                : { level: "Level 1 - Standard Verification", title: "Verification Failed" };

        return this.sendEmail({
            to,
            subject: `KYC Verification Failed - Verxa`,
            template: "kyc-verification-failed",
            context: {
                userName: userName || "User",
                verificationLevel: tierInfo.level,
                verificationDate: new Date().toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric"
                }),
                tier,
                rejectLabels: rejectLabels || [],
                supportEmail: envConfig.email.supportEmail
            }
        });
    }

    async sendKycTierUpgrade(to: string, userName: string, fromTier: KycTier, toTier: KycTier): Promise<boolean> {
        const tierMapping = {
            [KycTier.NO_KYC]: "Unverified",
            [KycTier.TIER1]: "Level 1 - Standard Verification",
            [KycTier.TIER2]: "Level 2 - Full Verification"
        };

        return this.sendEmail({
            to,
            subject: `Account Upgraded - Verxa`,
            template: "kyc-tier-upgrade",
            context: {
                userName: userName || "User",
                fromTier: tierMapping[fromTier],
                toTier: tierMapping[toTier],
                upgradeDate: new Date().toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric"
                }),
                newTierLevel: toTier,
                supportEmail: envConfig.email.supportEmail
            }
        });
    }

    async sendTransactionFlaggedEscalationEmail(details: {
        transactionId: string;
        reason: string;
        adminName: string;
        adminEmail: string;
    }): Promise<boolean> {
        return this.sendEmail({
            to: envConfig.security.escalationEmail,
            subject: `ESCALATION: Transaction Flagged - ${details.transactionId}`,
            template: "admin-notification",
            context: {
                userName: "Escalation Team",
                title: "Transaction Flagged for Review",
                message: `Transaction ID: ${details.transactionId}\nFlagged by: ${details.adminName} (${details.adminEmail})\nReason: ${details.reason}\n\nPlease review this transaction immediately in the admin dashboard.`
            }
        });
    }
}

export default EmailService;
