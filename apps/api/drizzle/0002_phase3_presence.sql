CREATE TYPE "public"."floor_spot" AS ENUM('pastor', 'ceo', 'eng', 'huddle', 'sales', 'lobby', 'ops', 'break', 'focus');--> statement-breakpoint
CREATE TYPE "public"."manual_status" AS ENUM('BUSY', 'IN_MEETING', 'AWAY');--> statement-breakpoint
CREATE TYPE "public"."room_kind" AS ENUM('OPEN', 'DEPARTMENT', 'MEETING', 'BREAK', 'PRIVATE', 'LEADERS');--> statement-breakpoint
CREATE TABLE "presence" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"room_id" uuid,
	"entered_at" timestamp (3) with time zone,
	"manual_status" "manual_status",
	"message" text,
	"last_seen_at" timestamp (3) with time zone,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_members" (
	"room_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_members_room_id_user_id_pk" PRIMARY KEY("room_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spot" "floor_spot" NOT NULL,
	"name" text NOT NULL,
	"kind" "room_kind" NOT NULL,
	"department_id" uuid,
	"owner_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_spot_unique" UNIQUE("spot")
);
--> statement-breakpoint
ALTER TABLE "presence" ADD CONSTRAINT "presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence" ADD CONSTRAINT "presence_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_members_user_idx" ON "room_members" USING btree ("user_id");--> statement-breakpoint
-- The floor from the approved mockup. Admins rename rooms and set owners/members on the Rooms page.
INSERT INTO "rooms" ("spot", "name", "kind") VALUES
	('pastor', 'Senior Pastor''s office', 'PRIVATE'),
	('ceo', 'CEO Strategy Room', 'LEADERS'),
	('eng', 'Engineering', 'DEPARTMENT'),
	('huddle', 'Huddle room', 'MEETING'),
	('sales', 'Sales', 'DEPARTMENT'),
	('lobby', 'Lobby', 'OPEN'),
	('ops', 'Operations & HR', 'DEPARTMENT'),
	('break', 'Break Room', 'BREAK'),
	('focus', 'Focus booth', 'PRIVATE')
ON CONFLICT ("spot") DO NOTHING;
