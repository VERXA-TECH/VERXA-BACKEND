/* eslint-disable @typescript-eslint/no-explicit-any */

import logger from "../config/logger";
import { withOperationContext } from "../utils/loggerWithContext";

const toNumber = (v: any, d: number) => (v == null || v === "" ? d : Number(v));

function requireEnv(name: string, value: string | undefined): string {
    if (!value) {
        logger.error(
            "Critical environment variable missing",
            withOperationContext("system", {
                variable: name,
                action: "environment_variable_missing"
            })
        );
        console.error(`Environment variable ${name} is not set`);
        process.exit(1);
    }
    return value;
}

function parseEnvArray(value: string | undefined, defaultValue: string[]): string[] {
    const arr = value?.split(",");
    if (!arr) {
        return defaultValue;
    }
    return arr.map((v) => v.trim());
}

function parseDbUrl(dbUrl: string) {
    try {
        const u = new URL(dbUrl);
        const host = u.hostname;
        const port = toNumber(u.port || 5432, 5432);
        const user = decodeURIComponent(u.username || "");
        const password = decodeURIComponent(u.password || "");
        const name = (u.pathname || "").replace(/^\//, "");
        const sslMode = u.searchParams.get("sslmode");
        const ssl = process.env.DB_SSL === "true" || sslMode === "require" || sslMode === "verify-full";

        logger.debug("Database connection details loaded", {
            host: host,
            port: port,
            name: name,
            ssl: ssl,
            action: "database_connection_details_loaded"
        });

        return { url: dbUrl, host, port, user, password, name, ssl };
    } catch {
        return null;
    }
}

const DB_URL = process.env.DB_URL || process.env.DATABASE_URL;

const parsed = DB_URL ? parseDbUrl(DB_URL) : null;

const envConfig = {
    baseUrl: process.env.BASE_URL || "http://localhost:5001",
    adminClientUrl: process.env.ADMIN_CLIENT_URL || "http://localhost:3000",
    trustProxy: process.env.TRUST_PROXY
        ? Number(process.env.TRUST_PROXY)
        : process.env.NODE_ENV === "production"
            ? 1
            : false,

    encryption: {
        key: process.env.ENCRYPTION_KEY!,
        mfa_key: requireEnv("MFA_ENC_KEY", process.env.MFA_ENC_KEY!),
        pii_key: requireEnv("PII_ENC_KEY", process.env.PII_ENC_KEY!),
        finance_key: requireEnv("FINANCE_ENC_KEY", process.env.FINANCE_ENC_KEY!),
        master_key: requireEnv("MASTER_ENC_KEY", process.env.MASTER_ENC_KEY!)
    },

    cipher: {
        rotationMonths: toNumber(process.env.CIPHER_ROTATION_MONTHS, 6),
        rotationCron: process.env.CIPHER_ROTATION_CRON || "0 2 1 * *",
        types: parseEnvArray(process.env.CIPHER_TYPES, ["MFA", "PII", "FINANCE"])
    },

    env: process.env.NODE_ENV || "development",

    timezone: process.env.TIMEZONE || "Africa/Lagos",

    jwt: {
        secret: requireEnv("JWT_SECRET", process.env.JWT_SECRET),
        expiresIn: process.env.JWT_EXPIRES_IN || "1d",
        issuer: process.env.JWT_ISSUER || "verxa",
        audience: process.env.JWT_AUDIENCE || "verxa-users",
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d"
    },

    pin: {
        maxAttempts: toNumber(process.env.PIN_MAX_ATTEMPTS, 5),
        lockoutDuration: toNumber(process.env.PIN_LOCKOUT_DURATION, 60 * 60),
        attemptTtl: toNumber(process.env.PIN_ATTEMPT_TTL, 60 * 60)
    },
    bcryptSaltRounds: 11,

    session: {
        domain: process.env.SESSION_DOMAIN || "localhost",
        secret: requireEnv("SESSION_SECRET", process.env.SESSION_SECRET),
        cookieName: process.env.SESSION_COOKIE_NAME || "sid",
        cookieMaxAgeMs: toNumber(process.env.SESSION_COOKIE_MAX_AGE_MS, 1000 * 60 * 60 * 24 * 7) // 7 days
    },

    device: {
        verificationInterval: 1000 * 60 * 60 * 24 * 30 // 30 days
    },

    db: {
        url: parsed?.url,
        host: parsed?.host || requireEnv("DB_HOST", process.env.DB_HOST),
        port: parsed?.port ?? toNumber(requireEnv("DB_PORT", process.env.DB_PORT), 5432),
        name: parsed?.name || requireEnv("DB_NAME", process.env.DB_NAME),
        user: parsed?.user || requireEnv("DB_USER", process.env.DB_USER),
        password: parsed?.password || requireEnv("DB_PASSWORD", process.env.DB_PASSWORD),
        ssl: process.env.DB_SSL === "true" || (parsed?.ssl ?? false),
        pool: {
            min: toNumber(process.env.DB_POOL_MIN, 2),
            max: toNumber(process.env.DB_POOL_MAX, 10),
            idleTimeoutMillis: toNumber(process.env.DB_IDLE_TIMEOUT_MS, 10000)
        }
    },

    email: {
        // Email provider selection: 'sendgrid' | 'smtp' | 'ses'
        provider: process.env.EMAIL_PROVIDER || "sendgrid",

        from: process.env.SMTP_FROM || "me@shodipoayomide.com",
        fromName: process.env.SMTP_FROM_NAME || "Verxa",
        adminEmail: process.env.ADMIN_EMAIL || "admin@verxa.com",
        supportEmail: process.env.SUPPORT_EMAIL || "support@verxa.com",

        sendgridApiKey: process.env.SENDGRID_API_KEY || "",
        sendgridWebhookSecret: process.env.SENDGRID_WEBHOOK_SECRET || "",

        smtp: {
            host: process.env.SMTP_EMAIL_HOST || process.env.SMTP_HOST || "smtp.sendgrid.net",
            port: toNumber(process.env.SMTP_EMAIL_PORT || process.env.SMTP_PORT, 587),
            secure: process.env.SMTP_SECURE === "true" || toNumber(process.env.SMTP_EMAIL_PORT, 587) === 465,
            user: process.env.SMTP_EMAIL_USER || process.env.SMTP_USER || "apikey",
            password: process.env.SMTP_EMAIL_PASSWORD || process.env.SMTP_PASSWORD || ""
        },

        ses: {
            region: process.env.AWS_SES_REGION || process.env.AWS_REGION || "",
            profile: process.env.AWS_SES_PROFILE || process.env.AWS_PROFILE || ""
        },

        host: process.env.SMTP_HOST || "smtp.sendgrid.net",
        port: toNumber(process.env.SMTP_PORT, 587),
        secure: process.env.SMTP_SECURE === "true",
        user: process.env.SMTP_USER || "apikey",
        password: process.env.SMTP_PASSWORD || ""
    },
    storage: {
        provider: (process.env.STORAGE_PROVIDER as any) || "backblaze",
        s3: {
            bucketName: process.env.AWS_S3_BUCKET_NAME || "",
            region: process.env.AWS_S3_REGION || process.env.AWS_REGION || "",
            profile: process.env.AWS_S3_PROFILE || process.env.AWS_PROFILE || "",
            cloudfrontDomain: process.env.AWS_CLOUDFRONT_DOMAIN || ""
        }
    },

    redis: {
        url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
        telegramTokenTtl: toNumber(process.env.TELEGRAM_TOKEN_TTL, 900)
    },

    coinmarketcap: {
        apiKey: requireEnv("COINMARKETCAP_API_KEY", process.env.COINMARKETCAP_API_KEY!),
        baseURL: process.env.COINMARKETCAP_BASE_URL ?? "https://pro-api.coinmarketcap.com",
        timeoutMs: 20_000
    },
    fixer: {
        apiKey: requireEnv("FIXER_API_KEY", process.env.FIXER_API_KEY),
        baseURL: process.env.FIXER_BASE_URL ?? "https://data.fixer.io/api",
        timeoutMs: 20_000
    },
    aws: {
        region: process.env.AWS_REGION || "",
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
        profile: process.env.AWS_PROFILE || "",
        sesConfigurationSet: process.env.AWS_SES_CONFIGURATION_SET || "default"
    },
    firebase: {
        serviceAccountJson: requireEnv("FIREBASE_SERVICE_ACCOUNT", process.env.FIREBASE_SERVICE_ACCOUNT)
    },
   

    adminEmail: process.env.ADMIN_EMAIL || "admin@verxa.com",
    adminPassword: process.env.ADMIN_PASSWORD,
    adminUsername: process.env.ADMIN_USERNAME || "admin",
    adminFirstName: process.env.ADMIN_FIRST_NAME || "Admin",
    adminLastName: process.env.ADMIN_LAST_NAME || "Admin",
    admin: {
        exportLimit: toNumber(process.env.ADMIN_EXPORT_LIMIT, 10000)
    },
    reconciliation: {
        highVolumeThreshold: parseInt(process.env.RECONCILIATION_HIGH_VOLUME_THRESHOLD || "5000000", 10),
        batchSize: toNumber(process.env.RECONCILIATION_BATCH_SIZE, 1000)
    },
    currencyapi: {
        apiKey: requireEnv("CURRENCYAPI_API_KEY", process.env.CURRENCYAPI_API_KEY)
    },
    telegram: {
        botToken: requireEnv("TELEGRAM_BOT_TOKEN", process.env.TELEGRAM_BOT_TOKEN),
        webHookSecret: requireEnv("TELEGRAM_WEBHOOK_SECRET", process.env.TELEGRAM_WEBHOOK_SECRET),
        botUsername: process.env.TELEGRAM_BOT_USERNAME || "VerxaBot",
        supportEmail: process.env.TELEGRAM_SUPPORT_EMAIL || "support@verxa.com"
    },

    audit: {
        // Signing key for cryptographic hash chain: (HMAC-SHA256)
        signingKey: requireEnv("AUDIT_SIGNING_KEY", process.env.AUDIT_SIGNING_KEY),
        ipHashSalt: requireEnv("AUDIT_IP_HASH_SALT", process.env.AUDIT_IP_HASH_SALT)
    },

    invitation: {
        expiresInMs: toNumber(process.env.ADMIN_INVITE_EXPIRES_MS, 24 * 60 * 60 * 1000) // 24 hours default
    },
    security: {
        alertEmail: process.env.SECURITY_ALERT_EMAIL || process.env.ADMIN_EMAIL || "security@verxa.com",
        escalationEmail: process.env.ESCALATION_EMAIL || process.env.ADMIN_EMAIL || "security@verxa.com"
    },
    socket: {
        allowedOrigins: parseEnvArray(process.env.SOCKET_ALLOWED_ORIGINS, [])
    },
    
    cors: {
        allowedOrigins: parseEnvArray(
            process.env.ALLOWED_CORS_ORIGINS,
            process.env.NODE_ENV === "production" ? [] : ["http://localhost:3000"]
        )
    },
    
};

export default envConfig;
