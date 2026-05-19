import crypto from "crypto";
import envConfig from "../config/env";

/**
 * Privacy utilities for audit logging compliance
 */

/**
 * Hash an IP address using SHA-256
 * Allows identifying same IP without revealing actual address
 * @param ipAddress - IP address to hash
 * @param salt - Salt for hash (use envConfig.audit.ipHashSalt)
 * @returns Hashed IP address as hex string
 */
export function hashIpAddress(ipAddress: string, salt: string): string {
    if (!ipAddress || ipAddress === "unknown" || ipAddress === "system" || ipAddress.includes("webhook")) {
        return ipAddress; // Don't hash system/webhook IPs
    }

    const hash = crypto.createHash("sha256");
    hash.update(`${ipAddress}${salt}`);
    return `hashed:${hash.digest("hex")}`;
}

/**
 * Sanitize user agent to remove version numbers and specific hardware identifiers
 * Keeps only: browser family, OS family, device type
 * @param userAgent - Raw user agent string
 * @returns Sanitized user agent string
 */
export function sanitizeUserAgent(userAgent: string): string {
    if (!userAgent || userAgent === "unknown" || userAgent === "system" || userAgent.includes("webhook")) {
        return userAgent; // Don't sanitize system/webhook user agents
    }

    // Extract browser family
    let browser = "Unknown";
    if (userAgent.includes("Chrome") && !userAgent.includes("Edge")) {
        browser = "Chrome";
    } else if (userAgent.includes("Firefox")) {
        browser = "Firefox";
    } else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
        browser = "Safari";
    } else if (userAgent.includes("Edge")) {
        browser = "Edge";
    } else if (userAgent.includes("Opera") || userAgent.includes("OPR")) {
        browser = "Opera";
    }

    // Extract OS family
    let os = "Unknown";
    if (userAgent.includes("Windows NT")) {
        os = "Windows";
    } else if (userAgent.includes("Mac OS X") || userAgent.includes("Macintosh")) {
        os = "macOS";
    } else if (userAgent.includes("Linux") && !userAgent.includes("Android")) {
        os = "Linux";
    } else if (userAgent.includes("Android")) {
        os = "Android";
    } else if (userAgent.includes("iPhone") || userAgent.includes("iPad") || userAgent.includes("iPod")) {
        os = "iOS";
    }

    // Extract device type
    let deviceType = "Desktop";
    if (userAgent.includes("Mobile") || userAgent.includes("Android") || userAgent.includes("iPhone")) {
        deviceType = "Mobile";
    } else if (userAgent.includes("Tablet") || userAgent.includes("iPad")) {
        deviceType = "Tablet";
    }

    return `${browser}/${os}/${deviceType}`;
}

export function maskAccountNumber(accountNumber: string): string {
    if (!accountNumber) return accountNumber;
    if (accountNumber.length <= 4) return "*".repeat(accountNumber.length);
    return `${"*".repeat(accountNumber.length - 4)}${accountNumber.slice(-4)}`;
}

/**
 * Partially mask a blockchain wallet address
 * Shows first 6 and last 4 characters
 * @param address - Full wallet address
 * @returns Masked address (e.g., "0x1234...ABCD")
 */
export function maskWalletAddress(address: string | null): string | null {
    if (!address || address.length < 12) {
        return address;
    }

    const prefix = address.substring(0, 6);
    const suffix = address.substring(address.length - 4);
    return `${prefix}...${suffix}`;
}

/**
 * Sanitize audit context for privacy compliance
 * Applies hashing/sanitization to PII fields
 * @param context - Raw audit context
 * @returns Privacy-compliant audit context
 */
export function sanitizeAuditContext(context: {
    userId: string;
    ipAddress: string;
    userAgent: string;
    performedBy?: string;
    requestId?: string;
    startTime: Date;
}): {
    userId: string;
    ipAddress: string;
    userAgent: string;
    performedBy?: string;
    requestId?: string;
    startTime: Date;
} {
    return {
        ...context,
        ipAddress: hashIpAddress(context.ipAddress, envConfig.audit.ipHashSalt),
        userAgent: sanitizeUserAgent(context.userAgent),
        // Ensure startTime is always a Date object
        startTime: context.startTime instanceof Date ? context.startTime : new Date()
    };
}
