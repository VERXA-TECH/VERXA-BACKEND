CREATE TABLE "feature_flags" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"description" text,
	"rules" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "global_settings" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "region_settings" (
	"region_code" varchar(10) PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"limits" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"username" varchar(100),
	"password_hash" varchar(255),
	"unlock_pin_hash" varchar(255),
	"txn_pin_hash" varchar(255),
	"biometric_enabled" boolean DEFAULT false,
	"first_name" varchar(100),
	"middle_name" varchar(100),
	"last_name" varchar(100),
	"gender" varchar(50),
	"phone_number" varchar(20),
	"avatar" varchar(255),
	"avatar_history" jsonb,
	"purposes" jsonb,
	"country" varchar(2),
	"currency" text DEFAULT 'USDT' NOT NULL,
	"language" text DEFAULT 'en-US' NOT NULL,
	"referral_code" varchar(14),
	"referred_by" uuid,
	"is_active" boolean DEFAULT true,
	"is_ambassador" boolean DEFAULT false,
	"email_verified" boolean DEFAULT false,
	"email_verified_at" timestamp,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"lockout_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"mfa_secret_enc" text,
	"delete_requested_at" timestamp,
	"delete_effective_at" timestamp,
	"is_archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp,
	"archive_reason" text,
	"status_reason" text,
	"push_notification_enabled" boolean DEFAULT false NOT NULL,
	"email_notification_enabled" boolean DEFAULT true NOT NULL,
	"telegram_notification_enabled" boolean DEFAULT true NOT NULL,
	"is_pnd" boolean DEFAULT false NOT NULL,
	"pnd_reason" text,
	"role" text DEFAULT 'basic-user' NOT NULL,
	"telegram_chat_id" varchar(64),
	"telegram_linked_at" timestamp with time zone,
	"admin_role_id" uuid,
	"admin_group_id" uuid,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code"),
	CONSTRAINT "users_currency_check" CHECK (currency IN ('USDT', 'USD', 'EURO', 'GBP', 'SAR', 'NGN', 'JPY', 'AED', 'KES', 'GHS', 'ZAR')),
	CONSTRAINT "users_language_check" CHECK (language IN ('en-US', 'en-GB', 'ar')),
	CONSTRAINT "users_role_check" CHECK (role IN ('basic-user', 'admin', 'super-admin'))
);
--> statement-breakpoint
CREATE TABLE "oauth_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(50) NOT NULL,
	"provider_id" varchar(255) NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"token_expiry" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_providers_user_id_provider_unique" UNIQUE("user_id","provider"),
	CONSTRAINT "oauth_providers_provider_provider_id_unique" UNIQUE("provider","provider_id")
);
--> statement-breakpoint
CREATE TABLE "admin_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "admin_groups_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "admin_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"role_id" uuid NOT NULL,
	"group_id" uuid,
	"custom_permissions" json,
	"excluded_permissions" json,
	"expires_at" timestamp NOT NULL,
	"invited_by" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "admin_invitations_status_check" CHECK (status IN ('pending', 'accepted', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(150) NOT NULL,
	"description" text,
	"category" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp,
	"is_system" boolean DEFAULT false NOT NULL,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "admin_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp,
	"is_system" boolean DEFAULT false NOT NULL,
	CONSTRAINT "admin_roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"user_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"is_denied" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_permissions_user_id_permission_id_pk" PRIMARY KEY("user_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "admin_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid,
	"admin_role" varchar(50),
	"action" varchar(100) NOT NULL,
	"resource" varchar(100),
	"resource_id" varchar(100),
	"endpoint" varchar(255) NOT NULL,
	"method" varchar(10) NOT NULL,
	"payload" jsonb,
	"response" jsonb,
	"status" text DEFAULT 'completed' NOT NULL,
	"ip" "inet",
	"user_agent" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_audit_logs_status_check" CHECK (status IN ('pending', 'approved', 'rejected', 'completed'))
);
--> statement-breakpoint
CREATE TABLE "email_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" varchar(255) NOT NULL,
	"from" varchar(255) NOT NULL,
	"to" varchar(255) NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"context" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp,
	"delivered_at" timestamp,
	"opened_at" timestamp,
	"first_clicked_at" timestamp,
	"bounced_at" timestamp,
	"failed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_logs_status_check" CHECK (status IN ('pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "email_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_log_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"ip_address" varchar(64),
	"user_agent" text,
	"clicked_url" text,
	"reason" text,
	"metadata" jsonb,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" varchar(128) PRIMARY KEY NOT NULL,
	"scope" varchar(64) NOT NULL,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_asset_activations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"asset_id" varchar(64) NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_asset_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"asset_id" varchar(64) NOT NULL,
	"available_minor" numeric(78, 0) DEFAULT 0 NOT NULL,
	"locked_minor" numeric(78, 0) DEFAULT 0 NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "check_available_non_negative" CHECK ("user_asset_balances"."available_minor" >= 0),
	CONSTRAINT "check_locked_non_negative" CHECK ("user_asset_balances"."locked_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"asset_id" varchar(64),
	"code" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journal_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"side" varchar(2) NOT NULL,
	"amount_minor" numeric(78, 0) DEFAULT 0 NOT NULL,
	"asset_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_journals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(64) NOT NULL,
	"txn_id" uuid,
	"idempotency_key" varchar(128),
	"external_ref" varchar(256),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_at" timestamp with time zone,
	"memo" text
);
--> statement-breakpoint
CREATE TABLE "deposit_details" (
	"txn_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"asset_id" varchar(64) NOT NULL,
	"source" varchar(32) NOT NULL,
	"chain" varchar(64),
	"tx_hash" varchar(128),
	"from_address" varchar(256),
	"to_address" varchar(256),
	"confirmations" integer,
	"detected_at" timestamp with time zone,
	"credited_at" timestamp with time zone,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "fiat_deposit_details" (
	"txn_id" uuid PRIMARY KEY NOT NULL,
	"reference" varchar(265) NOT NULL,
	"user_id" uuid NOT NULL,
	"asset_id" varchar(20) NOT NULL,
	"detected_at" timestamp with time zone,
	"credited_at" timestamp with time zone,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "fiat_payout_details" (
	"txn_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"asset_id" varchar(64) NOT NULL,
	"amount_minor" numeric(78, 0) NOT NULL,
	"fee_minor" numeric(78, 0) NOT NULL,
	"provider_fee_minor" numeric(78, 0),
	"bank_name" varchar(128) NOT NULL,
	"bank_code" varchar(32),
	"account_number" varchar(350) NOT NULL,
	"account_name" varchar(512) NOT NULL,
	"reference" varchar(128) NOT NULL,
	"external_id" varchar(128),
	"batch_reference" varchar(128),
	"status" varchar(32) NOT NULL,
	"failed_reason" text,
	"channel" varchar(32),
	"quote_id" uuid,
	"fee_usd" numeric(20, 2),
	"submitted_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "internal_transfer_details" (
	"txn_id" uuid PRIMARY KEY NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"asset_id" varchar(64) NOT NULL,
	"memo" varchar(256)
);
--> statement-breakpoint
CREATE TABLE "swap_details" (
	"txn_id" uuid PRIMARY KEY NOT NULL,
	"quote_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"from_asset_id" varchar(64) NOT NULL,
	"to_asset_id" varchar(64) NOT NULL,
	"from_amount_minor" numeric(78, 0) DEFAULT 0 NOT NULL,
	"to_amount_minor" numeric(78, 0) DEFAULT 0 NOT NULL,
	"price_quoted" varchar(64),
	"provider" varchar(64),
	"fee_minor" numeric(78, 0) DEFAULT 0 NOT NULL,
	"executed_at" timestamp with time zone,
	"fee_usd" numeric(20, 2),
	"from_amount_usd" numeric(20, 2),
	"to_amount_usd" numeric(20, 2),
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "swap_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"from_asset_id" varchar(64) NOT NULL,
	"to_asset_id" varchar(64) NOT NULL,
	"amount_in" numeric(36, 18) NOT NULL,
	"amount_out" numeric(36, 18) NOT NULL,
	"rate" numeric(36, 18) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"fee_bps" integer DEFAULT 0,
	"slippage_bps" integer DEFAULT 50,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"executed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"type" varchar(64) NOT NULL,
	"status" varchar(32) NOT NULL,
	"asset_id" varchar(64),
	"amount_minor" numeric(78, 0) DEFAULT 0 NOT NULL,
	"idempotency_key" varchar(128),
	"is_flagged" boolean DEFAULT false NOT NULL,
	"flag_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"journal_id" uuid,
	"metadata" jsonb,
	"description" text,
	"reference_id" uuid,
	"category" varchar(32),
	"amount_usd" numeric(20, 2),
	"admin_id" uuid
);
--> statement-breakpoint
CREATE TABLE "transfer" (
	"txn_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"asset_id" varchar(64) NOT NULL,
	"to_address" varchar(256),
	"fireblocks_tx_id" varchar(128),
	"network_fee_minor" numeric(78, 0) DEFAULT 0,
	"service_fee_minor" numeric(78, 0) DEFAULT 0,
	"submitted_at" timestamp with time zone,
	"broadcast_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"chain" varchar(64),
	"tx_hash" varchar(128),
	"service_fee_usd" numeric(20, 2),
	"network_fee_usd" numeric(20, 2),
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "kyc_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kyc_applicant_id" uuid NOT NULL,
	"action_id" varchar(128) NOT NULL,
	"image_ids" jsonb,
	"meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyc_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"applicant_id" varchar(128) NOT NULL,
	"external_user_id" varchar(128) NOT NULL,
	"level_name" varchar(120) NOT NULL,
	"inspection_id" varchar(128),
	"review_answer" text DEFAULT 'UNKNOWN',
	"review_status" text DEFAULT 'unknown',
	"review_data" jsonb,
	"applicant_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kyc_applications_answer_check" CHECK (review_answer IN ('GREEN', 'RED', 'YELLOW', 'GRAY', 'INIT', 'RETRY', 'UNKNOWN')),
	CONSTRAINT "kyc_applications_status_check" CHECK (review_status IN ('init', 'pending', 'queued', 'completed', 'onHold', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "kyc_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"current_tier" text DEFAULT 'NO_KYC' NOT NULL,
	"current_level_name" varchar(120),
	"sumsub_external_user_id" varchar(128) NOT NULL,
	"applicant_id" varchar(128),
	"inspection_id" varchar(128),
	"latest_review_answer" text DEFAULT 'UNKNOWN',
	"latest_review_status" text DEFAULT 'unknown',
	"reviewed_at" timestamp,
	"last_tier_change_reason" text,
	"last_tier_changed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kyc_profiles_tier_check" CHECK (current_tier IN ('NO_KYC', 'TIER2', 'TIER1')),
	CONSTRAINT "kyc_profiles_answer_check" CHECK (latest_review_answer IN ('GREEN', 'RED', 'YELLOW', 'GRAY', 'INIT', 'RETRY', 'UNKNOWN')),
	CONSTRAINT "kyc_profiles_status_check" CHECK (latest_review_status IN ('init', 'pending', 'queued', 'completed', 'onHold', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "tier_policies" (
	"tier" text PRIMARY KEY NOT NULL,
	"card_monthly_spend_limit_usd" integer,
	"max_virtual_cards" integer DEFAULT 0 NOT NULL,
	"physical_card_allowed" boolean DEFAULT false NOT NULL,
	"physical_card_max" integer DEFAULT 0 NOT NULL,
	"fiat_wallets_allowed" boolean DEFAULT false NOT NULL,
	"swap_allowed" boolean DEFAULT false NOT NULL,
	"send_to_external_allowed" boolean DEFAULT false NOT NULL,
	"esim_max" integer DEFAULT 0 NOT NULL,
	"cards_all_types" boolean DEFAULT false NOT NULL,
	"deposit_token_list" jsonb,
	"extras" jsonb,
	"esim_purchase_limit_daily" integer,
	"esim_purchase_limit_weekly" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tier_policies_tier_check" CHECK (tier IN ('NO_KYC', 'TIER2', 'TIER1'))
);
--> statement-breakpoint
CREATE TABLE "user_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" varchar(255) NOT NULL,
	"device_name" varchar(255) NOT NULL,
	"fingerprint_hash" varchar(255) NOT NULL,
	"ip" varchar(64),
	"user_agent" text,
	"os" varchar(100),
	"device_trust_token_hash" varchar(255),
	"device_trust_token_issued_at" timestamp,
	"device_trust_token_expires_at" timestamp,
	"refresh_token_jti" varchar(64),
	"refresh_token_hash" varchar(255),
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"device_token" varchar(255),
	"country" varchar(100),
	"last_country" varchar(100),
	CONSTRAINT "user_devices_status_check" CHECK (status IN ('pending', 'active', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "device_trust_token_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"rotated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_fees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"blockchain_id" uuid,
	"transfer_fee" bigint NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid NOT NULL,
	"legacy_id" varchar(64) NOT NULL,
	"blockchain_id" uuid,
	"display_name" varchar(256) NOT NULL,
	"display_symbol" varchar(64) NOT NULL,
	"asset_class" varchar(32) NOT NULL,
	"onchain_symbol" varchar(128),
	"token_address" varchar(256),
	"decimals" integer,
	"standards_csv" text,
	"scope" varchar(32),
	"verified" boolean DEFAULT false NOT NULL,
	"deprecated" boolean DEFAULT false NOT NULL,
	"icon_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assets_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "assets_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "blockchains" (
	"id" uuid NOT NULL,
	"legacy_id" varchar(64) NOT NULL,
	"display_name" varchar(256) NOT NULL,
	"protocol" varchar(32) NOT NULL,
	"chain_id" varchar(64),
	"is_testnet" boolean DEFAULT false NOT NULL,
	"signing_algo" varchar(64),
	"explorer_base" varchar(512),
	"explorer_address_tmpl" varchar(512),
	"explorer_tx_tmpl" varchar(512),
	"deprecated" boolean DEFAULT false NOT NULL,
	"icon_url" text,
	"scope" varchar(32),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blockchains_id_pk" PRIMARY KEY("id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_users_id_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_admin_role_id_admin_roles_id_fk" FOREIGN KEY ("admin_role_id") REFERENCES "public"."admin_roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_admin_group_id_admin_groups_id_fk" FOREIGN KEY ("admin_group_id") REFERENCES "public"."admin_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_providers" ADD CONSTRAINT "oauth_providers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_invitations" ADD CONSTRAINT "admin_invitations_role_id_admin_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."admin_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_invitations" ADD CONSTRAINT "admin_invitations_group_id_admin_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."admin_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_invitations" ADD CONSTRAINT "admin_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_admin_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."admin_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_email_log_id_email_logs_id_fk" FOREIGN KEY ("email_log_id") REFERENCES "public"."email_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_asset_activations" ADD CONSTRAINT "user_asset_activations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_asset_activations" ADD CONSTRAINT "user_asset_activations_asset_id_assets_legacy_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("legacy_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_asset_balances" ADD CONSTRAINT "user_asset_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_asset_balances" ADD CONSTRAINT "user_asset_balances_asset_id_assets_legacy_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("legacy_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_details" ADD CONSTRAINT "deposit_details_txn_id_transactions_id_fk" FOREIGN KEY ("txn_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiat_deposit_details" ADD CONSTRAINT "fiat_deposit_details_txn_id_transactions_id_fk" FOREIGN KEY ("txn_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiat_deposit_details" ADD CONSTRAINT "fiat_deposit_details_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiat_payout_details" ADD CONSTRAINT "fiat_payout_details_txn_id_transactions_id_fk" FOREIGN KEY ("txn_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiat_payout_details" ADD CONSTRAINT "fiat_payout_details_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_transfer_details" ADD CONSTRAINT "internal_transfer_details_txn_id_transactions_id_fk" FOREIGN KEY ("txn_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_details" ADD CONSTRAINT "swap_details_txn_id_transactions_id_fk" FOREIGN KEY ("txn_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_details" ADD CONSTRAINT "swap_details_quote_id_swap_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."swap_quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_txn_id_transactions_id_fk" FOREIGN KEY ("txn_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_actions" ADD CONSTRAINT "kyc_actions_kyc_applicant_id_kyc_applications_id_fk" FOREIGN KEY ("kyc_applicant_id") REFERENCES "public"."kyc_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_applications" ADD CONSTRAINT "kyc_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_profiles" ADD CONSTRAINT "kyc_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_trust_token_history" ADD CONSTRAINT "device_trust_token_history_device_id_user_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."user_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_fees" ADD CONSTRAINT "asset_fees_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_fees" ADD CONSTRAINT "asset_fees_blockchain_id_blockchains_id_fk" FOREIGN KEY ("blockchain_id") REFERENCES "public"."blockchains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_unique" ON "users" USING btree (lower("username"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_telegram_chat_id_index" ON "users" USING btree ("telegram_chat_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_groups_name_lower_unique" ON "admin_groups" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "admin_invitations_email_idx" ON "admin_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "admin_invitations_token_hash_idx" ON "admin_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_key_lower_unique" ON "permissions" USING btree (lower("key"));--> statement-breakpoint
CREATE UNIQUE INDEX "admin_roles_name_lower_unique" ON "admin_roles" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "user_permissions_permission_idx" ON "user_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_admin_id_idx" ON "admin_audit_logs" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_action_idx" ON "admin_audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_status_idx" ON "admin_audit_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_resource_composite_idx" ON "admin_audit_logs" USING btree ("resource","resource_id");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_created_at_idx" ON "admin_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "email_events_email_log_id_idx" ON "email_events" USING btree ("email_log_id");--> statement-breakpoint
CREATE INDEX "email_events_type_idx" ON "email_events" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_scope_key_unq" ON "idempotency_keys" USING btree ("scope","key");--> statement-breakpoint
CREATE UNIQUE INDEX "user_asset_activations_user_asset_unq" ON "user_asset_activations" USING btree ("user_id","asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_asset_balances_user_asset_unq" ON "user_asset_balances" USING btree ("user_id","asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_user_asset_code_unq" ON "ledger_accounts" USING btree ("user_id","asset_id","code");--> statement-breakpoint
CREATE INDEX "ledger_entries_journal_idx" ON "ledger_entries" USING btree ("journal_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_acct_idx" ON "ledger_entries" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_asset_idx" ON "ledger_entries" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_posted_idx" ON "ledger_entries" USING btree ("posted");--> statement-breakpoint
CREATE INDEX "ledger_entries_acct_posted_idx" ON "ledger_entries" USING btree ("account_id","posted");--> statement-breakpoint
CREATE INDEX "ledger_journals_type_idx" ON "ledger_journals" USING btree ("type");--> statement-breakpoint
CREATE INDEX "ledger_journals_txn_idx" ON "ledger_journals" USING btree ("txn_id");--> statement-breakpoint
CREATE INDEX "ledger_journals_idem_idx" ON "ledger_journals" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "deposit_tx_hash_asset_unq" ON "deposit_details" USING btree ("tx_hash","asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fiat_deposit_reference_asset_unq" ON "fiat_deposit_details" USING btree ("reference","asset_id","user_id");--> statement-breakpoint
CREATE INDEX "fiat_payout_user_idx" ON "fiat_payout_details" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fiat_payout_external_id_unq" ON "fiat_payout_details" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "fiat_payout_batch_ref_idx" ON "fiat_payout_details" USING btree ("batch_reference");--> statement-breakpoint
CREATE INDEX "fiat_payout_reference_idx" ON "fiat_payout_details" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "fiat_payout_status_submitted_idx" ON "fiat_payout_details" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "swaps_user_idx" ON "swap_details" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "swaps_from_asset_idx" ON "swap_details" USING btree ("from_asset_id");--> statement-breakpoint
CREATE INDEX "swaps_to_asset_idx" ON "swap_details" USING btree ("to_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "swaps_quote_id_unique" ON "swap_details" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "swap_quotes_user_idx" ON "swap_quotes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "swap_quotes_status_idx" ON "swap_quotes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "swap_quotes_from_asset_idx" ON "swap_quotes" USING btree ("from_asset_id");--> statement-breakpoint
CREATE INDEX "swap_quotes_to_asset_idx" ON "swap_quotes" USING btree ("to_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "swap_quotes_id_unique" ON "swap_quotes" USING btree ("id");--> statement-breakpoint
CREATE INDEX "swap_quotes_user_status_exp_idx" ON "swap_quotes" USING btree ("status","user_id","expires_at");--> statement-breakpoint
CREATE INDEX "transactions_user_idx" ON "transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_type_idx" ON "transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "transactions_status_idx" ON "transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "transactions_asset_idx" ON "transactions" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "transactions_created_at_idx" ON "transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "transactions_reference_idx" ON "transactions" USING btree ("reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_tx_idempotency" ON "transactions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "fireblockstxId_assetId_toAddress_idx" ON "transfer" USING btree ("fireblocks_tx_id","asset_id","to_address");--> statement-breakpoint
CREATE INDEX "kyc_actions_applicant_idx" ON "kyc_actions" USING btree ("kyc_applicant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kyc_actions_action_unique" ON "kyc_actions" USING btree ("action_id");--> statement-breakpoint
CREATE INDEX "kyc_applications_user_idx" ON "kyc_applications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "kyc_applications_user_created_idx" ON "kyc_applications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "kyc_applications_applicant_idx" ON "kyc_applications" USING btree ("applicant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kyc_applications_pending_unique" ON "kyc_applications" USING btree ("applicant_id","level_name") WHERE "kyc_applications"."review_answer" = 'UNKNOWN';--> statement-breakpoint
CREATE UNIQUE INDEX "kyc_profiles_ext_user_unique" ON "kyc_profiles" USING btree ("sumsub_external_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kyc_profiles_applicant_unique" ON "kyc_profiles" USING btree ("applicant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_device_userid_deviceid_idx" ON "user_devices" USING btree ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "user_devices_user_id_idx" ON "user_devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_devices_refresh_token_jti_idx" ON "user_devices" USING btree ("refresh_token_jti");--> statement-breakpoint
CREATE INDEX "user_devices_user_id_status_idx" ON "user_devices" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "user_devices_expires_at_idx" ON "user_devices" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_devices_trust_expires_at_idx" ON "user_devices" USING btree ("device_trust_token_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "device_trust_token_history_token_hash_idx" ON "device_trust_token_history" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "device_trust_token_history_device_idx" ON "device_trust_token_history" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "device_trust_token_history_expires_at_idx" ON "device_trust_token_history" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_fee_asset_chain_uniq" ON "asset_fees" USING btree ("asset_id","blockchain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_legacy_uniq" ON "assets" USING btree ("legacy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blockchains_legacy_uniq" ON "blockchains" USING btree ("legacy_id");