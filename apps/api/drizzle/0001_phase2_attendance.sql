CREATE TYPE "public"."correction_action" AS ENUM('ADD', 'CHANGE', 'REMOVE');--> statement-breakpoint
CREATE TYPE "public"."correction_status" AS ENUM('PENDING_MANAGER', 'PENDING_HR', 'APPROVED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."day_override_kind" AS ENUM('LEAVE', 'DAY_OFF', 'SHIFT');--> statement-breakpoint
CREATE TYPE "public"."day_status" AS ENUM('OFF', 'SCHEDULED', 'NO_PUNCH', 'ON_TIME', 'WORKING', 'LATE', 'EXCUSED', 'ON_BREAK', 'MISMATCH', 'MISSING_OUT', 'DONE', 'ABSENT', 'LEAVE', 'DAY_OFF');--> statement-breakpoint
CREATE TYPE "public"."device_connection" AS ENUM('PUSH', 'AGENT', 'FILE');--> statement-breakpoint
CREATE TYPE "public"."exception_status" AS ENUM('OPEN', 'RESOLVED', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."exception_type" AS ENUM('UNLINKED_BADGE', 'MISSING_OUT', 'MISMATCH', 'NO_PUNCH', 'LATE', 'DUPLICATES');--> statement-breakpoint
CREATE TYPE "public"."prefer_source" AS ENUM('WEB', 'DEVICE');--> statement-breakpoint
CREATE TYPE "public"."punch_kind" AS ENUM('IN', 'OUT', 'BREAK_START', 'BREAK_END');--> statement-breakpoint
CREATE TYPE "public"."punch_source" AS ENUM('WEB', 'DEVICE', 'HR', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."work_setup" AS ENUM('ONSITE', 'REMOTE', 'HYBRID');--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE 'HR' BEFORE 'MANAGER';--> statement-breakpoint
CREATE TABLE "attendance_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"status" "day_status" NOT NULL,
	"schedule_start" timestamp (3) with time zone,
	"schedule_end" timestamp (3) with time zone,
	"onsite" boolean DEFAULT true NOT NULL,
	"first_in" timestamp (3) with time zone,
	"last_out" timestamp (3) with time zone,
	"open_since" timestamp (3) with time zone,
	"worked_minutes" integer DEFAULT 0 NOT NULL,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"late_minutes" integer DEFAULT 0 NOT NULL,
	"merged_count" integer DEFAULT 0 NOT NULL,
	"excused" boolean DEFAULT false NOT NULL,
	"prefer_source" "prefer_source",
	"note" text,
	"computed_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"type" "exception_type" NOT NULL,
	"status" "exception_status" DEFAULT 'OPEN' NOT NULL,
	"user_id" uuid,
	"device_user_id" text,
	"work_date" date NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolution" text,
	"resolved_by_id" uuid,
	"resolved_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_exceptions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "attendance_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"grace_minutes" integer DEFAULT 5 NOT NULL,
	"duplicate_window_minutes" integer DEFAULT 2 NOT NULL,
	"mismatch_minutes" integer DEFAULT 15 NOT NULL,
	"no_punch_after_minutes" integer DEFAULT 120 NOT NULL,
	"missing_out_after_minutes" integer DEFAULT 60 NOT NULL,
	"auto_clock_out_hours" integer DEFAULT 14 NOT NULL,
	"device_wins_onsite" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "correction_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"action" "correction_action" NOT NULL,
	"punch_id" uuid,
	"kind" "punch_kind",
	"original_at" timestamp (3) with time zone,
	"requested_at" timestamp (3) with time zone,
	"reason" text NOT NULL,
	"status" "correction_status" NOT NULL,
	"manager_id" uuid,
	"manager_decided_at" timestamp (3) with time zone,
	"manager_note" text,
	"hr_id" uuid,
	"hr_decided_at" timestamp (3) with time zone,
	"hr_note" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "day_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"kind" "day_override_kind" NOT NULL,
	"start_time" text,
	"end_time" text,
	"onsite" boolean,
	"note" text,
	"created_by_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_user_links" (
	"device_user_id" text PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"enrolled_with" text,
	"linked_by_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"model" text,
	"serial_number" text,
	"location" text,
	"connection" "device_connection" NOT NULL,
	"timezone" text DEFAULT 'Asia/Manila' NOT NULL,
	"allowed_ips" text,
	"token_hash" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp (3) with time zone,
	"last_punch_at" timestamp (3) with time zone,
	"last_stamp" text,
	"sync_requested_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_serial_number_unique" UNIQUE("serial_number")
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid,
	"filename" text NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"added" integer DEFAULT 0 NOT NULL,
	"duplicates" integer DEFAULT 0 NOT NULL,
	"unknown_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"uploaded_by_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "punches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"work_date" date,
	"source" "punch_source" NOT NULL,
	"kind" "punch_kind",
	"punched_at" timestamp (3) with time zone NOT NULL,
	"device_id" uuid,
	"device_user_id" text,
	"verify" text,
	"via" text NOT NULL,
	"location" text,
	"ip" text,
	"note" text,
	"import_batch_id" uuid,
	"merged" boolean DEFAULT false NOT NULL,
	"removed_at" timestamp (3) with time zone,
	"removed_by_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"schedule_id" uuid,
	"effective_from" date NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"onsite" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Manila' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_schedules_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "attendance_tracked" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "work_setup" "work_setup" DEFAULT 'ONSITE' NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_punch_id_punches_id_fk" FOREIGN KEY ("punch_id") REFERENCES "public"."punches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_hr_id_users_id_fk" FOREIGN KEY ("hr_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_overrides" ADD CONSTRAINT "day_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_overrides" ADD CONSTRAINT "day_overrides_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_user_links" ADD CONSTRAINT "device_user_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_user_links" ADD CONSTRAINT "device_user_links_linked_by_id_users_id_fk" FOREIGN KEY ("linked_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punches" ADD CONSTRAINT "punches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punches" ADD CONSTRAINT "punches_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punches" ADD CONSTRAINT "punches_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punches" ADD CONSTRAINT "punches_removed_by_id_users_id_fk" FOREIGN KEY ("removed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punches" ADD CONSTRAINT "punches_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_schedule_id_work_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."work_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_days" ADD CONSTRAINT "schedule_days_schedule_id_work_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."work_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_days_uq" ON "attendance_days" USING btree ("user_id","work_date");--> statement-breakpoint
CREATE INDEX "attendance_days_date_idx" ON "attendance_days" USING btree ("work_date");--> statement-breakpoint
CREATE INDEX "attendance_exceptions_status_idx" ON "attendance_exceptions" USING btree ("status","work_date");--> statement-breakpoint
CREATE INDEX "attendance_exceptions_user_idx" ON "attendance_exceptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "corrections_status_idx" ON "correction_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "corrections_user_idx" ON "correction_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "corrections_manager_idx" ON "correction_requests" USING btree ("manager_id");--> statement-breakpoint
CREATE UNIQUE INDEX "day_overrides_uq" ON "day_overrides" USING btree ("user_id","work_date");--> statement-breakpoint
CREATE INDEX "punches_user_date_idx" ON "punches" USING btree ("user_id","work_date");--> statement-breakpoint
CREATE INDEX "punches_at_idx" ON "punches" USING btree ("punched_at");--> statement-breakpoint
CREATE INDEX "punches_badge_idx" ON "punches" USING btree ("device_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "punches_device_uq" ON "punches" USING btree ("device_id","device_user_id","punched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_assignments_uq" ON "schedule_assignments" USING btree ("user_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_days_uq" ON "schedule_days" USING btree ("schedule_id","weekday");