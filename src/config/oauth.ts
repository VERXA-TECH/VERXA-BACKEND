import { configureOauthPassport } from "./passport";
import logger from "../config/logger";
import { withOperationContext } from "../utils/loggerWithContext";

const requiredEnvs = [
    "GOOGLE_IOS_CLIENT_ID",
    "GOOGLE_ANDROID_CLIENT_ID",
    "GOOGLE_CALLBACK_URL",
    "APPLE_BUNDLE_ID",
    "APPLE_TEAM_ID",
    "APPLE_KEY_ID",
    "APPLE_PRIVATE_KEY"
];

logger.info("OAuth configuration initiated", {
    requiredVariables: requiredEnvs,
    action: "oauth_configuration_initiated"
});

for (const env of requiredEnvs) {
    if (!process.env[env] || process.env[env].trim() === "") {
        logger.error(
            "OAuth configuration missing required variable",
            withOperationContext("system", {
                variable: env,
                action: "oauth_config_missing_variable"
            })
        );
        throw new Error(`Required environment variable ${env} is not set`);
    } else {
        logger.debug(
            "OAuth environment variable loaded",
            withOperationContext("system", {
                variable: env,
                hasValue: true,
                valueLength: process.env[env]?.length,
                action: "oauth_variable_loaded"
            })
        );
    }
}

logger.info(
    "OAuth configuration validation successful",
    withOperationContext("system", {
        providers: ["google", "apple"],
        action: "oauth_config_validation_successful"
    })
);

configureOauthPassport();
