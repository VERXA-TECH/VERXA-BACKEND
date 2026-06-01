import z from "zod";
import { KycTier } from "../db/schema";

export const resetTransactionPin = z
    .object({
        otp: z
            .string({
                invalid_type_error: "otp must be a string"
            })
            .min(6, "OTP code must be at least 6 digits long")
            .max(6, "OTP code must be at most 6 digits long")
            .regex(/^\d+$/, "OTP code must be a number")
            .optional(),
        mfaCode: z
            .string({
                invalid_type_error: "mfaCode must be a string"
            })
            .min(6, "MFA code must be 6 digits")
            .max(6, "MFA code must be 6 digits")
            .regex(/^\d+$/, "MFA code must be a number")
            .optional(),
        newPin: z
            .string({
                required_error: "new pin is required",
                invalid_type_error: "new pin must be a string"
            })
            .min(4, "New transaction pin must be at least 4 digits long")
            .max(4, "New transaction pin must be at most 4 digits long")
            .regex(/^\d+$/, "New transaction pin must be a number")
    })
    .refine((data) => data.otp || data.mfaCode, {
        message: "Either otp or mfaCode must be provided",
        path: ["otp", "mfaCode"]
    });
export type ResetTransactionPinBody = z.infer<typeof resetTransactionPin>;

export const usernameSchema = z
    .string({
        required_error: "username is required",
        invalid_type_error: "username must be a string"
    })
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(/^[a-z0-9](?:[a-z0-9]{1,18}[a-z0-9])?$/, "Invalid username format")
    .transform((v) => v.toLowerCase());

export type UsernameDTO = z.infer<typeof usernameSchema>;

export const UsernameAvailabilityQuerySchema = z.object({
    username: usernameSchema
});

export const UpdateUsernameBodySchema = z.object({
    username: usernameSchema
});

export type UpdateUsernameBody = z.infer<typeof UpdateUsernameBodySchema>;

const TierEnum = z.enum([KycTier.TIER2, KycTier.TIER1], {
    required_error: "tier is required",
    invalid_type_error: "tier must be a string"
});

export const KYCAccessTokenBodySchema = z.object({
    tier: TierEnum
});

// Base schema for personal information (without OTP)
const personalInformationBaseSchema = z.object({
    firstName: z
        .string()
        .min(2, "First name must be at least 2 characters long")
        .max(50, "First name must be at most 50 characters long")
        .regex(/^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/, "First name can only contain letters, spaces, hyphens, or apostrophes"),

    lastName: z
        .string()
        .min(2, "Last name must be at least 2 characters long")
        .max(50, "Last name must be at most 50 characters long")
        .regex(/^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/, "Last name can only contain letters, spaces, hyphens, or apostrophes"),

    phoneNumber: z
        .string()
        .min(7, "Phone number must be at least 7 digits long")
        .max(15, "Phone number must be at most 15 digits long")
        .regex(/^\+?[1-9]\d{6,14}$/, "Phone number must be in valid international format (e.g. +2348012345678)"),
    email: z.string().trim().toLowerCase().email("Please provide a valid email address")
});

// Schema for update request (includes OTP)
export const personalInformationSchema = personalInformationBaseSchema;

export type PersonalInformation = z.infer<typeof personalInformationBaseSchema>;
export type PersonalInformationWithOtp = z.infer<typeof personalInformationSchema>;

export const unlockPinSchema = z
    .string({
        required_error: "Unlock pin is required",
        invalid_type_error: "Unlock pin must be a string"
    })
    .min(6, "Unlock pin must be at least 6 digits long")
    .max(6, "Unlock pin must be at most 6 digits long")
    .regex(/^\d+$/, "Unlock pin must be a number");

export const transactionPinSchema = z
    .string({
        required_error: "Transaction pin is required"
    })
    .min(4, "Transaction pin must be at least 4 digits long")
    .max(4, "Transaction pin must be at most 4 digits long")
    .regex(/^\d+$/, "Transaction pin must be a number");

export const verifyUnlockPinSchema = z.object({ pin: unlockPinSchema });
export type VerifyUnlockPinBody = z.infer<typeof verifyUnlockPinSchema>;

export const verifyTransactionPinSchema = z.object({ pin: transactionPinSchema });
export type VerifyTransactionPinBody = z.infer<typeof verifyTransactionPinSchema>;

export const updateTransactionPinSchema = z
    .object({
        otp: z
            .string({
                invalid_type_error: "otp must be a string"
            })
            .min(6, "OTP code must be at least 6 digits long")
            .max(6, "OTP code must be at most 6 digits long")
            .regex(/^\d+$/, "OTP code must be a number")
            .optional(),
        mfaCode: z
            .string({
                invalid_type_error: "mfaCode must be a string"
            })
            .min(6, "MFA code must be 6 digits")
            .max(6, "MFA code must be 6 digits")
            .regex(/^\d+$/, "MFA code must be a number")
            .optional(),
        oldPin: transactionPinSchema,
        newPin: transactionPinSchema
    })
    .refine((data) => data.otp || data.mfaCode, {
        message: "Either otp or mfaCode must be provided",
        path: ["otp", "mfaCode"]
    });
export type UpdateTransactionPinBody = z.infer<typeof updateTransactionPinSchema>;

export const updateUnlockPinSchema = z.object({
    oldPin: unlockPinSchema,
    newPin: unlockPinSchema
});
export type UpdateUnlockPinBody = z.infer<typeof updateUnlockPinSchema>;

export const resetUnlockPinSchema = z
    .object({
        otp: z
            .string({
                invalid_type_error: "otp must be a string"
            })
            .min(6, "OTP code must be at least 6 digits long")
            .max(6, "OTP code must be at most 6 digits long")
            .regex(/^\d+$/, "OTP code must be a number")
            .optional(),
        mfaCode: z
            .string({
                invalid_type_error: "mfaCode must be a string"
            })
            .min(6, "MFA code must be 6 digits")
            .max(6, "MFA code must be 6 digits")
            .regex(/^\d+$/, "MFA code must be a number")
            .optional(),
        newPin: unlockPinSchema
    })
    .refine((data) => data.otp || data.mfaCode, {
        message: "Either otp or mfaCode must be provided",
        path: ["otp", "mfaCode"]
    });
export type ResetUnlockPinBody = z.infer<typeof resetUnlockPinSchema>;

export const avatarFileSchema = z.object({
    name: z.string({
        required_error: "Avatar name is required"
    }),
    mimetype: z.enum(["image/png", "image/jpeg", "image/heic", "image/heif"], {
        required_error: "File type is required",
        invalid_type_error: "Only PNG, JPEG, HEIC, or HEIF files are allowed"
    }),
    size: z.number({ required_error: "File size is required" }).max(2 * 1024 * 1024, "File size must not exceed 2MB"),
    data: z.instanceof(Buffer, { message: "File data must be a valid Buffer" })
});
export type AvatarFile = z.infer<typeof avatarFileSchema>;

export const requestDeletionSchema = z.object({
    reason: z.enum(
        [
            "Account sign-in issues",
            "High fees",
            "Credit/Debit card purchase issues",
            "Verification difficulties",
            "Difficulty receiving support",
            "Limited crypto knowledge",
            "Complex user interface"
        ],
        {
            required_error: "Reason is required",
            invalid_type_error: "Please select a valid reason"
        }
    )
});
export type RequestDeletionBody = z.infer<typeof requestDeletionSchema>;

export const notificationPreferencesSchema = z
    .object({
        pushNotificationEnabled: z.boolean().optional(),
        emailNotificationEnabled: z.boolean().optional()
    })
    .refine((data) => Object.keys(data).length > 0, {
        message: "At least one notification preference must be provided."
    });
export type NotificationPreferencesBody = z.infer<typeof notificationPreferencesSchema>;

export const deviceTokenSchema = z.object({
    deviceId: z
        .string({
            required_error: "Device ID is required"
        })
        .trim()
        .min(1, "Device ID can not be empty")
        .max(255, "Device ID too long"),
    deviceToken: z
        .string({
            required_error: "Device token is required"
        })
        .trim()
        .min(20, "Device token is invalid")
        .max(512, "Device token too long")
        .regex(/^[A-Za-z0-9_:+/=-]+$/, "Device token is invalid")
});
export type DeviceTokenBody = z.infer<typeof deviceTokenSchema>;

export const restoreAvatarSchema = z.object({
    avatarUrl: z
        .string({
            required_error: "Avatar URL is required"
        })
        .trim()
        .url("Avatar URL must be a valid URL")
        .min(1, "Avatar URL cannot be empty")
        .max(2048, "Avatar URL is too long")
});
export type RestoreAvatarBody = z.infer<typeof restoreAvatarSchema>;

export const toggleBiometricsSchema = z.object({
    enabled: z.boolean({
        required_error: "Enabled status is required",
        invalid_type_error: "Enabled must be a boolean"
    }),
    unlockPin: unlockPinSchema
});
export type ToggleBiometricsBody = z.infer<typeof toggleBiometricsSchema>;

export default class UserValidator {
    static personalInformation(data: PersonalInformationWithOtp) {
        return personalInformationSchema.safeParse(data);
    }

    static verifyUnlockPin(data: VerifyUnlockPinBody) {
        return verifyUnlockPinSchema.safeParse(data);
    }

    static verifyTransactionPin(data: VerifyTransactionPinBody) {
        return verifyTransactionPinSchema.safeParse(data);
    }

    static updateTransactionPin(data: UpdateTransactionPinBody) {
        return updateTransactionPinSchema.safeParse(data);
    }

    static updateUnlockPin(data: UpdateUnlockPinBody) {
        return updateUnlockPinSchema.safeParse(data);
    }
    static resetUnlockPin(data: ResetUnlockPinBody) {
        return resetUnlockPinSchema.safeParse(data);
    }
    static resetTransactionPin(data: ResetTransactionPinBody) {
        return resetTransactionPin.safeParse(data);
    }
    static updateAvatar(data: AvatarFile) {
        return avatarFileSchema.safeParse(data);
    }
    static requestDeletion(data: RequestDeletionBody) {
        return requestDeletionSchema.safeParse(data);
    }
    static updateNotificationPreferences(data: NotificationPreferencesBody) {
        return notificationPreferencesSchema.safeParse(data);
    }
    static updateDeviceToken(data: DeviceTokenBody) {
        return deviceTokenSchema.safeParse(data);
    }
    static restoreAvatar(data: RestoreAvatarBody) {
        return restoreAvatarSchema.safeParse(data);
    }
    static toggleBiometrics(data: ToggleBiometricsBody) {
        return toggleBiometricsSchema.safeParse(data);
    }
    static basicProfile(data: any) {
        return basicProfileSchema.safeParse(data);
    }
    static createPassword(data: any) {
        return createPasswordSchema.safeParse(data);
    }
    static updatePurposes(data: any) {
        return userPurposesSchema.safeParse(data);
    }
}

export const basicProfileSchema = z.object({
    firstName: z
        .string({ required_error: "First name is required" })
        .min(2, "First name must be at least 2 characters long")
        .max(50, "First name must be at most 50 characters long")
        .regex(/^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/, "First name can only contain letters, spaces, hyphens, or apostrophes"),
    middleName: z
        .string()
        .max(50, "Middle name must be at most 50 characters long")
        .regex(/^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/, "Middle name can only contain letters, spaces, hyphens, or apostrophes")
        .optional()
        .nullable(),
    lastName: z
        .string({ required_error: "Last name is required" })
        .min(2, "Last name must be at least 2 characters long")
        .max(50, "Last name must be at most 50 characters long")
        .regex(/^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/, "Last name can only contain letters, spaces, hyphens, or apostrophes"),
    gender: z
        .string({ required_error: "Gender is required" })
        .min(1, "Gender is required")
        .max(20, "Gender too long"),
    phoneNumber: z
        .string({ required_error: "Phone number is required" })
        .regex(/^\+234[789][01]\d{8}$/, "Phone number must be a valid Nigerian number in international format (+234...)"),
    referralCode: z
        .string()
        .regex(/^VX-[A-Z0-9]{7}$/, "Referral code format must be VX-{7 characters}")
        .optional()
        .nullable()
        .or(z.literal(""))
});
export type BasicProfileBody = z.infer<typeof basicProfileSchema>;

export const createPasswordSchema = z
    .object({
        password: z
            .string({ required_error: "Password is required" })
            .min(8, "Password must be at least 8 characters long")
            .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
            .regex(/[0-9]/, "Password must contain at least one number")
            .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
        confirmPassword: z.string({ required_error: "Confirm password is required" })
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"]
    });
export type CreatePasswordBody = z.infer<typeof createPasswordSchema>;

export const userPurposesSchema = z.object({
    purposes: z
        .array(z.string().min(1, "Purpose cannot be empty"), { required_error: "Purposes are required" })
        .min(1, "At least one purpose must be selected")
});
export type UserPurposesBody = z.infer<typeof userPurposesSchema>;
