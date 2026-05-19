import { usernameRegex } from "../../config/username.regex";

export default class UsernameNormalizer {
    static normalize(username: string): string {
        let normalized = username.replace(/^@/, "").toLowerCase();
        normalized = normalized.replace(/[^a-z0-9]/g, "");
        return normalized;
    }
    static validate(username: string): boolean {
        return usernameRegex.Storage_Pattern.test(username);
    }

    static formatDisplayName(username: string): string {
        return `@${username}`;
    }
}
