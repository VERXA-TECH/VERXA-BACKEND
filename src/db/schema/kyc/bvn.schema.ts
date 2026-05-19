// src/db/schema/kyc/bvn.schema.ts
import {
    pgTable,
    uuid,
    varchar,
    timestamp,
    jsonb,
    integer,
    boolean,
    text,
    uniqueIndex,
    index,
} from "drizzle-orm/pg-core";
import { users } from "../users.schema";
import { enumCheck } from "../utils";

export enum BvnMetaStatus {
    PENDING = "Pending",
    APPROVED = "Approved",
    CANCELLED = "Cancelled",
    DECLINED = "Declined",
    RETRIED = "Retried",
}

export const BVN_META_STATUSES = Object.values(BvnMetaStatus) as [BvnMetaStatus, ...BvnMetaStatus[]];

export const kyc_bvn_verifications = pgTable(
    "kyc_bvn_verifications",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),

        bvn: varchar("bvn", { length: 256 }).notNull(),
        reference: varchar("reference", { length: 250 }).notNull(),

        metaStatus: text("meta_status", { enum: BVN_META_STATUSES }).$type<BvnMetaStatus>().notNull(),
        responseCode: integer("response_code").notNull(),
        ok: boolean("ok").notNull().default(false),

        firstName: varchar("first_name", { length: 64 }),
        surname: varchar("surname", { length: 64 }),
        email: varchar("email", { length: 160 }),
        phoneNo1: varchar("phone_no_1", { length: 32 }),
        phoneNo2: varchar("phone_no_2", { length: 32 }),
        dateOfBirthRaw: varchar("dob_raw", { length: 32 }),
        nin: varchar("nin", { length: 256 }),

        details: jsonb("details"),
        raw: jsonb("raw"),

        charge: integer("charge"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (t) => [
        index("bvn_verif_user_created_idx").on(t.userId, t.createdAt),
        index("bvn_verif_bvn_idx").on(t.bvn),
        uniqueIndex("bvn_verif_reference_unique").on(t.reference),
        enumCheck("bvn_verif_meta_status_check", "meta_status", BVN_META_STATUSES),
    ]
);

export const kyc_bvn_profiles = pgTable(
    "kyc_bvn_profiles",
    {
        userId: uuid("user_id")
            .primaryKey()
            .references(() => users.id, { onDelete: "cascade" }),

        bvn: varchar("bvn", { length: 256 }).notNull(),
        latestVerificationId: uuid("latest_verification_id").notNull(),

        firstName: varchar("first_name", { length: 64 }).notNull(),
        surname: varchar("surname", { length: 64 }).notNull(),
        email: varchar("email", { length: 160 }),
        phoneNo: varchar("phone_no", { length: 32 }),
        dateOfBirthISO: varchar("dob_iso", { length: 10 }),
        nin: varchar("nin", { length: 256 }),
        stateOfResidence: varchar("state_of_residence", { length: 64 }),
        lgaOfResidence: varchar("lga_of_residence", { length: 64 }),
        residentialAddress: varchar("residential_address", { length: 256 }),

        metaStatus: text("meta_status", { enum: BVN_META_STATUSES })
            .$type<BvnMetaStatus>()
            .notNull()
            .default(BvnMetaStatus.PENDING),
        approved: boolean("approved").notNull().default(false),

        updatedAt: timestamp("updated_at").defaultNow().notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (t) => [
        uniqueIndex("bvn_profiles_user_unique").on(t.userId),
        index("bvn_profiles_bvn_idx").on(t.bvn),
        enumCheck("bvn_profiles_meta_status_check", "meta_status", BVN_META_STATUSES),
    ]
);
