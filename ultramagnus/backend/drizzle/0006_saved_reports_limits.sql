-- Ensure saved reports / bookmarks / activities exist with size guard on report payloads
CREATE TABLE IF NOT EXISTS "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"ticker" text NOT NULL,
	"status" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_payload_size_check'
  ) THEN
    ALTER TABLE "reports"
    ADD CONSTRAINT "reports_payload_size_check" CHECK (octet_length("payload"::text) <= 1572864);
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_owner_updated_idx" ON "reports" USING btree ("owner_id","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_owner_ticker_idx" ON "reports" USING btree ("owner_id","ticker");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bookmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"target_type" text DEFAULT 'report' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookmarks_user_updated_idx" ON "bookmarks" USING btree ("user_id","updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"target_type" text DEFAULT 'report' NOT NULL,
	"verb" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_user_occurred_idx" ON "activities" USING btree ("user_id","occurred_at");
