import Bull from "bull";
import envConfig from "../config/env";
import logger from "../config/logger";
import Redis from "ioredis";
import { withOperationContext } from "../utils/loggerWithContext";
import EmailService from "../services/email/email.service";

export interface EmailJobData {
    type: "welcome";
    email: string;
    name: string;
}

const EmailQueue: Bull.Queue<EmailJobData> = new Bull(`EMAIL-queue-${envConfig.env}`, {
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

void EmailQueue.process(async (job, done) => {
    try {
        const { type, email, name } = job.data;
        logger.info(
            `Job: email job processing [${type}] for ${email}`,
            withOperationContext("system", {
                JobId: job.id,
                email,
                type,
                action: "email_job_processing"
            })
        );

        if (type === "welcome") {
            const emailService = new EmailService();
            const success = await emailService.sendOnboardingEmail(email, name);
            if (!success) {
                throw new Error(`EmailService failed to send welcome email to ${email}`);
            }
        } else {
            throw new Error(`Unknown email job type: ${type}`);
        }

        done();
    } catch (error: any) {
        logger.error(
            "Job: email job failed",
            withOperationContext("system", {
                JobId: job.id,
                error: error instanceof Error ? error.message : "Unknown error",
                stack: error instanceof Error ? error.stack : undefined,
                action: "email_job_failed"
            })
        );
        done(error);
    }
});

export default EmailQueue;
