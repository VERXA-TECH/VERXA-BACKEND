import cron from "node-cron";
// import { SwapQuoteService } from "../services/swap/quote.service";
import logger from "../config/logger";
import { withOperationContext } from "../utils/loggerWithContext";

// const swapQuoteService = new SwapQuoteService();

export function initPurgeOldQuotesJob() {
    cron.schedule("*/15 * * * *", async () => {
        try {
            // const swapResult = await swapQuoteService.purgeOldQuotes({
            //     pendingGraceMins: 120
            // });
          
            // logger.info(
            //     "housekeeping.purge_success",
            //     withOperationContext("cron", {
            //         swapResult,
            //         action: "purge_old_quotes"
            //     })
            // );
        } catch (err) {
            logger.error(
                "housekeeping.purge_error",
                withOperationContext("cron", {
                    error: err instanceof Error ? err.message : String(err),
                    stack: err instanceof Error ? err.stack : undefined,
                    action: "purge_old_quotes"
                })
            );
        }
    });

    logger.info(
        "swap.housekeeping.purge_job_initialized",
        withOperationContext("cron", {
            schedule: "Every 15 min",
            pendingGraceMins: 120,
            action: "swap_purge_old_quotes"
        })
    );
}
