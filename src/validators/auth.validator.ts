import Joi from "joi";

export default class AuthValidator {
    static signup(data: any): Joi.ValidationResult {

        if (data.firstName) {
            data.firstName = data.firstName
                .replace(/[^A-Za-z\s-]/g, " ")
                .replace(/\s+/g, " ")
                .trim();
        }
        if (data.lastName) {
            data.lastName = data.lastName
                .replace(/[^A-Za-z\s-]/g, " ")
                .replace(/\s+/g, " ")
                .trim();
        }

        const schema = Joi.object().keys({
            firstName: Joi.string()
                .required()
                .regex(/^[A-Za-z]+(?:[ -][A-Za-z]+)*$/)
                .messages({
                    "string.empty": "First name is required.",
                    "string.pattern.base": "First name can only contain letters, spaces, and hyphens.",
                }),
            lastName: Joi.string()
                .required()
                .regex(/^[A-Za-z]+(?:[ -][A-Za-z]+)*$/)
                .messages({
                    "string.empty": "Last name is required.",
                    "string.pattern.base": "Last name can only contain letters, spaces, and hyphens.",
                }),
            email: Joi.string().email().required().messages({
                "string.empty": "Email is required.",
                "string.email": "Please provide a valid email address.",
            }),
            password: Joi.string().required().messages({
                "string.empty": "Password is required.",
            }),
            phoneNumber: Joi.string().optional().messages({
                "string.base": "Phone number must be a string.",
            }),
            country: Joi.string().optional().messages({
                "string.base": "Country must be a string.",
            }),
            referrer: Joi.string().optional().messages({
                "string.base": "Referrer must be a string.",
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
