import crypto from "crypto";
import otpGenerator from "otp-generator";
import { parsePhoneNumberFromString, CountryCode } from "libphonenumber-js";
import AppError from "../appError";

export type AnyObj = Record<string, any>;

type NormalizedPhone = {
    input: string; // raw input
    e164: string; // normalized E.164 format (+2348012345678)
    national: string; // local format (0801 234 5678)
    country: CountryCode; // detected country (NG, GB, AE)
    isValid: boolean; // whether the number is valid
};

class DataHelper {
    static removeKeys(obj: AnyObj, keys: string[]) {
        const keySet = new Set(keys);
        const seen = new WeakSet<object>();

        const isPlainObject = (val: any) => Object.prototype.toString.call(val) === "[object Object]";

        const walk = (value: any) => {
            if (value == null) return;
            if (Array.isArray(value)) {
                for (const item of value) walk(item);
                return;
            }
            if (typeof value !== "object") return;
            if (!isPlainObject(value)) return;
            if (seen.has(value)) return;
            seen.add(value);

            for (const key of Object.keys(value)) {
                if (keySet.has(key)) {
                    delete value[key];
                } else {
                    walk(value[key]);
                }
            }
        };

        walk(obj);
    }

    // ---------- IDs & codes ----------

    static generateUniqueRef(): string {
        return crypto.randomUUID().replace(/-/g, "");
    }

    static generateReqId(): string {
        return crypto.randomUUID().replace(/-/g, "").toUpperCase();
    }

    /**
     * 6-char referral code [A-Z0-9]. Uniform and URL-safe.
     */
    static generateReferralCode(length = 6): string {
        const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        const bytes = crypto.randomBytes(length);
        let out = "";
        for (let i = 0; i < length; i++) {
            out += ALPHABET[bytes[i] % ALPHABET.length];
        }
        return out;
    }

    static generateOTP(): string {
        return otpGenerator.generate(6, {
            upperCaseAlphabets: false,
            specialChars: false,
            lowerCaseAlphabets: false
        });
    }

    private static normalizeName(s: string): string {
        return s
            .toLowerCase()
            .normalize("NFKD")
            .replace(/\p{M}+/gu, "")
            .replace(/[^a-z0-9\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    static jaroWinkler(a: string, b: string): number {
        if (a === b) return 1;
        const len1 = a.length,
            len2 = b.length;
        if (!len1 || !len2) return 0;

        const matchDist = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);
        const s1Matches = new Array<boolean>(len1).fill(false);
        const s2Matches = new Array<boolean>(len2).fill(false);

        let matches = 0,
            transpositions = 0;

        for (let i = 0; i < len1; i++) {
            const start = Math.max(0, i - matchDist);
            const end = Math.min(i + matchDist + 1, len2);
            for (let j = start; j < end; j++) {
                if (s2Matches[j] || a[i] !== b[j]) continue;
                s1Matches[i] = s2Matches[j] = true;
                matches++;
                break;
            }
        }
        if (!matches) return 0;

        let k = 0;
        for (let i = 0; i < len1; i++) {
            if (!s1Matches[i]) continue;
            while (!s2Matches[k]) k++;
            if (a[i] !== b[k]) transpositions++;
            k++;
        }

        const m = matches;
        let jaro = (m / len1 + m / len2 + (m - transpositions / 2) / m) / 3;

        let prefix = 0;
        const maxPrefix = 4;
        while (prefix < Math.min(maxPrefix, len1, len2) && a[prefix] === b[prefix]) prefix++;
        jaro += prefix * 0.1 * (1 - jaro);

        return jaro;
    }

    static compareNameFuzzy(values: [string, string], compareWith: string, threshold = 0.88): boolean {
        const lhs = DataHelper.normalizeName(values.join(" "));
        const rhs = DataHelper.normalizeName(compareWith);
        return DataHelper.jaroWinkler(lhs, rhs) >= threshold;
    }

    static compareName(values: [string, string], compareWith: string): boolean {
        return DataHelper.compareNameFuzzy(values, compareWith, 0.7);
    }

    // ---------- Dates, phones, arrays, strings ----------

    static isValidDateISOString(dateString: string): boolean {
        const t = Date.parse(dateString);
        if (Number.isNaN(t)) return false;
        return dateString === new Date(t).toISOString();
    }

    static validateDate(dateStr: string | undefined): Date | undefined {
        if (!dateStr) return undefined;
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            throw new AppError(`Invalid date format for '${dateStr}'`, 400);
        }
        return date;
    }

    static formatPhoneNumber(phoneNumber: string): string {
        const digits = phoneNumber.replace(/[^\d+]/g, "").trim();

        // Already +234XXXXXXXXXX
        if (/^\+234\d{10}$/.test(digits)) return digits;

        // 234XXXXXXXXXX → +234XXXXXXXXXX
        if (/^234\d{10}$/.test(digits)) return `+${digits}`;

        // 0XXXXXXXXXX (local 11 digits) → +234XXXXXXXXXX (drop leading 0)
        if (/^0\d{10}$/.test(digits)) return `+234${digits.slice(1)}`;

        // 10 or 11 digits without prefix → assume local and prefix +234
        if (/^\d{10,11}$/.test(digits)) {
            const d = digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
            if (d.length === 10) return `+234${d}`;
        }

        return phoneNumber.trim();
    }

    static divideArray<T>(array: T[], chunkSize: number): T[][] {
        if (chunkSize <= 0) throw new Error("chunkSize must be > 0");
        const out: T[][] = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            out.push(array.slice(i, i + chunkSize));
        }
        return out;
    }

    static capitalizeFirstLetter(str: string): string {
        return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
    }

    /**
     * Normalize a phone number string into E.164 format.
     */
    static normalizePhoneNumber(phone: string): NormalizedPhone | null {
        const parsed = parsePhoneNumberFromString(phone);

        if (!parsed || !parsed.isValid()) {
            return null;
        }

        return {
            input: phone.trim(),
            e164: parsed.number, // +2348012345678
            national: parsed.formatNational(), // 0801 234 5678
            country: parsed.country as CountryCode,
            isValid: parsed.isValid()
        };
    }
}

export default DataHelper;
