// // /* eslint-disable @typescript-eslint/no-explicit-any */
// // import { customAlphabet } from "nanoid";
// // import { PromoRepository } from "../../repository/promo";
// // import { UserRepository } from "../../repository/user";
// // import { ReferralRewardRepository } from "../../repository/rewards";
// // import { RewardStatus } from "../../db/schema/rewards.schema";
// // import { FraudService } from "../security/fraud.service";
// // import AppError from "../../utils/appError";
// // import ResponseHelper from "../../utils/helpers/response.helper";
// // import logger from "../../config/logger";
// // import Decimal from "decimal.js";
// // import { withContext, withOperationContext } from "../../utils/loggerWithContext";
// // import NotificationService from "../notification/notification.service";
// // import { NotificationCategory } from "../../db/schema/notifications.schema";
// // import { ConfigService } from "../admin/config.service";
// // import { TransactionsRepository } from "../../repository/transaction";
// // import { withReferenceRetry } from "../../utils/helpers/transaction.helper";
// // import { DbClient, getDb } from "../../config/db";
// // import { AssetCatalogRepository } from "../../repository/asset-catalogue";
// // import { toUnifiedMinor, fromLedgerMinor } from "../../utils/helpers/asset.helper";
// // import { redemption_history, RedemptionStatus } from "../../db/schema/finance/redemption-history.schema";
// // import { LedgerRepository } from "../../repository/ledger";
// // import { ACCT } from "../../utils/constants/ledger/account-codes";
// // import { UserAssetBalanceRepository } from "../../repository/user-asset-balance";
// // import { UserReferralBalanceRepository } from "../../repository/user-referral-balance";
// // import { TransactionType, TransactionStatus } from "../../types/transaction.types";
// // import { RedemptionHistoryRepository } from "../../repository/redemption-history";
// // import { KycRepository } from "../../repository/kyc";
// // import { KycTier } from "../../db/schema/kyc/kyc.schema";
// // import { FeatureFlag } from "../../utils/constants/features";

// const generateRefCode = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 5);
// const BATCH_SIZE = 25;
// const DEFAULT_MIN_REDEEM_USDT = new Decimal(10);
// const REWARD_CURRENCY = "USDT";

// export type ReferralContext = {
//     referrerId: string;
//     promoId?: string | null;
//     rewardAmount: Decimal;
//     source: "promo" | "referral";
// };

// export default class ReferralService {
//     private readonly maxGenerationAttempts = 10;
//     private readonly referralRewardCurrency = REWARD_CURRENCY;
//     private configService = new ConfigService();

//     constructor(
//         private userRepository = new UserRepository(),
//         private promoRepository = new PromoRepository(),
//         private rewardRepository = new ReferralRewardRepository(),
//         private fraudService = new FraudService(),
//         private notificationService = new NotificationService(),
//         private userReferralBalanceRepository = new UserReferralBalanceRepository(),
//         private transactionRepository = new TransactionsRepository(),
//         private redemptionRepo = new RedemptionHistoryRepository(),
//         private kycRepo = new KycRepository(),
//     ) {}

//     private generateReferralCode(): string {
//         return generateRefCode();
//     }

//     isValidReferralCode(code: string): boolean {
//         const isValid = /^[A-Z]{5}$/.test(code);
//         logger.debug(`Validating referral code: ${code}, valid: ${isValid}`);
//         return isValid;
//     }

//     async generateUniqueReferralCode(length = 5): Promise<string> {
//         return await this.userRepository.generateUniqueReferralCode(length);
//     }

//     private async getMinRedemptionAmount(): Promise<Decimal> {
//         const config = await this.configService.getReferralRules();
//         return new Decimal(config.minRedemptionAmountUsdt ?? DEFAULT_MIN_REDEEM_USDT);
//     }

//     /**
//      * Validate and get referrer info
//      */
//     /**
//      * Resolve referral context
//      */
//     async resolveReferralContext(referralCode: string): Promise<ReferralContext | null> {
//         if (!referralCode) return null;

//         const trimmed = referralCode.trim();
//         const config = await this.configService.getReferralRules();
//         const defaultReward = config.defaultReferralRewardUsdt || 5;
//         const ambassadorReward = config.ambassadorRewardUsdt || 10;

//         // 1. Check for ambassador promo code
//         const promo = await this.promoRepository.findActiveByCodeInsensitive(trimmed);
//         if (promo) {
//             const ambassador = await this.userRepository.getById(promo.userId);

//             // If referrer is disabled or account is inactive, we proceed WITHOUT linking (return null)
//             if (!ambassador || !ambassador.referralEnabled || !ambassador.isActive) {
//                 logger.info(`Referral code ${trimmed} belongs to a disabled user ${promo.userId}`, {
//                     referralCode: trimmed,
//                     userId: promo.userId,
//                 });
//                 return null;
//             }

//             const reward = promo.customRewardAmount
//                 ? parseFloat(promo.customRewardAmount.toString())
//                 : ambassadorReward;

//             return {
//                 referrerId: ambassador.id,
//                 promoId: promo.id,
//                 rewardAmount: new Decimal(reward),
//                 source: "promo",
//             };
//         }

//         // 2. Check for user referral code
//         const normalized = trimmed.toUpperCase();
//         if (!this.isValidReferralCode(normalized)) {
//             logger.info(`Referral code ${normalized} has an invalid format`, {
//                 referralCode: normalized,
//             });
//             return null;
//         }

//         const referrer = await this.userRepository.findByReferralCode(normalized);
//         if (referrer) {
//             // If referrer is disabled or account is inactive, we proceed WITHOUT linking (return null)
//             if (!referrer.referralEnabled || !referrer.isActive) {
//                 logger.info(`Referral code ${normalized} belongs to a disabled or inactive user ${referrer.id}`, {
//                     referralCode: normalized,
//                     referrerId: referrer.id,
//                 });
//                 return null;
//             }

//             let reward = defaultReward;
//             if (referrer.isAmbassador) {
//                 // Check if they have a promo code with a custom reward
//                 const ambassadorPromo = await this.promoRepository.findByUserId(referrer.id);
//                 reward =
//                     ambassadorPromo && ambassadorPromo.customRewardAmount
//                         ? parseFloat(ambassadorPromo.customRewardAmount.toString())
//                         : ambassadorReward;
//             }

//             return {
//                 referrerId: referrer.id,
//                 rewardAmount: new Decimal(reward),
//                 source: "referral",
//             };
//         }

//         // 3. If we reached here, it's a typo (code not found in either table)
//         logger.info(`Referral code ${normalized} not found in promos or users`, {
//             referralCode: normalized,
//         });
//         return null;
//     }

//     async createPendingRewardAfterSignup(
//         newUserId: string,
//         refContext: ReferralContext,
//         tx?: DbClient,
//     ): Promise<string | null> {
//         if (newUserId === refContext.referrerId) {
//             logger.warn(
//                 "Self-referral attempt blocked",
//                 withContext({
//                     userId: newUserId,
//                     action: "self_referral_blocked",
//                 }),
//             );
//             return null;
//         }

//         const rewardData = {
//             referredUserId: newUserId,
//             referrerUserId: refContext.referrerId,
//             promoId: refContext.promoId ?? null,
//             rewardAmount: refContext.rewardAmount.toString(),
//             rewardCurrency: this.referralRewardCurrency,
//             rewardStatus: RewardStatus.PENDING,
//             fraudScore: 0,
//             fraudReason: "none",
//             status: "pending" as const,
//         };

//         const createdReward = await this.rewardRepository.create(rewardData, tx);

//         if (refContext.promoId) {
//             await this.promoRepository.incrementTotalSignups(refContext.promoId, tx);
//         }

//         return createdReward.id;
//     }

//     // async completeReferralSignupProcessing(
//     //     newUserId: string,
//     //     refContext: ReferralContext,
//     //     rewardId: string,
//     //     metadata?: Record<string, any>,
//     // ) {
//     //     try {
//     //         const fraudResult = await this.fraudService.assessReferral(refContext.referrerId, newUserId, rewardId);

//     //         logger.debug(
//     //             "Referral processed successfully",
//     //             withContext({
//     //                 newUserId: newUserId,
//     //                 referrerId: refContext.referrerId,
//     //                 rewardId,
//     //                 fraudScore: fraudResult.fraudScore,
//     //                 status: fraudResult.status,
//     //                 action: "referral_processed",
//     //             }),
//     //         );

//     //         const newUser = await this.userRepository.findById(newUserId);
//     //         if (newUser) {
//     //             const username = newUser.username || "A new user";
//     //             this.notificationService
//     //                 .sendPushViaOneSignal(refContext.referrerId, {
//     //                     title: "New Referral Signup",
//     //                     body: `${username} just joined JeroidPay using your referral link!`,
//     //                     data: {
//     //                         type: "REFERRAL_SIGNUP",
//     //                         newUserId: newUserId,
//     //                     },
//     //                 })
//     //                 .catch((err) => logger.error("Failed to send referral signup push", { err }));

//     //             await this.notificationService.sendInAppNotificationToUser(refContext.referrerId, {
//     //                 title: "New Referral Signup",
//     //                 message: `${username} just joined JeroidPay using your referral link!`,
//     //                 category: NotificationCategory.GENERAL,
//     //             });
//     //         }

//     //         return {
//     //             rewardId,
//     //             fraudAssessment: fraudResult,
//     //         };
//     //     } catch (error) {
//     //         logger.error(
//     //             "Failed to process referral for user ",
//     //             withContext({
//     //                 newUserId: newUserId,
//     //                 error: error instanceof Error ? error.message : "Unknown error",
//     //                 stack: error instanceof Error ? error.stack : undefined,
//     //                 metadata,
//     //                 action: "referral_processing_failed",
//     //             }),
//     //         );
//     //         throw error;
//     //     }
//     // }

//     /**
//      * Process referral after signup
//      */
//     // async processReferralAfterSignup(newUserId: string, refContext: ReferralContext, metadata?: Record<string, any>) {
//     //     try {
//     //         const isEnabled = await this.configService.isFeatureEnabled(FeatureFlag.REFERRAL);
//     //         if (!isEnabled) {
//     //             logger.info("Referral program is disabled, skipping reward creation");
//     //             return;
//     //         }

//     //         const rewardId = await this.createPendingRewardAfterSignup(newUserId, refContext);
//     //         if (!rewardId) return;

//     //         return await this.completeReferralSignupProcessing(newUserId, refContext, rewardId, metadata);
//     //     } catch (error) {
//     //         logger.error(
//     //             "Failed to process referral for user ",
//     //             withContext({
//     //                 newUserId: newUserId,
//     //                 error: error instanceof Error ? error.message : "Unknown error",
//     //                 stack: error instanceof Error ? error.stack : undefined,
//     //                 action: "referral_processing_failed",
//     //             }),
//     //         );
//     //         throw error;
//     //     }
//     // }

//     // async markUserAsAmbassador(userId: string, isAmbassador: boolean) {
//     //     logger.debug("User ambassador status updated", {
//     //         userId: userId,
//     //         isAmbassador: isAmbassador,
//     //         action: "referral_ambassador_status_updated",
//     //     });
//     //     await this.userRepository.updateAmbassadorStatus(userId, isAmbassador);
//     // }

//     // async getUserReferralStats(userId: string) {
//     //     const [referralBalance, withdrawn, earned, invitedCount, user, minRedemptionAmount] = await Promise.all([
//     //         this.userReferralBalanceRepository.getBalance(userId),
//     //         this.rewardRepository.getTotalWithdrawn(userId),
//     //         this.rewardRepository.getTotalEarned(userId),
//     //         this.rewardRepository.getInvitedUsersCount(userId),
//     //         this.userRepository.getById(userId),
//     //         this.getMinRedemptionAmount(),
//     //     ]);

//     //     const currency = this.referralRewardCurrency;
//     //     const availableMinor = BigInt(referralBalance?.availableMinor ?? "0");
//     //     const available = fromLedgerMinor(availableMinor);

//     //     let referralCode = user.referralCode;
//     //     if (user.isAmbassador) {
//     //         const promo = await this.promoRepository.findByUserId(userId);
//     //         if (promo && promo.isActive) {
//     //             referralCode = promo.code;
//     //         }
//     //     }

//     //     return {
//     //         redeemableRewards: { amount: available.toFixed(2), currency },
//     //         lifetimeEarnings: { amount: earned.toFixed(2), currency },
//     //         availableRewards: { amount: available.toFixed(2), currency },
//     //         redemptionHistoryTotal: { amount: withdrawn.toFixed(2), currency },
//     //         minRedemptionAmount: { amount: minRedemptionAmount.toFixed(2), currency },
//     //         invitedUsersCount: invitedCount,
//     //         referralCode,
//     //     };
//     // }

//     // async getUserReferralHistory(userId: string, page = 1, pageSize = 10, rewardStatus?: RewardStatus) {
//     //     const offset = (page - 1) * pageSize;

//     //     const [history, totalCount] = await Promise.all([
//     //         this.rewardRepository.getReferralHistory(userId, pageSize, offset, rewardStatus),
//     //         this.rewardRepository.getReferralHistoryCount(userId, rewardStatus),
//     //     ]);

//     //     return {
//     //         page,
//     //         pageSize,
//     //         total: totalCount,
//     //         history,
//     //     };
//     // }

//     // async getReferralStats(userId: string) {
//     //     const user = await this.userRepository.getById(userId);
//     //     if (!user) {
//     //         throw new AppError("User not found", ResponseHelper.RESOURCE_NOT_FOUND);
//     //     }

//     //     const referralStats = await this.userRepository.getReferralStats(userId);
//     //     const countryBreakdown = await this.userRepository.getReferralBreakdownByCountry(userId);
//     //     const monthlyTrends = await this.userRepository.getReferralMonthlyTrends(userId);

//     //     let promoCodeStats = null;
//     //     if (user.isAmbassador) {
//     //         const promoCode = await this.promoRepository.findByUserId(userId);
//     //         if (promoCode) {
//     //             promoCodeStats = {
//     //                 code: promoCode.code,
//     //                 totalSignups: promoCode.totalSignups,
//     //                 isActive: promoCode.isActive,
//     //                 createdAt: promoCode.createdAt,
//     //                 revokedAt: promoCode.revokedAt,
//     //             };
//     //         }
//     //     }

//     //     const stats = {
//     //         user: {
//     //             id: user.id,
//     //             email: user.email,
//     //             referralCode: user.referralCode,
//     //             isAmbassador: user.isAmbassador,
//     //             createdAt: user.createdAt,
//     //         },
//     //         referrals: {
//     //             total: referralStats.total,
//     //             verified: referralStats.verified,
//     //             recent: referralStats.recent,
//     //             verificationRate: this.calculateVerificationRate(referralStats.verified, referralStats.total),
//     //         },
//     //         promoCode: promoCodeStats,
//     //         breakdown: {
//     //             byCountry: countryBreakdown,
//     //         },
//     //         trends: {
//     //             monthly: monthlyTrends,
//     //         },
//     //     };

//     //     return stats;
//     // }

//     // private calculateVerificationRate(verified: number, total: number): number {
//     //     if (total === 0) return 0;
//     //     return Math.round((verified / total) * 100 * 100) / 100;
//     // }

//     // /**
//     //  * Get fraud statistics
//     //  */
//     // async getFraudStats() {
//     //     return await this.fraudService.getFraudStats();
//     // }

//     // private async notifyReferralRewardAvailable(reward: Awaited<ReturnType<ReferralRewardRepository["getById"]>>) {
//     //     if (!reward) return;

//     //     const referrer = await this.userRepository.findById(reward.referrerUserId);
//     //     if (!referrer) return;

//     //     this.notificationService
//     //         .sendInAppNotificationToUser(referrer.id, {
//     //             title: "Referral Reward Available!",
//     //             message: `Your referral reward of ${reward.rewardAmount} ${reward.rewardCurrency} is now eligible for redemption!`,
//     //             category: NotificationCategory.GENERAL,
//     //         })
//     //         .catch(() => null);
//     //     this.notificationService
//     //         .sendPushViaOneSignal(referrer.id, {
//     //             title: "Referral Reward Available!",
//     //             body: `Your referral reward of ${reward.rewardAmount} ${reward.rewardCurrency} is now eligible for redemption!`,
//     //         })
//     //         .catch(() => null);
//     // }

//     // private async completeRewardIfEligible(
//     //     reward: Awaited<ReturnType<ReferralRewardRepository["getById"]>>,
//     //     threshold: Decimal,
//     //     caches?: {
//     //         referrerCache?: Map<string, any>;
//     //         kycCache?: Map<string, any>;
//     //     },
//     // ): Promise<string | null> {
//     //     if (!reward || reward.rewardStatus !== RewardStatus.PENDING || reward.status !== "safe") {
//     //         return null;
//     //     }

//     //     const [netDepositUsd, kycProfile, referrer] = await Promise.all([
//     //         this.transactionRepository.getNetDepositUsd(reward.referredUserId),
//     //         (() => {
//     //             if (caches?.kycCache?.has(reward.referredUserId)) {
//     //                 return caches.kycCache.get(reward.referredUserId);
//     //             }
//     //             const p = this.kycRepo.getProfile(reward.referredUserId);
//     //             caches?.kycCache?.set(reward.referredUserId, p);
//     //             return p;
//     //         })(),
//     //         (() => {
//     //             if (caches?.referrerCache?.has(reward.referrerUserId)) {
//     //                 return caches.referrerCache.get(reward.referrerUserId);
//     //             }
//     //             const p = this.userRepository.getById(reward.referrerUserId);
//     //             caches?.referrerCache?.set(reward.referrerUserId, p);
//     //             return p;
//     //         })(),
//     //     ]);

//     //     const hasMetKyc = kycProfile && kycProfile.currentTier !== KycTier.NO_KYC;

//     //     if (!netDepositUsd.gte(threshold) || !hasMetKyc || !referrer || !referrer.referralEnabled) {
//     //         return null;
//     //     }

//     //     let completedRewardId: string | null = null;
//     //     await withReferenceRetry(getDb(), async (tx) => {
//     //         const lockedReward = await this.rewardRepository.lockRewardForProcessing(reward.id, tx);
//     //         if (!lockedReward || lockedReward.rewardStatus !== RewardStatus.PENDING || lockedReward.status !== "safe") {
//     //             return;
//     //         }

//     //         await this.rewardRepository.markAsIssued(reward.id, tx);

//     //         const minorAmount = await toUnifiedMinor(reward.rewardAmount, reward.rewardCurrency);

//     //         await this.userReferralBalanceRepository.incrementAvailable(reward.referrerUserId, minorAmount, tx);

//     //         const catalogRepo = new AssetCatalogRepository(tx);
//     //         const assetInfo = await catalogRepo.resolveCanonicalMetadata(reward.rewardCurrency);

//     //         const ledgerRepo = new LedgerRepository(tx);
//     //         const expPromo = await ledgerRepo.ensureAccount({
//     //             code: ACCT.EXP_PROMO,
//     //             name: "Promotional Expense",
//     //             assetId: assetInfo.canonicalId,
//     //             tx,
//     //         });

//     //         const liabReferral = await ledgerRepo.ensureAccount({
//     //             code: ACCT.LIAB_REFERRAL,
//     //             name: "Pending Referral Rewards",
//     //             userId: reward.referrerUserId,
//     //             assetId: assetInfo.canonicalId,
//     //             tx,
//     //         });

//     //         await ledgerRepo.postJournal(
//     //             {
//     //                 type: "REFERRAL_REWARD",
//     //                 externalRef: `ref_earned_${reward.id}`,
//     //                 idempotencyKey: `ref_earned_${reward.id}`,
//     //                 memo: `Referral reward earned: ${reward.rewardAmount} ${reward.rewardCurrency} by user ${reward.referrerUserId}`,
//     //                 entries: [
//     //                     {
//     //                         accountId: expPromo.id,
//     //                         side: "DR",
//     //                         amountMinor: minorAmount,
//     //                         assetId: assetInfo.canonicalId,
//     //                     },
//     //                     {
//     //                         accountId: liabReferral.id,
//     //                         side: "CR",
//     //                         amountMinor: minorAmount,
//     //                         assetId: assetInfo.canonicalId,
//     //                     },
//     //                 ],
//     //             },
//     //             tx,
//     //         );

//     //         completedRewardId = reward.id;
//     //     });

//     //     if (!completedRewardId) return null;

//     //     logger.info("Referral reward completed and vault credited", {
//     //         rewardId: reward.id,
//     //         referredUserId: reward.referredUserId,
//     //         referrerUserId: reward.referrerUserId,
//     //         netDepositUsd: netDepositUsd.toString(),
//     //         threshold: threshold.toString(),
//     //         kycTier: kycProfile?.currentTier,
//     //     });

//     //     void this.notifyReferralRewardAvailable(reward);

//     //     return completedRewardId;
//     // }

//     // async processPendingRewardForUser(referredUserId: string) {
//     //     const isEnabled = await this.configService.isFeatureEnabled(FeatureFlag.REFERRAL);
//     //     if (!isEnabled) {
//     //         logger.info("Referral program is disabled, skipping immediate reward check", { referredUserId });
//     //         return { processed: 0, eligible: 0 };
//     //     }
//     //     const reward = await this.rewardRepository.getByReferredUserId(referredUserId);
//     //     if (!reward) return { processed: 0, eligible: 0 };

//     //     const config = await this.configService.getReferralRules();
//     //     const threshold = new Decimal(config.minDepositThresholdUsd ?? 200);
//     //     const completedRewardId = await this.completeRewardIfEligible(reward, threshold);

//     //     return { processed: 1, eligible: completedRewardId ? 1 : 0 };
//     // }

//     // /**
//     //  * Nightly batch: evaluate PENDING rewards against deposit threshold.
//     //  * Awards are processed in concurrent chunks of BATCH_SIZE to avoid
//     //  * a serial bottleneck at high volume.
//     //  * When a reward is completed, the referrer's vault is credited atomically.
//     //  */
//     // async processPendingRewards() {
//     //     const isEnabled = await this.configService.isFeatureEnabled(FeatureFlag.REFERRAL);
//     //     if (!isEnabled) {
//     //         logger.info("Referral program is disabled, skipping nightly sweep");
//     //         return { processed: 0, eligible: 0 };
//     //     }

//     //     const pendingRewards = await this.rewardRepository.getPendingRewards();
//     //     if (pendingRewards.length === 0) return { processed: 0, eligible: 0 };

//     //     const config = await this.configService.getReferralRules();
//     //     const threshold = new Decimal(config.minDepositThresholdUsd ?? 200);

//     //     let eligibleCount = 0;
//     //     const referrerCache = new Map<string, any>();
//     //     const kycCache = new Map<string, any>();

//     //     // Process in concurrent batches
//     //     for (let i = 0; i < pendingRewards.length; i += BATCH_SIZE) {
//     //         const batch = pendingRewards.slice(i, i + BATCH_SIZE);

//     //         const results = await Promise.allSettled(
//     //             batch.map((reward) =>
//     //                 this.completeRewardIfEligible(reward, threshold, {
//     //                     referrerCache,
//     //                     kycCache,
//     //                 }),
//     //             ),
//     //         );

//     //         for (const result of results) {
//     //             if (result.status === "fulfilled" && result.value) {
//     //                 eligibleCount++;
//     //             } else if (result.status === "rejected") {
//     //                 logger.error("Error processing pending reward in batch", { error: result.reason });
//     //             }
//     //         }
//     //     }

//     //     return { processed: pendingRewards.length, eligible: eligibleCount };
//     // }

//     /**
//      * Redeem referral rewards from the vault into the user's USDT wallet.
//      * - amountMajor: the amount the user wants to withdraw (e.g. "25")
//      * - idempotencyKey: optional key to ensure the request is processed once.
//      * - Minimum: 10 USDT. Maximum: full vault balance.
//      * - Fully transactional: vault is locked via SELECT FOR UPDATE before debit.
//      */
//     // async redeemRewards(userId: string, amountMajor: string, idempotencyKey?: string) {
//     //     const requestedAmount = new Decimal(amountMajor);
//     //     const currency = this.referralRewardCurrency;
//     //     const minRedemptionAmount = await this.getMinRedemptionAmount();

//     //     const idem = idempotencyKey?.trim();
//     //     if (!idem) {
//     //         throw new AppError("idempotency key needed", 400);
//     //     }

//     //     logger.info(
//     //         "Initiating referral reward redemption",
//     //         withOperationContext("api", {
//     //             userId,
//     //             amount: amountMajor,
//     //             currency,
//     //             idempotencyKey: idem,
//     //         }),
//     //     );

//     //     if (requestedAmount.lt(minRedemptionAmount)) {
//     //         throw new AppError(`Minimum redemption amount is ${minRedemptionAmount.toFixed(2)} ${currency}`, 400);
//     //     }

//     //     return await withReferenceRetry(getDb(), async (tx) => {
//     //         // Idempotency check
//     //         const existing = await this.transactionRepository.getTxnByIdemKey(idem, tx);
//     //         if (existing) {
//     //             return {
//     //                 txnId: existing.id,
//     //                 journalId: existing.journalId,
//     //                 amount: fromLedgerMinor(existing.amountMinor || 0n).toFixed(2),
//     //                 currency,
//     //                 isDuplicate: true,
//     //             };
//     //         }

//     //         // Lock the balance row to prevent concurrent redemptions
//     //         const userReferralBalance = await this.userReferralBalanceRepository.lockForUpdate(userId, tx);
//     //         if (!userReferralBalance) {
//     //             logger.warn("Redemption failed: No referral balance found", withOperationContext("api", { userId }));
//     //             throw new AppError("No referral balance found. You have no eligible rewards.", 400);
//     //         }

//     //         const availableAmount = fromLedgerMinor(BigInt(userReferralBalance.availableMinor));
//     //         if (availableAmount.lt(minRedemptionAmount)) {
//     //             throw new AppError("Insufficient available rewards for redemption", 400);
//     //         }
//     //         if (requestedAmount.gt(availableAmount)) {
//     //             throw new AppError(
//     //                 `Cannot redeem more than available balance (${availableAmount.toFixed(2)} ${currency})`,
//     //                 400,
//     //             );
//     //         }

//     //         const catalogRepo = new AssetCatalogRepository(tx);
//     //         const assetInfo = await catalogRepo.resolveCanonicalMetadata(currency);

//     //         const minorAmount = await toUnifiedMinor(requestedAmount, currency);

//     //         // Debit vault
//     //         await this.userReferralBalanceRepository.decrementAvailable(userId, minorAmount, tx);

//     //         // Record redemption history
//     //         await tx.insert(redemption_history).values({
//     //             userId,
//     //             amountMinor: minorAmount.toString(),
//     //             status: RedemptionStatus.COMPLETED,
//     //         });

//     //         // Ledger journal: LIAB_REFERRAL (DR) → LIAB_USER (CR)
//     //         const ledgerRepo = new LedgerRepository(tx);
//     //         const liabReferral = await ledgerRepo.ensureAccount({
//     //             code: ACCT.LIAB_REFERRAL,
//     //             name: "Pending Referral Rewards",
//     //             userId,
//     //             assetId: assetInfo.canonicalId,
//     //             tx,
//     //         });
//     //         const userLiab = await ledgerRepo.ensureAccount({
//     //             code: ACCT.LIAB_USER,
//     //             name: "User Available Liability",
//     //             userId,
//     //             assetId: assetInfo.canonicalId,
//     //             tx,
//     //         });

//     //         const { journalId } = await ledgerRepo.postJournal(
//     //             {
//     //                 type: "REFERRAL_REWARD",
//     //                 externalRef: `ref_redeem_${userId}_${idem}`,
//     //                 memo: `Referral reward redemption of ${amountMajor} ${currency} for user ${userId}`,
//     //                 entries: [
//     //                     {
//     //                         accountId: liabReferral.id,
//     //                         side: "DR",
//     //                         amountMinor: minorAmount,
//     //                         assetId: assetInfo.canonicalId,
//     //                     },
//     //                     {
//     //                         accountId: userLiab.id,
//     //                         side: "CR",
//     //                         amountMinor: minorAmount,
//     //                         assetId: assetInfo.canonicalId,
//     //                     },
//     //                 ],
//     //             },
//     //             tx,
//     //         );

//     //         // Credit user's USDT wallet
//     //         const balanceRepo = new UserAssetBalanceRepository(tx);
//     //         await balanceRepo.unifiedIncrementAvailable(userId, assetInfo.canonicalId, minorAmount);

//     //         // Create transaction record and link to journal
//     //         const { txnId } = await this.transactionRepository.insertTransaction(
//     //             {
//     //                 userId,
//     //                 type: TransactionType.REFERRAL_REWARD,
//     //                 status: TransactionStatus.COMPLETED,
//     //                 assetId: assetInfo.canonicalId,
//     //                 amountMinor: minorAmount.toString(),
//     //                 description: `Referral reward redemption: ${amountMajor} ${currency}`,
//     //                 idempotencyKey: idem,
//     //                 journalId: journalId,
//     //             },
//     //             tx,
//     //         );

//     //         logger.info(
//     //             "Referral reward redemption completed successfully",
//     //             withOperationContext("api", {
//     //                 userId,
//     //                 amount: amountMajor,
//     //                 txnId,
//     //                 journalId,
//     //             }),
//     //         );

//     //         return {
//     //             txnId,
//     //             amount: requestedAmount.toFixed(2),
//     //             currency,
//     //             remainingBalance: availableAmount.minus(requestedAmount).toFixed(2),
//     //         };
//     //     });
//     // }

//     // async getUserRedemptionHistory(userId: string, page = 1, pageSize = 10) {
//     //     const offset = (page - 1) * pageSize;

//     //     const [rows, total] = await Promise.all([
//     //         this.redemptionRepo.getByUserId(userId, pageSize, offset),
//     //         this.redemptionRepo.countByUserId(userId),
//     //     ]);

//     //     const history = rows.map((row) => ({
//     //         ...row,
//     //         amount: fromLedgerMinor(BigInt(row.amountMinor)).toFixed(2),
//     //         currency: this.referralRewardCurrency,
//     //     }));

//     //     return { history, total };
//     // }
// }
