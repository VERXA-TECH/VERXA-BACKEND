import z from "zod";

const usernameSchema = z
    .string({
        required_error: "Username is required",
        invalid_type_error: "Username must be a string"
    })
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username can only contain alphanumeric characters, underscores, hyphens, or dots");

const checkAvailabilitySchema = z.object({
    username: usernameSchema
});

const claimSchema = z.object({
    username: usernameSchema
});

const updateSchema = z.object({
    username: usernameSchema,
    transactionPin: z
        .string({ required_error: "Transaction PIN is required" })
        .length(4, "Transaction PIN must be exactly 4 digits")
        .regex(/^\d+$/, "Transaction PIN must be numeric")
});

export default class VerxatagValidator {
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

    static checkAvailability(data: any) {
        return this.validate(checkAvailabilitySchema, data);
    }

    static claim(data: any) {
        return this.validate(claimSchema, data);
    }

    static update(data: any) {
        return this.validate(updateSchema, data);
    }
}
