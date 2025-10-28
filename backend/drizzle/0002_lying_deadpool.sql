CREATE TYPE "public"."autotrade_event_type" AS ENUM('pause', 'resume', 'deposit', 'withdraw', 'order_error', 'risk_override');--> statement-breakpoint
CREATE TYPE "public"."auto_portfolio_status" AS ENUM('pending', 'active', 'paused', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."autotrade_decision_action" AS ENUM('buy', 'sell', 'hold');--> statement-breakpoint
CREATE TYPE "public"."autotrade_order_side" AS ENUM('buy', 'sell');--> statement-breakpoint
CREATE TYPE "public"."autotrade_order_status" AS ENUM('pending', 'submitted', 'partially_filled', 'filled', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."autotrade_order_type" AS ENUM('market', 'limit', 'stop_market', 'stop_limit');--> statement-breakpoint
CREATE TYPE "public"."autotrade_prompt_payload_type" AS ENUM('prompt', 'cot');--> statement-breakpoint
CREATE TABLE "auto_portfolio_settings" (
	"portfolio_id" uuid PRIMARY KEY NOT NULL,
	"max_leverage" numeric(6, 3) DEFAULT 10,
	"max_position_pct" numeric(6, 3) DEFAULT 50,
	"max_daily_loss" numeric(10, 2),
	"max_drawdown_pct" numeric(6, 3),
	"cooldown_minutes" integer DEFAULT 15,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_portfolios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "auto_portfolio_status" DEFAULT 'pending' NOT NULL,
	"automation_enabled" boolean DEFAULT false NOT NULL,
	"starting_capital" numeric(18, 2) NOT NULL,
	"current_cash" numeric(18, 2) NOT NULL,
	"sharpe" numeric(10, 4),
	"drawdown_pct" numeric(6, 3),
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autotrade_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"event_type" "autotrade_event_type" NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_decision_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"action" "autotrade_decision_action" NOT NULL,
	"size_pct" numeric(6, 3),
	"confidence" numeric(6, 3),
	"rationale" text,
	"prompt_ref" uuid,
	"cot_ref" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_prompt_payloads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_uri" text NOT NULL,
	"sha256" text NOT NULL,
	"payload_type" "autotrade_prompt_payload_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"quantity" numeric(28, 12) NOT NULL,
	"avg_cost" numeric(18, 8) NOT NULL,
	"mark_price" numeric(18, 8) NOT NULL,
	"unrealized_pnl" numeric(18, 4),
	"leverage" numeric(6, 3),
	"confidence" numeric(6, 3),
	"risk_usd" numeric(18, 4),
	"exit_plan" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"equity" numeric(18, 2) NOT NULL,
	"cash" numeric(18, 2) NOT NULL,
	"positions_value" numeric(18, 2) NOT NULL,
	"realized_pnl" numeric(18, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"fill_price" numeric(18, 8) NOT NULL,
	"fill_quantity" numeric(28, 12) NOT NULL,
	"fee" numeric(18, 8),
	"liquidity" text,
	"filled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"client_order_id" text NOT NULL,
	"venue" text NOT NULL,
	"symbol" text NOT NULL,
	"side" "autotrade_order_side" NOT NULL,
	"order_type" "autotrade_order_type" NOT NULL,
	"quantity" numeric(28, 12) NOT NULL,
	"price" numeric(18, 8),
	"status" "autotrade_order_status" DEFAULT 'pending' NOT NULL,
	"confidence" numeric(6, 3),
	"risk_usd" numeric(18, 4),
	"run_id" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb,
	CONSTRAINT "trade_orders_client_order_id_unique" UNIQUE("client_order_id")
);
--> statement-breakpoint
ALTER TABLE "auto_portfolio_settings" ADD CONSTRAINT "auto_portfolio_settings_portfolio_id_auto_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."auto_portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_portfolios" ADD CONSTRAINT "auto_portfolios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autotrade_events" ADD CONSTRAINT "autotrade_events_portfolio_id_auto_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."auto_portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_decision_logs" ADD CONSTRAINT "llm_decision_logs_portfolio_id_auto_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."auto_portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_decision_logs" ADD CONSTRAINT "llm_decision_logs_prompt_ref_llm_prompt_payloads_id_fk" FOREIGN KEY ("prompt_ref") REFERENCES "public"."llm_prompt_payloads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_decision_logs" ADD CONSTRAINT "llm_decision_logs_cot_ref_llm_prompt_payloads_id_fk" FOREIGN KEY ("cot_ref") REFERENCES "public"."llm_prompt_payloads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_positions" ADD CONSTRAINT "portfolio_positions_portfolio_id_auto_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."auto_portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_portfolio_id_auto_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."auto_portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_executions" ADD CONSTRAINT "trade_executions_order_id_trade_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."trade_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_orders" ADD CONSTRAINT "trade_orders_portfolio_id_auto_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."auto_portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_auto_portfolios_user" ON "auto_portfolios" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_auto_portfolios_status" ON "auto_portfolios" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_autotrade_events_portfolio" ON "autotrade_events" USING btree ("portfolio_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_llm_decision_logs_portfolio" ON "llm_decision_logs" USING btree ("portfolio_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_llm_decision_logs_run" ON "llm_decision_logs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_llm_prompt_payloads_sha" ON "llm_prompt_payloads" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "idx_positions_portfolio_symbol" ON "portfolio_positions" USING btree ("portfolio_id","symbol");--> statement-breakpoint
CREATE INDEX "idx_portfolio_snapshots_portfolio_created" ON "portfolio_snapshots" USING btree ("portfolio_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_trade_executions_order" ON "trade_executions" USING btree ("order_id","filled_at");--> statement-breakpoint
CREATE INDEX "idx_trade_orders_portfolio_created" ON "trade_orders" USING btree ("portfolio_id","submitted_at" desc);--> statement-breakpoint
CREATE INDEX "idx_trade_orders_run" ON "trade_orders" USING btree ("run_id");
