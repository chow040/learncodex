CREATE TABLE "assessment_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"input_fp" text NOT NULL,
	"result_json" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"agent_version" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "http_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"data_json" jsonb NOT NULL,
	"data_fp" text NOT NULL,
	"etag" text,
	"last_modified" timestamp with time zone,
	"as_of" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"schema_version" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_assessment_cache_expires_at" ON "assessment_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_http_cache_expires_at" ON "http_cache" USING btree ("expires_at");