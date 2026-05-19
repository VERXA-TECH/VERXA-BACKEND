export const OTP_CONFIG = {
    // OTP Generation
    LENGTH: 6,
    EXPIRY_SECONDS: 120, // 2 minutes

    // Resend Limits
    MAX_RESEND_ATTEMPTS: 5,
    RESEND_WINDOW_HOURS: 2,
    RESEND_BLOCK_DURATION_HOURS: 1,

    // Validation Limits
    MAX_VERIFICATION_ATTEMPTS: 5,
    VERIFICATION_BLOCK_DURATION_HOURS: 1,

    // Redis Key Prefixes
    REDIS_KEYS: {
        OTP_PREFIX: "otp",
        RESEND_COUNT_PREFIX: "otp_resend",
        VERIFICATION_ATTEMPTS_PREFIX: "otp_attempts",
        BLOCKED_PREFIX: "otp_blocked"
    },

    // Email Templates
    EMAIL_TEMPLATES: {
        OTP: "otp-email",
        FORGOT_PASSWORD: "forgot-password",
        RESET_PASSWORD: "reset-password"
    }
} as const;

export const OTP_TYPES = {
    SIGNUP_VERIFICATION: "signup_verification",
    LOGIN_DEVICE_VERIFICATION: "login_device_verification",
    FORGOT_PASSWORD: "forgot_password",
    RESET_TRANSACTION_PIN: "reset_transaction_pin",
    UPDATE_TRANSACTION_PIN: "update_transaction_pin",
    DISABLE_MFA: "disable_mfa",
    ADMIN_UPDATE_ASSET_FEES: "admin_update_asset_fees",
    UPDATE_USER_PROFILE: "update_user_profile",
    FORGOT_UNLOCK_PIN: "forgot_unlock_pin"
} as const;

export type OtpType = typeof OTP_TYPES[keyof typeof OTP_TYPES];
