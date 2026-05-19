export type SendGridEvent =
    | "bounce"
    | "delivered"
    | "deferred"
    | "dropped"
    | "processed"
    | "open"
    | "click"
    | "spamreport"
    | "unsubscribe";

export interface SendGridEventPayload {
    email: string;
    timestamp: number;
    event: SendGridEvent;
    sg_message_id: string;
    sg_event_id?: string;
    useragent?: string;
    ip?: string;
    url?: string;
    reason?: string;
    status?: string;
    response?: string;
    attempt?: string;
    category?: string[];
    bounce_classification?: string;
}
