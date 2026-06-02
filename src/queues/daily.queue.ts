import Bull from "bull";
import envConfig from "../config/env";
import logger from "../config/logger";
import Redis from "ioredis";
import { withOperationContext } from "../utils/loggerWithContext";

const DailyQueue: Bull.Queue<Record<string, never>> = new Bull(`REPORT-queue-${envConfig.env}`, {
    createClient: (type) => {
        if (type === "client") {
            return new Redis(envConfig.redis.url, {
                enableReadyCheck: true,
                maxRetriesPerRequest: 3
            });
        }
        return new Redis(envConfig.redis.url, {
            enableReadyCheck: false,
            maxRetriesPerRequest: null
        });
    }
});

void DailyQueue.process(async (job, done) => {
    try {
        logger.info(
            "Job: daily job running",
            withOperationContext("cron", {
                JobId: job.id,
                action: "daily_job_running"
            })
        );
        done();
    } catch (error: any) {
        logger.info(
            "Job: daily job failed",
            withOperationContext("cron", {
                JobId: job.id,
                error: error instanceof Error ? error.message : "Unknown error",
                stack: error instanceof Error ? error.stack : undefined,
                action: "daily_job_failed"
            })
        );
        done(error);
    }
});

export default DailyQueue;
