import {
    pgTable,
    uuid,
    varchar,
    timestamp,
    boolean,
    integer,
    jsonb,
    uniqueIndex,
    index,
    text
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "../users.schema";
import { enumCheck } from "../utils";

export enum KycTier {
    NO_KYC = "NO_KYC",
    TIER2 = "TIER2",
    TIER1 = "TIER1"
}

export enum SumsubReviewAnswer {
    GREEN = "GREEN",
    RED = "RED",
    YELLOW = "YELLOW",
    GRAY = "GRAY",
    INIT = "INIT",
    RETRY = "RETRY",
    UNKNOWN = "UNKNOWN"
}

export enum SumsubReviewStatus {
    INIT = "init",
    PENDING = "pending",
    QUEUED = "queued",
    COMPLETED = "completed",
    ON_HOLD = "onHold",
    UNKNOWN = "unknown"
}

export const KYC_TIERS = Object.values(KycTier) as [KycTier, ...KycTier[]];
export const SUMSUB_REVIEW_ANSWERS = Object.values(SumsubReviewAnswer) as [SumsubReviewAnswer, ...SumsubReviewAnswer[]];
export const SUMSUB_REVIEW_STATUSES = Object.values(SumsubReviewStatus) as [
    SumsubReviewStatus,
    ...SumsubReviewStatus[]
];

export const kyc_profiles = pgTable(
    "kyc_profiles",
    {
        userId: uuid("user_id")
            .primaryKey()
            .references(() => users.id, { onDelete: "cascade" }),
        currentTier: text("current_tier", { enum: KYC_TIERS }).$type<KycTier>().notNull().default(KycTier.NO_KYC),
        currentLevelName: varchar("current_level_name", { length: 120 }),
        sumsubExternalUserId: varchar("sumsub_external_user_id", { length: 128 }).notNull(),
        applicantId: varchar("applicant_id", { length: 128 }), // nullable until first create
        inspectionId: varchar("inspection_id", { length: 128 }),
        latestReviewAnswer: text("latest_review_answer", { enum: SUMSUB_REVIEW_ANSWERS })
            .$type<SumsubReviewAnswer>()
            .default(SumsubReviewAnswer.UNKNOWN),
        latestReviewStatus: text("latest_review_status", { enum: SUMSUB_REVIEW_STATUSES })
            .$type<SumsubReviewStatus>()
            .default(SumsubReviewStatus.UNKNOWN),
        reviewedAt: timestamp("reviewed_at"),
        lastTierChangeReason: text("last_tier_change_reason"),
        lastTierChangedAt: timestamp("last_tier_changed_at"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull()
    },
    (t) => [
        uniqueIndex("kyc_profiles_ext_user_unique").on(t.sumsubExternalUserId),
        uniqueIndex("kyc_profiles_applicant_unique").on(t.applicantId),
        enumCheck("kyc_profiles_tier_check", "current_tier", KYC_TIERS),
        enumCheck("kyc_profiles_answer_check", "latest_review_answer", SUMSUB_REVIEW_ANSWERS),
        enumCheck("kyc_profiles_status_check", "latest_review_status", SUMSUB_REVIEW_STATUSES)
    ]
);

export const kyc_applications = pgTable(
    "kyc_applications",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        applicantId: varchar("applicant_id", { length: 128 }).notNull(),
        externalUserId: varchar("external_user_id", { length: 128 }).notNull(),
        levelName: varchar("level_name", { length: 120 }).notNull(),
        inspectionId: varchar("inspection_id", { length: 128 }),
        reviewAnswer: text("review_answer", { enum: SUMSUB_REVIEW_ANSWERS })
            .$type<SumsubReviewAnswer>()
            .default(SumsubReviewAnswer.UNKNOWN),
        reviewStatus: text("review_status", { enum: SUMSUB_REVIEW_STATUSES })
            .$type<SumsubReviewStatus>()
            .default(SumsubReviewStatus.UNKNOWN),
        reviewData: jsonb("review_data"),
        applicantData: jsonb("applicant_data"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        reviewedAt: timestamp("reviewed_at"),
        updatedAt: timestamp("updated_at").defaultNow().notNull()
    },
    (t) => [
        index("kyc_applications_user_idx").on(t.userId),
        index("kyc_applications_user_created_idx").on(t.userId, t.createdAt),
        index("kyc_applications_applicant_idx").on(t.applicantId),
        uniqueIndex("kyc_applications_pending_unique")
            .on(t.applicantId, t.levelName)
            .where(sql`${t.reviewAnswer} = 'UNKNOWN'`),
        enumCheck("kyc_applications_answer_check", "review_answer", SUMSUB_REVIEW_ANSWERS),
        enumCheck("kyc_applications_status_check", "review_status", SUMSUB_REVIEW_STATUSES)
    ]
);

export const kyc_actions = pgTable(
    "kyc_actions",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        kycApplicantId: uuid("kyc_applicant_id")
            .notNull()
            .references(() => kyc_applications.id, { onDelete: "cascade" }),
        actionId: varchar("action_id", { length: 128 }).notNull(),
        imageIds: jsonb("image_ids"),
        meta: jsonb("meta"),
        createdAt: timestamp("created_at").defaultNow().notNull()
    },
    (t) => [
        index("kyc_actions_applicant_idx").on(t.kycApplicantId),
        uniqueIndex("kyc_actions_action_unique").on(t.actionId)
    ]
);

export const tier_policies = pgTable(
    "tier_policies",
    {
        tier: text("tier", { enum: KYC_TIERS }).$type<KycTier>().primaryKey(),
        cardMonthlySpendLimitUsd: integer("card_monthly_spend_limit_usd"),
        maxVirtualCards: integer("max_virtual_cards").notNull().default(0),
        physicalCardAllowed: boolean("physical_card_allowed").notNull().default(false),
        physicalCardMax: integer("physical_card_max").notNull().default(0),
        fiatWalletsAllowed: boolean("fiat_wallets_allowed").notNull().default(false),
        swapAllowed: boolean("swap_allowed").notNull().default(false),
        sendToExternalAllowed: boolean("send_to_external_allowed").notNull().default(false),
        esimMax: integer("esim_max").notNull().default(0),
        cardsAllTypes: boolean("cards_all_types").notNull().default(false),
        depositTokenList: jsonb("deposit_token_list").$type<string[]>(),
        extras: jsonb("extras"),
        esimPurchaseLimitDaily: integer("esim_purchase_limit_daily"),
        esimPurchaseLimitWeekly: integer("esim_purchase_limit_weekly"),
        updatedAt: timestamp("updated_at").defaultNow().notNull()
    },
    () => [enumCheck("tier_policies_tier_check", "tier", KYC_TIERS)]
);
