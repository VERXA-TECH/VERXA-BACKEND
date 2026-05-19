export function buildSumsubIdempotencyKey(opts: {
    type: string;
    applicantId?: string | null;
    inspectionId?: string | null;
    correlationId?: string | null;
}) {
    const parts = ["sumsub", "wh", opts.type || "unknown"];

    if (opts.applicantId) parts.push(`app:${opts.applicantId}`);
    if (opts.inspectionId) parts.push(`insp:${opts.inspectionId}`);
    if (opts.correlationId) parts.push(`cor:${opts.correlationId}`);

    return parts.join(":");
}
