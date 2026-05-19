/**
 * Normalizes an IP address by stripping IPv6-mapped IPv4 prefixes (::ffff:).
 *
 * This ensures consistent comparison when checking against blacklists or fraud rules,
 * as Express may represent IPv4 addresses in mapped form depending on environment.
 *
 * @param ip - The IP address string to normalize
 * @returns The normalized IP address string
 */
export const normalizeIP = (ip: string): string => {
    if (!ip) return ip;

    // Strip IPv6-mapped IPv4 prefix
    if (ip.startsWith("::ffff:")) {
        return ip.substring(7);
    }

    // Handle localhost abbreviations
    if (ip === "::1") {
        return "127.0.0.1";
    }

    return ip;
};
