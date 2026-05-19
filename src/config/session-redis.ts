import { createClient } from "redis";
import envConfig from "../config/env";
import logger from "../config/logger";

const sessionRedisClient = createClient({ url: envConfig.redis.url });
logger.info("Redis session client created", {
    url: envConfig.redis.url,
    action: "redis_session_client_created"
});
sessionRedisClient.connect().catch(console.error);

export default sessionRedisClient;
