import crypto from "node:crypto";
import envConfig from "../../config/env";
import logger from "../../config/logger";

const HKDF_SALT = Buffer.from("jeroidpay-hkdf-salt-v1", "utf8");

export function deriveTypeSpecificKey(masterKeyB64: string, cipherType: string): string {
    const masterKey = Buffer.from(masterKeyB64, "base64");
    const info = `jeroidpay-cipher-${cipherType}`;
    const derivedKey = crypto.hkdfSync("sha256", masterKey, HKDF_SALT, info, 32);
    return Buffer.from(derivedKey).toString("base64");
}

export function createCipher(keyB64: string, keyName: string) {
    if (!keyB64) throw new Error(`${keyName} missing`);
    const KEY = Buffer.from(keyB64, "base64");

    return {
        encrypt(plain: string) {
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
            const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
            const tag = cipher.getAuthTag();
            return Buffer.concat([iv, tag, enc]).toString("base64");
        },
        decrypt(encB64: string) {
            const buf = Buffer.from(encB64, "base64");
            const iv = buf.slice(0, 12);
            const tag = buf.slice(12, 28);
            const enc = buf.slice(28);
            const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
            decipher.setAuthTag(tag);
            const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
            return dec.toString("utf8");
        },
    };
}

export function createVersionedCipher(cipherType: "MFA" | "PII" | "FINANCE", cipherService: any) {
    const legacyKey = cipherType === "MFA" ? envConfig.encryption.mfa_key : cipherType === "PII" ? envConfig.encryption.pii_key : envConfig.encryption.finance_key;
    const legacyCipher = createCipher(legacyKey, `${cipherType}_ENC_KEY`);

    return {
        async encrypt(plain: string): Promise<string> {
            const activeCipher = await cipherService.getActiveCipher(cipherType);
            if (!activeCipher) {
                logger.warn(`[crypto-helper] Fallback to legacy ${cipherType} cipher - versioned cipher is unavailable`);
                return legacyCipher.encrypt(plain);
            }

            const key = Buffer.from(activeCipher.key, "base64");
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
            const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
            const tag = cipher.getAuthTag();
            const ciphertext = Buffer.concat([iv, tag, enc]).toString("base64");

            return `v${activeCipher.version}:${ciphertext}`;
        },

        async decrypt(encB64: string): Promise<string> {
            if (!encB64.includes(":")) {
                logger.warn(`[crypto-helper] Fallback to legacy ${cipherType} cipher - no version prefix in ciphertext`);
                return legacyCipher.decrypt(encB64);
            }

            const [versionPart, ciphertext] = encB64.split(":", 2);
            const version = parseInt(versionPart.substring(1), 10);

            if (isNaN(version)) {
                logger.warn(`[crypto-helper] Fallback to legacy ${cipherType} cipher - invalid version format`);
                return legacyCipher.decrypt(encB64);
            }

            const specificCipher = await cipherService.getSpecificCipherVersion(cipherType, version);
            if (!specificCipher) {
                throw new Error(`Cipher version ${version} not found for type ${cipherType}`);
            }

            const key = Buffer.from(specificCipher.key, "base64");
            const buf = Buffer.from(ciphertext, "base64");
            const iv = buf.slice(0, 12);
            const tag = buf.slice(12, 28);
            const enc = buf.slice(28);
            const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
            decipher.setAuthTag(tag);
            const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
            return dec.toString("utf8");
        },
    };
}

export const MfaCipher = createCipher(envConfig.encryption.mfa_key, "MFA_ENC_KEY");
export const PiiCipher = createCipher(envConfig.encryption.pii_key, "PII_ENC_KEY");
export const FinanceCipher = createCipher(envConfig.encryption.finance_key, "FINANCE_ENC_KEY");

export const SecretCipher = MfaCipher;
