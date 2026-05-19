import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import envConfig from "../config/env";
import logger from "../config/logger";
import { withOperationContext } from "../utils/loggerWithContext";
import AuthHelper from "../utils/helpers/auth.helper";
import { users, Role } from "../db/schema/users.schema";
import db from "../config/db";
import { eq } from "drizzle-orm";

export class SocketService {
    private static instance: SocketService;
    private io: Server | null = null;

    private constructor() {}

    static getInstance(): SocketService {
        if (!SocketService.instance) {
            SocketService.instance = new SocketService();
        }
        return SocketService.instance;
    }

    init(server: HttpServer) {
        if (this.io) {
            return;
        }

        this.io = new Server(server, {
            cors: {
                origin: envConfig.socket.allowedOrigins.length > 0 ? envConfig.socket.allowedOrigins : false,
                methods: ["GET", "POST"]
            }
        });

        // Authentication Middleware
        this.io.use(async (socket, next) => {
            try {
                const authHeader = socket.handshake.headers?.authorization;
                const authValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;

                const token =
                    socket.handshake.auth?.token ??
                    (typeof authValue === "string" && authValue.toLowerCase().startsWith("bearer ")
                        ? authValue.slice(7).trim()
                        : undefined);

                if (!token) {
                    logger.warn(
                        "Socket connection rejected: No token provided",
                        withOperationContext("system", { socketId: socket.id, action: "socket_auth_failed" })
                    );
                    return next(new Error("Authentication error"));
                }

                const decoded = await AuthHelper.verifyAndDecodeToken(token);

                const [user] = await db.select().from(users).where(eq(users.id, decoded.id)).limit(1);

                if (!user || (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN)) {
                    logger.warn(
                        "Socket connection rejected: Insufficient permissions",
                        withOperationContext("system", {
                            socketId: socket.id,
                            userId: decoded.id,
                            action: "socket_auth_failed"
                        })
                    );
                    return next(new Error("Authentication error"));
                }

                socket.data.user = user;
                next();
            } catch (error) {
                logger.error(
                    "Socket authentication error",
                    withOperationContext("system", {
                        socketId: socket.id,
                        error: error instanceof Error ? error.message : "Unknown error",
                        action: "socket_auth_error"
                    })
                );
                next(new Error("Authentication error"));
            }
        });

        this.io.on("connection", (socket: Socket) => {
            logger.info(
                "New socket connection",
                withOperationContext("system", {
                    socketId: socket.id,
                    userId: socket.data.user?.id,
                    action: "socket_connected"
                })
            );

            socket.on("join_admin", async () => {
                await socket.join("admin_dashboard");
                logger.info(
                    "Socket joined admin dashboard",
                    withOperationContext("system", { socketId: socket.id, room: "admin_dashboard" })
                );
            });

            socket.on("disconnect", () => {
                logger.info(
                    "Socket disconnected",
                    withOperationContext("system", { socketId: socket.id, action: "socket_disconnected" })
                );
            });
        });

        logger.info("Socket.IO initialized");
    }

    broadcast(event: string, data: unknown) {
        if (this.io) {
            this.io.emit(event, data);
        }
    }

    to(room: string, event: string, data: unknown) {
        if (this.io) {
            this.io.to(room).emit(event, data);
        }
    }
}

export const socketService = SocketService.getInstance();
