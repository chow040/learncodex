ALTER TABLE "llm_decision_logs"
ALTER COLUMN "action" TYPE text USING "action"::text;

DROP TYPE IF EXISTS "public"."autotrade_decision_action";
