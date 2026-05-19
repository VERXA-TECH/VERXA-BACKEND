import "express-session";
import { User as DBUser } from "../repository/user";

export { };

declare global {
    namespace Express {
        // eslint-disable-next-line @typescript-eslint/no-empty-interface
        interface User extends Partial<DBUser> { }

        interface Request {
            userId?: string;
            id?: string;
            language?: { timezone: string; textDirection: string };
            auditOptions?: {
                action?: string;
                resource?: string;
            };
        }
    }
}

declare module "express-session" {
    interface SessionData {
        userId?: string;
        deviceId?: string;
        fingerprintHash?: string;
        refreshTokenJti?: string;
        expiresAt?: number;
        preferences?: {
            language?: string;
        };
    }

    interface Session {
        preferences?: {
            language?: string;
        };
    }
}
