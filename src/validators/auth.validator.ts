import Joi from "joi";
import envConfig from "../config/env";

export default class AuthValidator {
    static signup(data: any): Joi.ValidationResult {
        const schema = Joi.object().keys({
            email: Joi.string()
                .trim()
                .lowercase()
                .email()
                .required()
                .custom((value, helpers) => {
                    if (envConfig.env !== "development" && value.includes("+")) {
                        return helpers.message({ custom: "Email address cannot contain a plus (+) symbol." });
                    }
                    return value;
                })
                .messages({
                    "string.empty": "Email is required.",
                    "string.email": "Please provide a valid email address.",
                }),
            country: Joi.string()
                .required()
                .valid("NG")
                .messages({
                    "string.empty": "Country is required.",
                    "any.only": "Only Nigeria (NG) is supported as a country code.",
                }),
            deviceInfo: Joi.object()
                .required()
                .keys({
                    name: Joi.string().required().messages({
                        "string.empty": "Device name is required.",
                    }),
                    os: Joi.string().required().messages({
                        "string.empty": "Device OS is required.",
                    }),
                    uniqueId: Joi.string().required().messages({
                        "string.empty": "Device unique ID is required.",
                    }),
                })
                .messages({
                    "object.base": "Device info must be provided.",
                }),
        });

        return schema.validate(data, { abortEarly: false });
    }

    static sendOtp(data: any): Joi.ValidationResult {
        const schema = Joi.object().keys({
            email: Joi.string().email().required().messages({
                "string.empty": "Email is required.",
                "string.email": "Please provide a valid email address.",
            }),
            purpose: Joi.string()
                .required()
                .valid(
                    "signup_verification",
                    "login_device_verification",
                    "forgot_password",
                    "reset_transaction_pin",
                    "update_transaction_pin",
                    "disable_mfa",
                    "update_user_profile"
                )
                .messages({
                    "string.empty": "Purpose is required.",
                    "any.only": "Invalid OTP purpose.",
                }),
        });
        return schema.validate(data);
    }

    static validateOtp(data: any): Joi.ValidationResult {
        const schema = Joi.object().keys({
            email: Joi.string().email().required().messages({
                "string.empty": "Email is required.",
                "string.email": "Please provide a valid email address.",
            }),
            otp: Joi.string().length(6).required().messages({
                "string.empty": "OTP is required.",
                "string.length": "OTP must be exactly 6 characters.",
            }),
            purpose: Joi.string()
                .required()
                .valid(
                    "signup_verification",
                    "login_device_verification",
                    "forgot_password",
                    "reset_transaction_pin",
                    "update_transaction_pin",
                    "disable_mfa",
                    "update_user_profile"
                )
                .messages({
                    "string.empty": "Purpose is required.",
                    "any.only": "Invalid OTP purpose.",
                }),
            deviceInfo: Joi.object().optional().keys({
                name: Joi.string().required(),
                os: Joi.string().required(),
                uniqueId: Joi.string().required()
            })
        });
        return schema.validate(data);
    }

    static signin(data: any): Joi.ValidationResult {
        const schema = Joi.object().keys({
            email: Joi.string().email().required(),
            password: Joi.string().required(),
            "2faMethod": Joi.string().optional().valid("email", "auth-app"),
            deviceInfo: Joi.object().required().keys({
                name: Joi.string().required(),
                os: Joi.string().required(),
                uniqueId: Joi.string().required(),
            }),
            rolePass: Joi.string().valid("admin", "user").default("user"),
        });
        return schema.validate(data);
    }

    static signinOTP(data: any): Joi.ValidationResult {
        const schema = Joi.object().keys({
            email: Joi.string().email().required(),
            otp: Joi.string().required(),
            rolePass: Joi.string().required().valid("admin", "user"),
        });
        return schema.validate(data);
    }

    static completeSignin(data: any): Joi.ValidationResult {
        const schema = Joi.object().keys({
            email: Joi.string().email().required(),
            otp: Joi.string().optional(),
            totp: Joi.string().optional(),
            password: Joi.string().required(),
            deviceInfo: Joi.object().required().keys({
                name: Joi.string().required(),
                os: Joi.string().required(),
                uniqueId: Joi.string().required(),
            }),
            rolePass: Joi.string().valid("admin", "user").default("user"),
        });
        return schema.validate(data);
    }

  
    static forgotPassword(data: any): Joi.ValidationResult {
        const schema = Joi.object().keys({
            email: Joi.string().email().required(),
        });
        return schema.validate(data);
    }

    static resetPassword(data: any): Joi.ValidationResult {
        const schema = Joi.object().keys({
            email: Joi.string().email().required(),
            otp: Joi.string().required(),
            newPassword: Joi.string().required(),
        });
        return schema.validate(data);
    }

    static createPin(data: any): Joi.ValidationResult {
        const schema = Joi.object().keys({
            pin: Joi.string().length(4).required(),
        });
        return schema.validate(data);
    }

    static changePin(data: any): Joi.ValidationResult {
        const schema = Joi.object().keys({
            newPin: Joi.string().length(4).required(),
            otp: Joi.string().required(),
        });
        return schema.validate(data);
    }
}
