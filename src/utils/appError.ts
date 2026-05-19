/* eslint-disable @typescript-eslint/no-explicit-any */
class AppError extends Error {
    statusCode: number;
    status: string;
    isOperational: boolean;
    metadata?: Record<string, any>;

    constructor(message: string, statusCode: number, metadata?: Record<string, any>) {
        super(message);

        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
        this.isOperational = true;
        this.metadata = metadata;

        Error.captureStackTrace(this, this.constructor);
    }
}

export default AppError;
