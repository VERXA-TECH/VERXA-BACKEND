import envConfig from "../../config/env";
import { redis } from "../../config/redis";

export default class PinHelper {
    static isValidUnlockPin(pin: string) {
        return /^\d{6}$/.test(pin);
    }

    static isValidTransactionPin(pin: string) {
        return /^\d{4}$/.test(pin);
    }

    static isValidPin(pin: string, pinType: "unlock" | "transaction") {
        return pinType === "unlock" ? this.isValidUnlockPin(pin) : this.isValidTransactionPin(pin);
    }

    static validatePin(pin: string, pinType: "unlock" | "transaction") {
        if (pinType === "unlock" && !this.isValidUnlockPin(pin)) {
            return { success: false, message: "Invalid pin. Must be a 6-digit number" };
        }
        if (pinType === "transaction" && !this.isValidTransactionPin(pin)) {
            return { success: false, message: "Invalid pin. Must be a 4-digit number" };
        }
        if (!/^\d+$/.test(pin)) {
            return { success: false, message: "Pin must be a number" };
        }
        if (this.isWeakPin(pin)) {
            return { success: false, message: "Pin is too weak" };
        }
        return { success: true, message: "Valid pin" };
    }

    static async registerFailedPinAttempt(userId: string, pinType: "unlock" | "transaction") {
        const attemptsKey = `pin:attempts:${userId}:${pinType}`;
        const totalAttemptsKey = `pin:total_attempts:${userId}:${pinType}`;
        const blockKey = `pin:block:${userId}:${pinType}`;

        await redis.incr(attemptsKey);
        const totalAttempts = await redis.incr(totalAttemptsKey);

        await redis.expire(attemptsKey, envConfig.pin.attemptTtl);
        await redis.expire(totalAttemptsKey, envConfig.pin.attemptTtl);

        let lockoutDuration = 0;
        let shouldBlock = false;

        if (totalAttempts >= 20) {
            lockoutDuration = 2 * 60 * 60;
            shouldBlock = true;
        } else if (totalAttempts === 15) {
            lockoutDuration = 1 * 60 * 60;
            shouldBlock = true;
        } else if (totalAttempts === 10) {
            lockoutDuration = 30 * 60;
            shouldBlock = true;
        } else if (totalAttempts === 5) {
            lockoutDuration = 10 * 60;
            shouldBlock = true;
        }

        if (shouldBlock) {
            await redis.set(blockKey, "1", lockoutDuration);
            await redis.del(attemptsKey);
            return { blocked: true, attempts: totalAttempts, duration: lockoutDuration };
        }

        return { blocked: false, attempts: totalAttempts };
    }

    static async checkPinBlocked(userId: string, pinType: "unlock" | "transaction"): Promise<boolean> {
        const blocked = await redis.get(`pin:block:${userId}:${pinType}`);
        return !!blocked;
    }

    static async getRemainingBlockTime(userId: string, pinType: "unlock" | "transaction"): Promise<number | null> {
        const blockKey = `pin:block:${userId}:${pinType}`;
        const ttl = await redis.ttl(blockKey);
        return ttl > 0 ? ttl : null;
    }

    static async resetPinAttempts(userId: string, pinType: "unlock" | "transaction") {
        return await Promise.all([
            redis.del(`pin:attempts:${userId}:${pinType}`),
            redis.del(`pin:total_attempts:${userId}:${pinType}`),
            redis.del(`pin:block:${userId}:${pinType}`)
        ]);
    }

    static isWeakPin(pin: string) {
        // check if all characters in the string are the same
        if (/^(\d)\1+$/.test(pin)) {
            return true;
        }

        // check sequence
        const digits = pin.split("").map(Number);

        let ascending = true;
        let descending = true;

        for (let i = 1; i < digits.length; i++) {
            if (digits[i] !== digits[i - 1] + 1) ascending = false;
            if (digits[i] !== digits[i - 1] - 1) descending = false;
        }

        if (ascending || descending) {
            return true;
        }

        return false;
    }

    static formatLockoutDuration(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (hours > 0 && minutes > 0) {
            return `${hours} hour${hours > 1 ? "s" : ""} and ${minutes} minute${minutes > 1 ? "s" : ""}`;
        } else if (hours > 0) {
            return `${hours} hour${hours > 1 ? "s" : ""}`;
        } else if (minutes > 0) {
            return `${minutes} minute${minutes > 1 ? "s" : ""}`;
        } else {
            return `${seconds} second${seconds > 1 ? "s" : ""}`;
        }
    }
}
