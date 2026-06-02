/* eslint-disable @typescript-eslint/no-explicit-any */
import { Resend } from "resend";
import logger from "../../../config/logger";
import {
    EmailProvider,
    IEmailProvider,
    SendEmailRequest,
    SendEmailResponse,
    BatchEmailRequest,
    SendBatchEmailResponse,
} from "./email-provider.interface";

const BATCH_CHUNK_SIZE = 100; // Resend batch API limit

export class ResendProvider implements IEmailProvider {
    public readonly name = EmailProvider.RESEND;
    private client: Resend;
    private isInitialized = false;
    private defaultFrom: string = "";
    private defaultFromName: string = "";

    constructor(apiKey: string, defaultFrom?: string, defaultFromName?: string) {
        this.defaultFrom = defaultFrom || "";
        this.defaultFromName = defaultFromName || "";
        if (!apiKey || apiKey.trim() === "") {
            logger.warn("Resend API key not provided", {
                provider: this.name,
                action: "resend_initialization_warning",
            });
            this.client = new Resend("");
        } else {
            this.client = new Resend(apiKey);
            this.isInitialized = true;
            logger.info("Resend provider initialized", {
                provider: this.name,
                action: "provider_initialized",
            });
        }
    }

    async send(request: SendEmailRequest): Promise<SendEmailResponse> {
        if (!this.isInitialized) {
            return {
                success: false,
                provider: this.name,
                error: new Error("Resend provider not initialized — missing API key"),
                errorCode: "NOT_INITIALIZED",
            };
        }

        try {
            const fromAddr = request.from || this.defaultFrom;
            const fromName = request.fromName || this.defaultFromName;

            const payload: Parameters<Resend["emails"]["send"]>[0] = {
                from: fromName ? `${fromName} <${fromAddr}>` : fromAddr,
                to: request.to,
                subject: request.subject,
                html: request.html,

                // Attachments — Buffer or base64 string both supported by Resend
                ...(request.attachments?.length
                    ? {
                          attachments: request.attachments.map((a) => ({
                              filename: a.filename,
                              content: typeof a.content === "string" ? a.content : a.content.toString("base64"),
                              contentType: a.contentType,
                          })),
                      }
                    : {}),

                ...(request.scheduledAt ? { scheduledAt: request.scheduledAt } : {}),

                // Tags for segmentation/tracking
                ...(request.tags?.length ? { tags: request.tags } : {}),

                // List-unsubscribe header
                ...(request.listUnsubscribeHeader
                    ? { headers: { "List-Unsubscribe": request.listUnsubscribeHeader } }
                    : {}),
            };

            const { data, error } = await this.client.emails.send(payload);

            if (error) {
                logger.error("Resend API error during send", {
                    provider: this.name,
                    to: request.to,
                    error: error.message,
                    name: error.name,
                    action: "email_send_failed",
                });

                const resendErr = new Error(error.message);
                (resendErr as any).name = error.name;

                return {
                    success: false,
                    provider: this.name,
                    error: resendErr,
                    errorCode: error.name,
                };
            }

            logger.info("Email sent successfully via Resend", {
                provider: this.name,
                to: request.to,
                messageId: data?.id,
                action: "email_sent_success",
            });

            return {
                success: true,
                messageId: data?.id,
                provider: this.name,
                from: payload.from,
            };
        } catch (error: any) {
            logger.error("Unexpected error sending email via Resend", {
                provider: this.name,
                to: request.to,
                error: error.message,
                action: "email_send_failed",
            });

            return {
                success: false,
                provider: this.name,
                error,
                errorCode: error.statusCode?.toString() ?? "UNKNOWN",
            };
        }
    }

    async sendBatch(requests: BatchEmailRequest): Promise<SendBatchEmailResponse> {
        if (!this.isInitialized) {
            const errResponse: SendEmailResponse = {
                success: false,
                provider: this.name,
                error: new Error("Resend provider not initialized"),
                errorCode: "NOT_INITIALIZED",
            };
            return {
                results: requests.map(() => errResponse),
                successCount: 0,
                failureCount: requests.length,
            };
        }

        const allResults: SendEmailResponse[] = [];

        // Chunk into groups of 100 (Resend batch limit)
        for (let i = 0; i < requests.length; i += BATCH_CHUNK_SIZE) {
            const chunk = requests.slice(i, i + BATCH_CHUNK_SIZE);

            const payloads = chunk.map((request) => {
                const fromAddr = request.from || this.defaultFrom;
                const fromName = request.fromName || this.defaultFromName;

                return {
                    from: fromName ? `${fromName} <${fromAddr}>` : fromAddr,
                    to: request.to,
                    subject: request.subject,
                    html: request.html,
                    ...(request.tags?.length ? { tags: request.tags } : {}),
                    ...(request.listUnsubscribeHeader
                        ? { headers: { "List-Unsubscribe": request.listUnsubscribeHeader } }
                        : {}),
                };
            });

            try {
                const { data, error } = await this.client.batch.send(payloads);

                if (error) {
                    logger.error("Resend batch API error", {
                        provider: this.name,
                        chunkStart: i,
                        chunkSize: chunk.length,
                        error: error.message,
                        action: "batch_send_failed",
                    });

                    // Mark entire chunk as failed
                    chunk.forEach((_req) => {
                        const resendErr = new Error(error.message);
                        (resendErr as any).name = error.name;
                        allResults.push({
                            success: false,
                            provider: this.name,
                            error: resendErr,
                            errorCode: error.name,
                        });
                    });
                    continue;
                }

                // Map per-message results
                const batchData = data as unknown as Array<{ id: string }> | null;
                chunk.forEach((req, idx) => {
                    const sent = batchData?.[idx];
                    allResults.push({
                        success: !!sent?.id,
                        messageId: sent?.id,
                        provider: this.name,
                        ...(!sent?.id
                            ? {
                                  error: (() => {
                                      const e = new Error("No message ID returned");
                                      (e as any).name = "missing_id";
                                      return e;
                                  })(),
                                  errorCode: "MISSING_ID",
                              }
                            : {}),
                    });
                });

                logger.info("Resend batch chunk sent", {
                    provider: this.name,
                    chunkStart: i,
                    chunkSize: chunk.length,
                    successCount: data?.length ?? 0,
                    action: "batch_chunk_sent",
                });
            } catch (err: any) {
                logger.error("Unexpected error during Resend batch send", {
                    provider: this.name,
                    chunkStart: i,
                    error: err.message,
                    action: "batch_send_unexpected_error",
                });

                chunk.forEach(() => {
                    allResults.push({
                        success: false,
                        provider: this.name,
                        error: err,
                        errorCode: err.statusCode?.toString() ?? "UNKNOWN",
                    });
                });
            }
        }

        const successCount = allResults.filter((r) => r.success).length;
        return {
            results: allResults,
            successCount,
            failureCount: allResults.length - successCount,
        };
    }

    async verify(): Promise<boolean> {
        if (!this.isInitialized) {
            logger.warn("Resend provider not initialized — skipping verify", {
                provider: this.name,
                action: "verification_skipped",
            });
            return false;
        }

        try {
            // Lightweight check to confirm the key is valid.
            // Note: 'Sending only' keys will return an error for apiKeys.list(),
            // but the error message itself confirms the key is recognized and valid.
            const { error } = await this.client.apiKeys.list();

            if (error) {
                // If the error explicitly says it's restricted to sending, then the key is valid!
                if (error.message.includes("restricted to only send emails")) {
                    logger.info("Resend provider verified (Sending Only key)", {
                        provider: this.name,
                        action: "provider_verified_restricted",
                    });
                    return true;
                }

                logger.error("Resend key verification failed", {
                    provider: this.name,
                    error: error.message,
                    action: "resend_verification_failed",
                });
                return false;
            }

            logger.info("Resend provider verified successfully", {
                provider: this.name,
                action: "provider_verified",
            });
            return true;
        } catch (error: any) {
            logger.error("Resend verification threw unexpectedly", {
                provider: this.name,
                error: error.message,
                action: "resend_verification_error",
            });
            return false;
        }
    }

    isPermanentError(error: any): boolean {
        const permanentStatusCodes = [
            400, // Bad request / validation
            401, // Unauthorized
            403, // Forbidden
            422, // Unprocessable entity (invalid email address etc.)
        ];

        const statusCode = error?.statusCode ?? error?.response?.status;
        if (statusCode && permanentStatusCodes.includes(statusCode)) {
            return true;
        }

        const permanentErrorNames = [
            "validation_error",
            "invalid_to",
            "invalid_from",
            "missing_required_field",
            "invalid_api_key",
            "restricted_api_key",
            "NOT_INITIALIZED",
        ];

        return permanentErrorNames.includes(error?.name) || permanentErrorNames.includes(error?.errorCode);
    }
}
