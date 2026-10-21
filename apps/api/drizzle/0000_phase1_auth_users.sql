CREATE TYPE "public"."auth_event_type" AS ENUM('LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGIN_LOCKED', 'LOGOUT', 'SESSION_TIMEOUT', 'FORCED_LOGOUT', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET', 'PASSWORD_CHANGED', 'MFA_ENABLED', 'MFA_DISABLED', 'MFA_FAILED', 'REFRESH_TOKEN_REUSE');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('ADMIN', 'MANAGER', 'EMPLOYEE');--> statement-breakpoint
CREATE TYPE "public"."token_purpose" AS ENUM('PASSWORD_RESET', 'INVITE');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'DEACTIVATED');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"email" text,
	"session_id" uuid,
	"type" "auth_event_type" NOT NULL,
	"ip" text,
	"user_agent" text,
	"browser" text,
	"os" text,
	"detail" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"head_user_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "mfa_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "one_time_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "token_purpose" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"used_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "one_time_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "org_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"company_name" text DEFAULT 'Acme Corp' NOT NULL,
	"primary_color" text DEFAULT '#2563eb' NOT NULL,
	"logo_url" text,
	"default_timezone" text DEFAULT 'Asia/Manila' NOT NULL,
	"session_timeout_minutes" integer DEFAULT 30 NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_hash" text NOT NULL,
	"previous_refresh_hash" text,
	"refresh_rotated_at" timestamp (3) with time zone,
	"ip" text,
	"user_agent" text,
	"browser" text,
	"os" text,
	"device" text,
	"auth_method" text DEFAULT 'password' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"revoked_at" timestamp (3) with time zone,
	"revoked_reason" text,
	"revoked_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "sso_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"full_name" text NOT NULL,
	"title" text,
	"avatar_url" text,
	"role" "role" DEFAULT 'EMPLOYEE' NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"timezone" text DEFAULT 'Asia/Manila' NOT NULL,
	"department_id" uuid,
	"manager_id" uuid,
	"mfa_secret_enc" text,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp (3) with time zone,
	"password_changed_at" timestamp (3) with time zone,
	"last_login_at" timestamp (3) with time zone,
	"deactivated_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_events" ADD CONSTRAINT "auth_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_head_user_id_users_id_fk" FOREIGN KEY ("head_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_time_tokens" ADD CONSTRAINT "one_time_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_revoked_by_id_users_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_identities" ADD CONSTRAINT "sso_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "auth_events_user_idx" ON "auth_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "auth_events_type_idx" ON "auth_events" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "auth_events_created_idx" ON "auth_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "mfa_codes_user_idx" ON "mfa_recovery_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ott_user_purpose_idx" ON "one_time_tokens" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "sessions_user_active_idx" ON "sessions" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sso_provider_subject_uq" ON "sso_identities" USING btree ("provider","subject");--> statement-breakpoint
CREATE INDEX "sso_user_idx" ON "sso_identities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_department_idx" ON "users" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "users_manager_idx" ON "users" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");