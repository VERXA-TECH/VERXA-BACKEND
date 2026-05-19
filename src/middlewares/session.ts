import { RedisStore } from "connect-redis";
import session from "express-session";
import envConfig from "../config/env";
import sessionRedisClient from "../config/session-redis";

export default class SessionMiddleware {
    static Session = session({
        name: "sessionId",
        secret: envConfig.session.secret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: envConfig.env === "production",
            httpOnly: true,
            maxAge: envConfig.session.cookieMaxAgeMs,
            sameSite: "strict",
            path: "/",
            domain: envConfig.session.domain,
        },
        store: new RedisStore({
            client: sessionRedisClient,
            prefix: "sess:",
            ttl: envConfig.session.cookieMaxAgeMs,
        }),
    });
}
