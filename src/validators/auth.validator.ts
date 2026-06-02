import z from "zod";
import envConfig from "../config/env";

const genericEmailSchema = z
    .string({ required_error: "Email is required" })
    .trim()
    .toLowerCase()
    .email("Please provide a valid email address.");

const signupEmailSchema = genericEmailSchema.refine((val) => {
    if (envConfig.env !== "development" && val.includes("+")) {
        return false;
    }
    return true;
}, {
    message: "Email address cannot contain a plus (+) symbol in production/staging."
});

const deviceInfoSchema = z.object({
    name: z.string({ required_error: "Device name is required" }).min(1, "Device name is required"),
    os: z.string({ required_error: "Device OS is required" }).min(1, "Device OS is required"),
    uniqueId: z.string({ required_error: "Device unique ID is required" }).min(1, "Device unique ID is required")
});

const signupSchema = z.object({
    email: signupEmailSchema,
    country: z.literal("NG", {
        errorMap: () => ({ message: "Only Nigeria (NG) is supported as a country code." })
    }),
    deviceInfo: deviceInfoSchema
});

const otpPurposeEnum = z.enum([
    "signup_verification",
    "login_device_verification",
    "forgot_password",
    "reset_transaction_pin",
    "update_transaction_pin",
    "disable_mfa",
    "update_user_profile"
], {
    errorMap: () => ({ message: "Invalid OTP purpose." })
});

const sendOtpSchema = z.object({
    email: genericEmailSchema,
    purpose: otpPurposeEnum
});

const validateOtpSchema = z.object({
    email: genericEmailSchema,
    otp: z.string({ required_error: "OTP is required" }).length(6, "OTP must be exactly 6 characters"),
    purpose: otpPurposeEnum,
    deviceInfo: deviceInfoSchema.optional()
});

const signinSchema = z.object({
    email: genericEmailSchema,
    password: z.string({ required_error: "Password is required" }).min(1, "Password is required"),
    "2faMethod": z.enum(["email", "auth-app"]).optional(),
    deviceInfo: deviceInfoSchema,
    rolePass: z.enum(["admin", "user"]).default("user")
});

const signinOTPSchema = z.object({
    email: genericEmailSchema,
    otp: z.string({ required_error: "OTP is required" }).min(1, "OTP is required"),
    rolePass: z.enum(["admin", "user"])
});

const completeSigninSchema = z.object({
    email: genericEmailSchema,
    otp: z.string().optional(),
    totp: z.string().optional(),
    password: z.string({ required_error: "Password is required" }).min(1, "Password is required"),
    deviceInfo: deviceInfoSchema,
    rolePass: z.enum(["admin", "user"]).default("user")
});

const forgotPasswordSchema = z.object({
    email: genericEmailSchema
});

const resetPasswordSchema = z.object({
    email: genericEmailSchema,
    otp: z.string({ required_error: "OTP is required" }).min(1, "OTP is required"),
    newPassword: z.string({ required_error: "New password is required" }).min(1, "New password is required")
});

const createPinSchema = z.object({
    pin: z.string({ required_error: "PIN is required" }).length(4, "PIN must be exactly 4 digits").regex(/^\d+$/, "PIN must be numeric")
});

const changePinSchema = z.object({
    newPin: z.string({ required_error: "New PIN is required" }).length(4, "New PIN must be exactly 4 digits").regex(/^\d+$/, "New PIN must be numeric"),
    otp: z.string({ required_error: "OTP is required" }).min(1, "OTP is required")
});

export default class AuthValidator {
    private static validate(schema: z.ZodSchema, data: any) {
        const result = schema.safeParse(data);
        if (!result.success) {
            return {
                error: {
                    message: result.error.errors[0].message
                }
            };
        }
        return { data: result.data };
    }

    static signup(data: any) {
        return this.validate(signupSchema, data);
    }

    static sendOtp(data: any) {
        return this.validate(sendOtpSchema, data);
    }

    static validateOtp(data: any) {
        return this.validate(validateOtpSchema, data);
    }

    static signin(data: any) {
        return this.validate(signinSchema, data);
    }

    static signinOTP(data: any) {
        return this.validate(signinOTPSchema, data);
    }

    static completeSignin(data: any) {
        return this.validate(completeSigninSchema, data);
    }

    static forgotPassword(data: any) {
        return this.validate(forgotPasswordSchema, data);
    }

    static resetPassword(data: any) {
        return this.validate(resetPasswordSchema, data);
    }

    static createPin(data: any) {
        return this.validate(createPinSchema, data);
    }

    static changePin(data: any) {
        return this.validate(changePinSchema, data);
    }
}
