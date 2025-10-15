CREATE TABLE "assessment_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"request_payload" jsonb NOT NULL,
	"context_payload" jsonb,
	"assessment_payload" jsonb NOT NULL,
	"raw_text" text,
	"prompt_text" text,
	"system_prompt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_assessment_logs_symbol_created_at" ON "assessment_logs" USING btree ("symbol","created_at" desc);