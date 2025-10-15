import { desc } from 'drizzle-orm';
import { bigserial, index, jsonb, pgTable, text, timestamp, uuid, boolean, pgEnum } from 'drizzle-orm/pg-core';
// Auth-related enums
export const providerEnum = pgEnum('provider', ['google']);
// Users table - canonical user records
export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').unique().notNull(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    fullName: text('full_name'),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    emailIdx: index('idx_users_email').on(table.email),
}));
// User identities - OAuth provider mappings
export const userIdentities = pgTable('user_identities', {
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
}, (table) => ({
    providerSubIdx: index('idx_user_identities_provider_sub').on(table.provider, table.providerSub),
    userIdIdx: index('idx_user_identities_user_id').on(table.userId),
}));
// Sessions table - track user sessions
export const sessions = pgTable('sessions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
}, (table) => ({
    userIdIdx: index('idx_sessions_user_id').on(table.userId),
    expiresAtIdx: index('idx_sessions_expires_at').on(table.expiresAt),
}));
export const assessmentLogs = pgTable('assessment_logs', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    symbol: text('symbol').notNull(),
    requestPayload: jsonb('request_payload').$type().notNull(),
    contextPayload: jsonb('context_payload').$type(),
    assessmentPayload: jsonb('assessment_payload')
        .$type()
        .notNull(),
    rawText: text('raw_text'),
    promptText: text('prompt_text'),
    systemPrompt: text('system_prompt'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    symbolCreatedAtIdx: index('idx_assessment_logs_symbol_created_at').on(table.symbol, desc(table.createdAt)),
}));
export const schema = {
    tables: {
        users: users,
        user_identities: userIdentities,
        sessions: sessions,
        assessment_logs: assessmentLogs,
    },
};
//# sourceMappingURL=schema.js.map