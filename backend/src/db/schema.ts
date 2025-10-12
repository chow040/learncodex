import { desc } from 'drizzle-orm';
import { bigserial, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import type {
  AssessmentContext,
  AssessmentInput,
  AssessmentPayload,
} from '../services/openaiService.js';

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

export const schema = {
  tables: {
    assessment_logs: assessmentLogs,
  },
} as const;

export type Schema = typeof schema;

