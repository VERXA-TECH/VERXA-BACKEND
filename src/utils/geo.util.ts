import geoip from "fast-geoip";
import logger from "../config/logger";
import { withContext } from "./loggerWithContext";

export interface GeoLocation {
    country: string;
    region?: string;
    city?: string;
    ll?: [number, number];
}

export class GeoUtil {
    /**
     * Resolve IP address to country
     * @param ip The IP address to resolve
     * @returns The country code or null if not found/error
     */
    static async getCountry(ip: string): Promise<string | null> {
        if (!ip || ip === "::1" || ip === "127.0.0.1") {
            return "Local";
        }

        try {
            const geo = await geoip.lookup(ip);
            return geo ? geo.country : null;
        } catch (error) {
            logger.error(
                "IP Geolocation failed",
                withContext({
                    ip,
                    error: error instanceof Error ? error.message : "Unknown error",
                    action: "ip_geolocation_failed"
                })
            );
            return null;
        }
    }

    /**
     * Get full geolocation info
     * @param ip The IP address to resolve
     */
    static async getGeoInfo(ip: string): Promise<GeoLocation | null> {
        if (!ip || ip === "::1" || ip === "127.0.0.1") {
            return { country: "Local" };
        }

        try {
            const geo = await geoip.lookup(ip);
            if (!geo) return null;

            return {
                country: geo.country,
                region: geo.region,
                city: geo.city,
                ll: geo.ll
            };
        } catch (error) {
            logger.error(
                "IP Geolocation failed",
                withContext({
                    ip,
                    error: error instanceof Error ? error.message : "Unknown error",
                    action: "ip_geolocation_failed"
                })
            );
            return null;
        }
    }
}

export default GeoUtil;
