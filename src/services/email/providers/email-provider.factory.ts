/* eslint-disable @typescript-eslint/no-explicit-any */
import envConfig from "../../../config/env";
import logger from "../../../config/logger";
import { EmailProvider, IEmailProvider, SendEmailRequest, SendEmailResponse } from "./email-provider.interface";
import { SmtpProvider } from "./smtp.provider";
import { ResendProvider } from "./resend.provider";

/**
 * Email Provider Factory with Intelligent Fallback
 *
 * This factory creates and manages email providers with support for:
 * - Primary provider selection via environment variable
 * - Automatic fallback to backup providers on failure
 * - Provider health tracking
 * - Circuit breaker pattern to avoid repeatedly trying failed providers
 */
export class EmailProviderFactory {
    private providers: Map<string, IEmailProvider> = new Map();
    private providerOrder: string[] = [];
    private failureCount: Map<string, number> = new Map();
    private lastFailureTime: Map<string, number> = new Map();

    // Circuit breaker settings
    private readonly MAX_FAILURES = 3;
    private readonly CIRCUIT_RESET_TIME_MS = 5 * 60 * 1000; // 5 minutes

    constructor() {
        this.initializeProviders();
    }

    private initializeProviders(): void {
        const configuredProviders = this.parseProviderConfig();

        logger.info("Initializing email providers", {
            configuredProviders,
            action: "email_providers_initialization"
        });

        for (const providerName of configuredProviders) {
            try {
                const provider = this.createProvider(providerName);
                if (provider) {
                    this.providers.set(providerName, provider);
                    this.providerOrder.push(providerName);
                    this.failureCount.set(providerName, 0);
                }
            } catch (error: any) {
                logger.error(`Failed to initialize ${providerName} provider`, {
                    provider: providerName,
                    error: error.message,
                    action: "provider_initialization_failed"
                });
            }
        }

        if (this.providers.size === 0) {
            logger.error("No email providers initialized - email functionality will not work", {
                action: "no_providers_available"
            });
        } else {
            logger.info("Email providers initialized successfully", {
                providers: Array.from(this.providers.keys()),
                order: this.providerOrder,
                action: "providers_initialized"
            });
        }
    }

    /**
     * Parse provider configuration from env
     * Supports comma-separated list for fallback chain
     * Example: "sendgrid,smtp,ses" will try SMTP, then SES
     */
    private parseProviderConfig(): string[] {
        const providerConfig = envConfig.email.provider || "smtp";
        const providers = providerConfig
            .split(",")
            .map((p) => p.trim().toLowerCase())
            .filter((p) => p.length > 0);
        const validProviders = [EmailProvider.RESEND];
        const filtered = providers.filter((p) => {
            if (!validProviders.includes(p as EmailProvider)) {
                logger.warn(`Invalid provider name: ${p}`, {
                    validProviders,
                    action: "invalid_provider_name"
                });
                return false;
            }
            return true;
        });


        if (filtered.length === 0) {
            logger.warn("No valid providers configured, defaulting to sendgrid", {
                action: "default_provider_fallback"
            });
            return ["smtp"];
        }

        return filtered;
    }

    private createProvider(name: string): IEmailProvider | null {
        switch (name) {
         
            case EmailProvider.SMTP:
                return new SmtpProvider({
                    host: envConfig.email.smtp.host,
                    port: envConfig.email.smtp.port,
                    secure: envConfig.email.smtp.secure,
                    user: envConfig.email.smtp.user,
                    password: envConfig.email.smtp.password,
                });

            case EmailProvider.RESEND:
                return new ResendProvider(
                    envConfig.email.resend.apiKey,
                    envConfig.email.resend.from,
                    envConfig.email.resend.fromName,
                );

            default:
                logger.error(`Unknown provider type: ${name}`, {
                    action: "unknown_provider_type",
                });
                return null;
        }
    }

    /**
     * Get the primary provider (first in the order)
     */
    getPrimaryProvider(): IEmailProvider | null {
        if (this.providerOrder.length === 0) {
            return null;
        }
        return this.providers.get(this.providerOrder[0]) || null;
    }

    /**
     * Get all available providers in fallback order
     */
    getProviders(): IEmailProvider[] {
        return this.providerOrder
            .map((name) => this.providers.get(name))
            .filter((p): p is IEmailProvider => p !== undefined);
    }

    /**
     * Check if a provider is in circuit breaker (too many recent failures)
     */
    private isCircuitOpen(providerName: string): boolean {
        const failures = this.failureCount.get(providerName) || 0;
        const lastFailure = this.lastFailureTime.get(providerName) || 0;
        const now = Date.now();

        // Reset circuit if enough time has passed
        if (failures >= this.MAX_FAILURES && now - lastFailure > this.CIRCUIT_RESET_TIME_MS) {
            logger.info("Resetting circuit breaker for provider", {
                provider: providerName,
                previousFailures: failures,
                action: "circuit_breaker_reset"
            });
            this.failureCount.set(providerName, 0);
            return false;
        }

        return failures >= this.MAX_FAILURES;
    }

    /**
     * Record a failure for a provider
     */
    private recordFailure(providerName: string): void {
        const currentCount = this.failureCount.get(providerName) || 0;
        this.failureCount.set(providerName, currentCount + 1);
        this.lastFailureTime.set(providerName, Date.now());

        if (currentCount + 1 >= this.MAX_FAILURES) {
            logger.warn("Provider circuit breaker opened due to repeated failures", {
                provider: providerName,
                failures: currentCount + 1,
                resetInMs: this.CIRCUIT_RESET_TIME_MS,
                action: "circuit_breaker_opened"
            });
        }
    }

    /**
     * Record a success for a provider (resets failure count)
     */
    private recordSuccess(providerName: string): void {
        const previousFailures = this.failureCount.get(providerName) || 0;
        if (previousFailures > 0) {
            logger.info("Provider recovered from failures", {
                provider: providerName,
                previousFailures,
                action: "provider_recovered"
            });
        }
        this.failureCount.set(providerName, 0);
    }

    /**
     * Send email with automatic fallback
     * Tries providers in order until one succeeds or all fail
     */
    async sendWithFallback(request: SendEmailRequest): Promise<SendEmailResponse> {
        const availableProviders = this.getProviders();

        if (availableProviders.length === 0) {
            return {
                success: false,
                provider: "none",
                error: new Error("No email providers available"),
                errorCode: "NO_PROVIDERS"
            };
        }

        const errors: Array<{ provider: string; error: any }> = [];

        for (const provider of availableProviders) {
            // Skip if circuit breaker is open
            if (this.isCircuitOpen(provider.name)) {
                logger.warn("Skipping provider due to circuit breaker", {
                    provider: provider.name,
                    action: "provider_skipped_circuit_breaker"
                });
                continue;
            }

            try {
                logger.info("Attempting to send email", {
                    provider: provider.name,
                    to: request.to,
                    attempt: errors.length + 1,
                    action: "email_send_attempt"
                });

                const response = await provider.send(request);

                if (response.success) {
                    this.recordSuccess(provider.name);
                    logger.info("Email sent successfully", {
                        provider: provider.name,
                        to: request.to,
                        messageId: response.messageId,
                        attemptedProviders: errors.length + 1,
                        action: "email_sent_success"
                    });
                    return response;
                }

                // Check if error is permanent
                if (response.error && provider.isPermanentError(response.error)) {
                    logger.error("Permanent error from provider - not attempting fallback", {
                        provider: provider.name,
                        to: request.to,
                        error: response.error.message,
                        errorCode: response.errorCode,
                        action: "permanent_error_no_fallback"
                    });
                    this.recordFailure(provider.name);
                    return response;
                }

                // Transient error - try next provider
                errors.push({ provider: provider.name, error: response.error });
                this.recordFailure(provider.name);

                logger.warn("Transient error from provider - trying next", {
                    provider: provider.name,
                    to: request.to,
                    error: response.error?.message,
                    errorCode: response.errorCode,
                    action: "transient_error_fallback"
                });
            } catch (error: any) {
                errors.push({ provider: provider.name, error });
                this.recordFailure(provider.name);

                logger.error("Unexpected error from provider", {
                    provider: provider.name,
                    to: request.to,
                    error: error.message,
                    stack: error.stack,
                    action: "unexpected_provider_error"
                });
            }
        }

        logger.error("All email providers failed", {
            to: request.to,
            attemptedProviders: errors.length,
            errors: errors.map((e) => ({
                provider: e.provider,
                message: e.error?.message
            })),
            action: "all_providers_failed"
        });

        return {
            success: false,
            provider: "all_failed",
            error: new Error(`All email providers failed. Attempted: ${errors.map((e) => e.provider).join(", ")}`),
            errorCode: "ALL_PROVIDERS_FAILED"
        };
    }

    async verifyAll(): Promise<Map<EmailProvider, boolean>> {
        const results = new Map<EmailProvider, boolean>();

        for (const provider of this.providers.values()) {
            try {
                const verified = await provider.verify();
                results.set(provider.name, verified);
            } catch (error: any) {
                logger.error(`Verification failed for provider ${provider.name}`, {
                    provider: provider.name,
                    error: error.message,
                    action: "provider_verification_failed"
                });
                results.set(provider.name, false);
            }
        }

        return results;
    }
    getProviderHealth(): Array<{
        name: string;
        failures: number;
        circuitOpen: boolean;
        lastFailureTime: number | null;
    }> {
        return this.providerOrder.map((name) => ({
            name,
            failures: this.failureCount.get(name) || 0,
            circuitOpen: this.isCircuitOpen(name),
            lastFailureTime: this.lastFailureTime.get(name) || null
        }));
    }
}
