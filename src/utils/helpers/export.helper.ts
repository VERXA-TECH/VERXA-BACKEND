import * as json2csv from "json2csv";

export class ExportHelper {
    /**
     * Sanitizes values to prevent CSV injection vulnerabilities.
     * Prepends a single quote if the value starts with =, +, -, or @.
     */
    static sanitizeForCsv(val: unknown): string {
        if (val === undefined || val === null) return "";
        const str = String(val);

        const probe = str.replace(/^\s+/, "");
        const isNumericLiteral = /^-?\d+(\.\d+)?$/.test(probe);

        if (/^[=+@]/.test(probe) || (probe.startsWith("-") && !isNumericLiteral)) {
            return `'${str}`;
        }
        return str;
    }

    /**
     * Converts an array of objects to a CSV string.
     * Automatically sanitizes all string values.
     */
    static toCsv<T extends Record<string, unknown>>(data: T[]): string {
        if (!data || data.length === 0) return "";

        // Pre-process data to sanitize values
        const sanitizedData = data.map((row) => {
            const newRow: Record<string, unknown> = {};
            for (const key in row) {
                if (Object.prototype.hasOwnProperty.call(row, key)) {
                    const val = row[key];

                    if (val === null || val === undefined) {
                        newRow[key] = "";
                        continue;
                    }

                    if (
                        typeof val === "string" ||
                        typeof val === "number" ||
                        typeof val === "boolean" ||
                        typeof val === "bigint"
                    ) {
                        newRow[key] = this.sanitizeForCsv(val.toString());
                        continue;
                    }

                    try {
                        newRow[key] = this.sanitizeForCsv(
                            JSON.stringify(val, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
                        );
                    } catch {
                        newRow[key] = this.sanitizeForCsv(String(val));
                    }
                }
            }
            return newRow;
        });

        const parser = new json2csv.Parser();
        return parser.parse(sanitizedData);
    }

    /**
     * Converts an array of objects to a JSON string.
     * Handles BigInt serialization.
     */
    static toJson(data: unknown): string {
        return JSON.stringify(data, (key, value) => (typeof value === "bigint" ? value.toString() : value), 2);
    }
}
