import { redis } from "../config/redis";
import envConfig from "../config/env";
import { UserRepository } from "../repository/user";
import AuthHelper from "../utils/helpers/auth.helper";

export class PinService {
    constructor(private userRepo: UserRepository = new UserRepository()) {}

    async verifyTransactionPin(userId: string, pin: string) {
        const user = await this.userRepo.findById(userId);
        if (!user || !user.txnPinHash) {
            return { success: false, blocked: false, attempts: 0 };
        }

        const lockoutKey = `pin:lockout:${userId}`;
        const attemptsKey = `pin:failures:${userId}`;

        const isLocked = await redis.get(lockoutKey);
        if (isLocked) {
            return { success: false, blocked: true, attempts: envConfig.pin.maxAttempts };
        }

        const isMatch = await AuthHelper.verifyBcryptPassword(pin, user.txnPinHash);
        if (isMatch) {
            await redis.del(attemptsKey);
            return { success: true };
        }

        // Increment failures
        const attemptsStr = await redis.get(attemptsKey);
        const currentAttempts = attemptsStr ? parseInt(attemptsStr) : 0;
        const newAttempts = currentAttempts + 1;

        if (newAttempts >= envConfig.pin.maxAttempts) {
            await redis.set(lockoutKey, "1", envConfig.pin.lockoutDuration);
            await redis.del(attemptsKey);
            return { success: false, blocked: true, attempts: newAttempts };
        } else {
            await redis.set(attemptsKey, newAttempts.toString(), envConfig.pin.attemptTtl);
            return { success: false, blocked: false, attempts: newAttempts };
        }
    }
}

export default PinService;
