/* eslint-disable @typescript-eslint/no-explicit-any */
import admin from "firebase-admin";
import { ServiceAccount } from "firebase-admin";
import envConfig from "./env";
import logger from "./logger";

class FirebaseAdmin {
  private static instance: admin.app.App | null = null;
  private static isInitialized = false;
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY_MS = 1000;

  static async initialize(retryCount = 0): Promise<admin.app.App> {
    if (this.isInitialized && this.instance) {
      return this.instance;
    }

    try {
      const serviceAccountJson = envConfig.firebase.serviceAccountJson;

      let serviceAccount: ServiceAccount;
      try {
        serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;
      } catch (parseError) {
        throw new Error(
          `Failed to parse FIREBASE_SERVICE_ACCOUNT JSON: ${parseError instanceof Error ? parseError.message : "Invalid JSON"
          }`
        );
      }

      this.validateServiceAccount(serviceAccount);

      this.instance = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });

      this.isInitialized = true;

      logger.info("Firebase Admin SDK initialized successfully");

      return this.instance;
    } catch (error) {
      logger.error("Failed to initialize Firebase Admin SDK", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        action: "firebase_admin_sdk_initialization_failed"
      });

      if (retryCount < this.MAX_RETRIES && this.isTransientError(error)) {
        logger.warn(`Retrying Firebase initialization (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
        await this.delay(this.RETRY_DELAY_MS * (retryCount + 1));
        return this.initialize(retryCount + 1);
      }

      logger.error("Firebase Admin SDK initialization failed after retries. Application cannot start.");
      throw error;
    }
  }

  private static isTransientError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const transientErrors = ["ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "ECONNRESET", "NETWORK_ERROR"];

    return transientErrors.some((code) => error.message.includes(code));
  }

  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static getInstance(): admin.app.App {
    if (!this.instance || !this.isInitialized) {
      throw new Error("Firebase Admin SDK not initialized. Call FirebaseAdmin.initialize() first.");
    }
    return this.instance;
  }

  static getMessaging(): admin.messaging.Messaging {
    return this.getInstance().messaging();
  }

  private static validateServiceAccount(serviceAccount: any): void {
    const requiredFields = ["project_id", "private_key", "client_email"];

    const missingFields = requiredFields.filter((field) => !serviceAccount[field]);

    if (missingFields.length > 0) {
      throw new Error(`Service account is missing required fields: ${missingFields.join(", ")}`);
    }
  }

  static isInit(): boolean {
    return this.isInitialized;
  }

  /**
   * Reset instance (useful for testing)
   * Only use in test environment
   */
  static reset(): void {
    if (process.env.NODE_ENV !== "test") {
      logger.warn("FirebaseAdmin.reset() should only be used in tests");
    }

    if (this.instance) {
      this.instance.delete().catch((err) => {
        logger.error("Error deleting Firebase instance", err);
      });
    }

    this.instance = null;
    this.isInitialized = false;
  }
}

export { FirebaseAdmin };

export default admin;
