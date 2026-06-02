CREATE TABLE "verxatags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"username" varchar(100) NOT NULL,
	"change_count" integer DEFAULT 0 NOT NULL,
	"change_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "verxatags_username_unique" UNIQUE("username"),
	CONSTRAINT "verxatags_status_check" CHECK (status IN ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "verxatag_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verxatag_id" uuid NOT NULL,
	"old_username" varchar(100) NOT NULL,
	"new_username" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reserved_verxatags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(100) NOT NULL,
	"dummy_email" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_referral_code_unique";--> statement-breakpoint
ALTER TABLE "verxatags" ADD CONSTRAINT "verxatags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verxatag_history" ADD CONSTRAINT "verxatag_history_verxatag_id_verxatags_id_fk" FOREIGN KEY ("verxatag_id") REFERENCES "public"."verxatags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verxatags_username_idx" ON "verxatags" USING btree ("username");--> statement-breakpoint
CREATE INDEX "verxatags_user_id_idx" ON "verxatags" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verxatag_user_id_unique" ON "verxatags" USING btree ("user_id") WHERE "verxatags"."status" = '$1';--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "referral_code";