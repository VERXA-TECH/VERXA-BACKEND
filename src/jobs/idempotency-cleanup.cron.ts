import cron from "node-cron";
import { IdempotencyRepository } from "../repository/idempotency";
import logger from "../config/logger";
import { withOperationContext } from "../utils/loggerWithContext";

const idempotencyRepository = new IdempotencyRepository();

export function initIdempotencyCleanup() {
    cron.schedule("*/30 * * * *", async () => {
        try {
            const deletedCount = await idempotencyRepository.deleteExpiredKeys();
            logger.info(
                "idempotency.cleanup.success",
                withOperationContext("cron", {
                    deletedCount,
                    action: "idempotency_cleanup"
                })
            );
        } catch (err) {
            logger.error(
                "idempotency.cleanup.error",
                withOperationContext("cron", {
                    error: err instanceof Error ? err.message : String(err),
                    stack: err instanceof Error ? err.stack : undefined,
                    action: "idempotency_cleanup"
                })
            );
        }
    });

    logger.info(
        "idempotency.cleanup.initialized",
        withOperationContext("cron", {
            schedule: "Every 30 min",
            action: "idempotency_cleanup"
        })
    );
}
