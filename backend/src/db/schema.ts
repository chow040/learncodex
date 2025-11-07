import { desc } from 'drizzle-orm';
import {
  bigserial,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  pgEnum,
  date,
  numeric,
  integer,
} from 'drizzle-orm/pg-core';

import type {
  AssessmentContext,
  AssessmentInput,
  AssessmentPayload,
} from '../services/openaiService.js';

// Auth-related enums
export const providerEnum = pgEnum('provider', ['google']);

export const autoPortfolioStatusEnum = pgEnum('auto_portfolio_status', [
  'pending',
  'active',
  'paused',
  'disabled',
]);

export const orderSideEnum = pgEnum('autotrade_order_side', ['buy', 'sell']);

export const orderTypeEnum = pgEnum('autotrade_order_type', [
  'market',
  'limit',
  'stop_market',
  'stop_limit',
]);

export const orderStatusEnum = pgEnum('autotrade_order_status', [
  'pending',
  'submitted',
  'partially_filled',
  'filled',
  'cancelled',
  'failed',
]);

export const promptPayloadTypeEnum = pgEnum('autotrade_prompt_payload_type', ['prompt', 'cot']);

export const autoEventTypeEnum = pgEnum('autotrade_event_type', [
  'pause',
  'resume',
  'deposit',
  'withdraw',
  'order_error',
  'risk_override',
]);

export const decisionActionEnum = pgEnum('autotrade_decision_action', ['buy', 'sell', 'hold']);

// Users table - canonical user records
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').unique().notNull(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    fullName: text('full_name'),
    avatarUrl: text('avatar_url'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: index('idx_users_email').on(table.email),
  }),
);

// User identities - OAuth provider mappings
export const userIdentities = pgTable(
  'user_identities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    provider: providerEnum('provider').notNull(),
    providerSub: text('provider_sub').notNull(),
    accessToken: text('access_token'), // encrypted/nullable
    refreshToken: text('refresh_token'), // encrypted/nullable  
    idToken: text('id_token'), // optional
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    rawProfile: jsonb('raw_profile'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    providerSubIdx: index('idx_user_identities_provider_sub').on(table.provider, table.providerSub),
    userIdIdx: index('idx_user_identities_user_id').on(table.userId),
  }),
);

// Sessions table - track user sessions
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
  },
  (table) => ({
    userIdIdx: index('idx_sessions_user_id').on(table.userId),
    expiresAtIdx: index('idx_sessions_expires_at').on(table.expiresAt),
  }),
);

export const assessmentLogs = pgTable(
  'assessment_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    symbol: text('symbol').notNull(),
    requestPayload: jsonb('request_payload').$type<AssessmentInput>().notNull(),
    contextPayload: jsonb('context_payload').$type<AssessmentContext | null>(),
    assessmentPayload: jsonb('assessment_payload')
      .$type<Omit<AssessmentPayload, 'rawText'>>()
      .notNull(),
    rawText: text('raw_text'),
    promptText: text('prompt_text'),
    systemPrompt: text('system_prompt'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    symbolCreatedAtIdx: index('idx_assessment_logs_symbol_created_at').on(
      table.symbol,
      desc(table.createdAt),
    ),
  }),
);

export const personaMemories = pgTable(
  'persona_memories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    persona: text('persona').notNull(),
    symbol: text('symbol').notNull(),
    situation: text('situation'),
    recommendation: text('recommendation').notNull(),
    embedding: jsonb('embedding').$type<number[]>().notNull(),
    tradeDate: date('trade_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    personaSymbolIdx: index('idx_persona_memories_persona_symbol').on(table.persona, table.symbol),
    createdAtIdx: index('idx_persona_memories_created_at').on(desc(table.createdAt)),
  }),
);

export const autoPortfolios = pgTable(
  'auto_portfolios',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    status: autoPortfolioStatusEnum('status').default('pending').notNull(),
    automationEnabled: boolean('automation_enabled').default(false).notNull(),
    startingCapital: numeric('starting_capital', { precision: 18, scale: 2 })
      .$type<number>()
      .notNull(),
    currentCash: numeric('current_cash', { precision: 18, scale: 2 }).$type<number>().notNull(),
    sharpe: numeric('sharpe', { precision: 10, scale: 4 }).$type<number | null>(),
    drawdownPct: numeric('drawdown_pct', { precision: 6, scale: 3 }).$type<number | null>(),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('idx_auto_portfolios_user').on(table.userId),
    statusIdx: index('idx_auto_portfolios_status').on(table.status),
  }),
);

export const autoPortfolioSettings = pgTable(
  'auto_portfolio_settings',
  {
    portfolioId: uuid('portfolio_id')
      .references(() => autoPortfolios.id, { onDelete: 'cascade' })
      .primaryKey(),
    maxLeverage: numeric('max_leverage', { precision: 6, scale: 3 }).$type<number>().default(10),
    maxPositionPct: numeric('max_position_pct', { precision: 6, scale: 3 })
      .$type<number>()
      .default(50),
    maxDailyLoss: numeric('max_daily_loss', { precision: 10, scale: 2 }).$type<number | null>(),
    maxDrawdownPct: numeric('max_drawdown_pct', { precision: 6, scale: 3 }).$type<number | null>(),
    cooldownMinutes: integer('cooldown_minutes').default(15),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
);

export const portfolioPositions = pgTable(
  'portfolio_positions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    portfolioId: uuid('portfolio_id')
      .references(() => autoPortfolios.id, { onDelete: 'cascade' })
      .notNull(),
    symbol: text('symbol').notNull(),
    quantity: numeric('quantity', { precision: 28, scale: 12 }).$type<number>().notNull(),
    avgCost: numeric('avg_cost', { precision: 18, scale: 8 }).$type<number>().notNull(),
    markPrice: numeric('mark_price', { precision: 18, scale: 8 }).$type<number>().notNull(),
    unrealizedPnl: numeric('unrealized_pnl', { precision: 18, scale: 4 }).$type<number | null>(),
    leverage: numeric('leverage', { precision: 6, scale: 3 }).$type<number | null>(),
    confidence: numeric('confidence', { precision: 6, scale: 3 }).$type<number | null>(),
    riskUsd: numeric('risk_usd', { precision: 18, scale: 4 }).$type<number | null>(),
    exitPlan: jsonb('exit_plan').$type<Record<string, unknown> | null>(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    portfolioSymbolIdx: index('idx_positions_portfolio_symbol').on(table.portfolioId, table.symbol),
  }),
);

export const tradeOrders = pgTable(
  'trade_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    portfolioId: uuid('portfolio_id')
      .references(() => autoPortfolios.id, { onDelete: 'cascade' })
      .notNull(),
    clientOrderId: text('client_order_id').notNull().unique(),
    venue: text('venue').notNull(),
    symbol: text('symbol').notNull(),
    side: orderSideEnum('side').notNull(),
    orderType: orderTypeEnum('order_type').notNull(),
    quantity: numeric('quantity', { precision: 28, scale: 12 }).$type<number>().notNull(),
    price: numeric('price', { precision: 18, scale: 8 }).$type<number | null>(),
    status: orderStatusEnum('status').default('pending').notNull(),
    confidence: numeric('confidence', { precision: 6, scale: 3 }).$type<number | null>(),
    riskUsd: numeric('risk_usd', { precision: 18, scale: 4 }).$type<number | null>(),
    runId: uuid('run_id'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
  },
  (table) => ({
    portfolioIdx: index('idx_trade_orders_portfolio_created').on(table.portfolioId, desc(table.submittedAt)),
    runIdx: index('idx_trade_orders_run').on(table.runId),
  }),
);

export const tradeExecutions = pgTable(
  'trade_executions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .references(() => tradeOrders.id, { onDelete: 'cascade' })
      .notNull(),
    fillPrice: numeric('fill_price', { precision: 18, scale: 8 }).$type<number>().notNull(),
    fillQuantity: numeric('fill_quantity', { precision: 28, scale: 12 }).$type<number>().notNull(),
    fee: numeric('fee', { precision: 18, scale: 8 }).$type<number | null>(),
    liquidity: text('liquidity'),
    filledAt: timestamp('filled_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orderIdx: index('idx_trade_executions_order').on(table.orderId, table.filledAt),
  }),
);

export const portfolioSnapshots = pgTable(
  'portfolio_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    portfolioId: uuid('portfolio_id')
      .references(() => autoPortfolios.id, { onDelete: 'cascade' })
      .notNull(),
    equity: numeric('equity', { precision: 18, scale: 2 }).$type<number>().notNull(),
    cash: numeric('cash', { precision: 18, scale: 2 }).$type<number>().notNull(),
    positionsValue: numeric('positions_value', { precision: 18, scale: 2 }).$type<number>().notNull(),
    realizedPnl: numeric('realized_pnl', { precision: 18, scale: 2 }).$type<number>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    portfolioCreatedIdx: index('idx_portfolio_snapshots_portfolio_created').on(
      table.portfolioId,
      desc(table.createdAt),
    ),
  }),
);

export const llmPromptPayloads = pgTable(
  'llm_prompt_payloads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    storageUri: text('storage_uri').notNull(),
    sha256: text('sha256').notNull(),
    payloadType: promptPayloadTypeEnum('payload_type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    shaIdx: index('idx_llm_prompt_payloads_sha').on(table.sha256),
  }),
);

export const llmDecisionLogs = pgTable(
  'llm_decision_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    portfolioId: uuid('portfolio_id')
      .references(() => autoPortfolios.id, { onDelete: 'cascade' })
      .notNull(),
    runId: uuid('run_id').notNull(),
    symbol: text('symbol').notNull(),
    action: decisionActionEnum('action').notNull(),
    sizePct: numeric('size_pct', { precision: 6, scale: 3 }).$type<number | null>(),
    confidence: numeric('confidence', { precision: 6, scale: 3 }).$type<number | null>(),
    rationale: text('rationale'),
    promptRef: uuid('prompt_ref').references(() => llmPromptPayloads.id),
    cotRef: uuid('cot_ref').references(() => llmPromptPayloads.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    portfolioIdx: index('idx_llm_decision_logs_portfolio').on(table.portfolioId, desc(table.createdAt)),
    runIdx: index('idx_llm_decision_logs_run').on(table.runId),
  }),
);

export const autotradeEvents = pgTable(
  'autotrade_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    portfolioId: uuid('portfolio_id')
      .references(() => autoPortfolios.id, { onDelete: 'cascade' })
      .notNull(),
    eventType: autoEventTypeEnum('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    eventIdx: index('idx_autotrade_events_portfolio').on(table.portfolioId, desc(table.createdAt)),
  }),
);

export const schema = {
  tables: {
    users: users,
    user_identities: userIdentities,
    sessions: sessions,
    assessment_logs: assessmentLogs,
    persona_memories: personaMemories,
    auto_portfolios: autoPortfolios,
    auto_portfolio_settings: autoPortfolioSettings,
    portfolio_positions: portfolioPositions,
    trade_orders: tradeOrders,
    trade_executions: tradeExecutions,
    portfolio_snapshots: portfolioSnapshots,
    llm_prompt_payloads: llmPromptPayloads,
    llm_decision_logs: llmDecisionLogs,
    autotrade_events: autotradeEvents,
  },
} as const;

export type Schema = typeof schema;
