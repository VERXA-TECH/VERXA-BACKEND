export class NameCompare {
    private static normalize(s: string): string {
        return s
            .toLowerCase()
            .normalize("NFKD")
            .replace(/\p{M}+/gu, "") // remove diacritics
            .replace(/[^a-z0-9\s]/g, " ") // drop punctuation/symbols
            .replace(/\s+/g, " ") // collapse spaces
            .trim();
    }

    private static tokenize(s: string): string[] {
        const n = this.normalize(s);
        return n ? n.split(" ") : [];
    }

    static compareName(values: [string, string], compareWith: string): boolean {
        const [v1, v2] = values.map((v) => this.normalize(v));
        if (!v1 || !v2) return false;

        const targetTokens = new Set(this.tokenize(compareWith));

        // Helper: token present OR initial matches (e.g., "johnson" ~ "j")
        const presentOrInitial = (token: string): boolean => {
            if (targetTokens.has(token)) return true;
            return token.length > 1 && targetTokens.has(token[0]);
        };

        return presentOrInitial(v1) && presentOrInitial(v2);
    }
}
