-- Conversation history tables with per-report/user isolation and indexes
CREATE TABLE IF NOT EXISTS "conversation_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"model" text,
	"token_estimate" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_sessions_report_created_idx" ON "conversation_sessions" USING btree ("report_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_sessions_user_created_idx" ON "conversation_sessions" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tokens_estimate" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_messages_report_created_idx" ON "conversation_messages" USING btree ("report_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_messages_session_created_idx" ON "conversation_messages" USING btree ("session_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_messages_user_report_idx" ON "conversation_messages" USING btree ("user_id","report_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"session_id" uuid,
	"summary" text NOT NULL,
	"coverage_up_to" timestamp with time zone,
	"tokens_estimate" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_summaries_report_updated_idx" ON "conversation_summaries" USING btree ("report_id","updated_at");
