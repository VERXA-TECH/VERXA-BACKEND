import envConfig from "../../config/env";

export const EXPORT_CONFIG = {
    MAX_TRANSACTION_EXPORT_LIMIT: envConfig.admin?.exportLimit ?? 10000
};
