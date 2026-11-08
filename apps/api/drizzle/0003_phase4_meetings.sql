CREATE TYPE "public"."meeting_kind" AS ENUM('SCHEDULED', 'INSTANT', 'ROOM');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('ACTIVE', 'CANCELLED', 'ENDED');--> statement-breakpoint
CREATE TYPE "public"."recording_status" AS ENUM('STARTING', 'RECORDING', 'PROCESSING', 'READY', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."recurrence" AS ENUM('NONE', 'DAILY', 'WEEKDAYS', 'WEEKLY');--> statement-breakpoint
CREATE TYPE "public"."rsvp" AS ENUM('PENDING', 'ACCEPTED', 'TENTATIVE', 'DECLINED');--> statement-breakpoint
CREATE TABLE "calendar_feeds" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"token_enc" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_feeds_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "meeting_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"occurrence_start" timestamp (3) with time zone NOT NULL,
	"user_id" uuid NOT NULL,
	"participant_sid" text NOT NULL,
	"joined_at" timestamp (3) with time zone NOT NULL,
	"left_at" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "meeting_invitees" (
	"meeting_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"response" "rsvp" DEFAULT 'PENDING' NOT NULL,
	"responded_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_invitees_meeting_id_user_id_pk" PRIMARY KEY("meeting_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "meeting_notifications" (
	"meeting_id" uuid NOT NULL,
	"occurrence_start" timestamp (3) with time zone NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_notifications_meeting_id_occurrence_start_kind_pk" PRIMARY KEY("meeting_id","occurrence_start","kind")
);
--> statement-breakpoint
CREATE TABLE "meeting_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"occurrence_start" timestamp (3) with time zone NOT NULL,
	"egress_id" text NOT NULL,
	"status" "recording_status" DEFAULT 'STARTING' NOT NULL,
	"started_by_id" uuid,
	"started_at" timestamp (3) with time zone NOT NULL,
	"ended_at" timestamp (3) with time zone,
	"file_key" text,
	"size_bytes" integer,
	"duration_seconds" integer,
	"error" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_recordings_egress_id_unique" UNIQUE("egress_id")
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "meeting_kind" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"host_id" uuid NOT NULL,
	"starts_at" timestamp (3) with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"timezone" text NOT NULL,
	"recurrence" "recurrence" DEFAULT 'NONE' NOT NULL,
	"recurrence_until" date,
	"office_room_id" uuid,
	"status" "meeting_status" DEFAULT 'ACTIVE' NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"ended_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "recording_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_feeds" ADD CONSTRAINT "calendar_feeds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendance" ADD CONSTRAINT "meeting_attendance_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendance" ADD CONSTRAINT "meeting_attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_invitees" ADD CONSTRAINT "meeting_invitees_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_invitees" ADD CONSTRAINT "meeting_invitees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_notifications" ADD CONSTRAINT "meeting_notifications_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_recordings" ADD CONSTRAINT "meeting_recordings_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_recordings" ADD CONSTRAINT "meeting_recordings_started_by_id_users_id_fk" FOREIGN KEY ("started_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_office_room_id_rooms_id_fk" FOREIGN KEY ("office_room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_attendance_sid_uq" ON "meeting_attendance" USING btree ("participant_sid");--> statement-breakpoint
CREATE INDEX "meeting_attendance_meeting_idx" ON "meeting_attendance" USING btree ("meeting_id","occurrence_start");--> statement-breakpoint
CREATE INDEX "meeting_attendance_user_idx" ON "meeting_attendance" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "meeting_invitees_user_idx" ON "meeting_invitees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "meeting_recordings_meeting_idx" ON "meeting_recordings" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "meetings_host_idx" ON "meetings" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "meetings_starts_idx" ON "meetings" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meetings_room_call_uq" ON "meetings" USING btree ("office_room_id") WHERE kind = 'ROOM';