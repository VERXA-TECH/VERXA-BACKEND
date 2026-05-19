export const formatDateToHumanFriendly = (date: Date, options: { withTime?: boolean } = { withTime: true }): string => {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        return "Invalid Date";
    }

    const formatterOptions: Intl.DateTimeFormatOptions = {
        timeZone: "Africa/Lagos", // Nigerian timezone (WAT, UTC+1)
        month: "long",
        day: "numeric",
        year: "numeric",
    };

    if (options.withTime) {
        formatterOptions.hour = "numeric";
        formatterOptions.minute = "2-digit";
        formatterOptions.hour12 = true;
    }

    return date.toLocaleString("en-US", formatterOptions);
};


export function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

export function fmtUsd(n: number): string {
    const v = Number.isFinite(n) ? n : 0;
    return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function getClientIp(req: any): string {
    return (req?.clientIp as string) || (req?.ip as string) || "";
}

export function parseAllowedIps(raw?: string | null): string[] {
    return (raw || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}