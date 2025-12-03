import { and, count, desc, eq, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  conversationMessages,
  conversationSessions,
  conversationSummaries,
  reports
} from '../db/schema.js';
import {
  CONVERSATION_DEFAULT_WINDOW,
  CONVERSATION_MAX_WINDOW,
  CONVERSATION_RETENTION_DAYS,
  CONVERSATION_SUMMARY_ANCHOR_COUNT,
  CONVERSATION_SUMMARY_BYTE_THRESHOLD,
  CONVERSATION_SUMMARY_MAX_CHARS,
  CONVERSATION_SUMMARY_MESSAGE_THRESHOLD,
  MAX_CONVERSATION_MESSAGE_BYTES,
  MAX_CONVERSATION_TOTAL_BYTES
} from '../config/limits.js';
import { getGenAiClient } from '../clients/genai.js';
import { logger } from '../utils/logger.js';

type MessageRole = 'user' | 'assistant' | 'system';

export class ConversationError extends Error {
  status?: number;
  code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const byteLength = (text: string) => Buffer.byteLength(text || '', 'utf8');

const ensureReportOwnership = async (reportId: string, userId: string) => {
  const [row] = await db.select({ id: reports.id }).from(reports)
    .where(and(eq(reports.id, reportId), eq(reports.ownerId, userId)))
    .limit(1);
  if (!row) {
    throw new ConversationError('Report not found or forbidden', 403, 'forbidden');
  }
};

const getOrCreateSession = async (reportId: string, userId: string, model?: string) => {
  const [existing] = await db.select({ id: conversationSessions.id })
    .from(conversationSessions)
    .where(and(eq(conversationSessions.reportId, reportId), eq(conversationSessions.userId, userId)))
    .orderBy(desc(conversationSessions.createdAt))
    .limit(1);
  if (existing?.id) return existing.id;

  const [created] = await db.insert(conversationSessions).values({
    reportId,
    userId,
    model
  }).returning({ id: conversationSessions.id });
  return created?.id;
};

const getStorageUsage = async (reportId: string, userId: string) => {
  const [messageBytes] = await db.select({
    total: sql<number>`COALESCE(SUM(octet_length(${conversationMessages.content})), 0)`
  }).from(conversationMessages)
    .where(and(eq(conversationMessages.reportId, reportId), eq(conversationMessages.userId, userId)));

  const [summaryBytes] = await db.select({
    total: sql<number>`COALESCE(SUM(octet_length(${conversationSummaries.summary})), 0)`
  }).from(conversationSummaries)
    .where(eq(conversationSummaries.reportId, reportId));

  return Number(messageBytes?.total || 0) + Number(summaryBytes?.total || 0);
};

export const appendMessage = async (input: {
  reportId: string;
  userId: string;
  role: MessageRole;
  content: string;
  model?: string;
}) => {
  const { reportId, userId, role, content, model } = input;
  if (!content || typeof content !== 'string') {
    throw new ConversationError('content is required', 400, 'validation_failed');
  }
  if (!['user', 'assistant', 'system'].includes(role)) {
    throw new ConversationError('role must be user|assistant|system', 400, 'validation_failed');
  }

  await ensureReportOwnership(reportId, userId);

  const contentBytes = byteLength(content);
  if (contentBytes > MAX_CONVERSATION_MESSAGE_BYTES) {
    throw new ConversationError('message too large', 413, 'message_too_large');
  }

  const currentUsage = await getStorageUsage(reportId, userId);
  if (currentUsage + contentBytes > MAX_CONVERSATION_TOTAL_BYTES) {
    throw new ConversationError('conversation storage cap exceeded', 413, 'conversation_cap');
  }

  const sessionId = await getOrCreateSession(reportId, userId, model);
  if (!sessionId) {
    throw new ConversationError('unable to create session', 500, 'session_error');
  }

  const [message] = await db.insert(conversationMessages).values({
    sessionId,
    reportId,
    userId,
    role,
    content
  }).returning({ id: conversationMessages.id, createdAt: conversationMessages.createdAt });

  return { messageId: message?.id, sessionId };
};

const fetchMessagesAsc = async (reportId: string, userId: string) => {
  const rows = await db.select({
    id: conversationMessages.id,
    role: conversationMessages.role,
    content: conversationMessages.content,
    createdAt: conversationMessages.createdAt,
    sessionId: conversationMessages.sessionId
  }).from(conversationMessages)
    .where(and(eq(conversationMessages.reportId, reportId), eq(conversationMessages.userId, userId)))
    .orderBy(conversationMessages.createdAt);
  return rows;
};

const summarizeText = async (messages: { role: string; content: string; createdAt: Date | null }[]) => {
  const serialized = messages.map((m) => `${m.createdAt?.toISOString() || ''} [${m.role}]: ${m.content}`).join('\n');
  const clipped = serialized.length > 6000 ? serialized.slice(0, 6000) : serialized;
  try {
    const ai = getGenAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [
        { role: 'user', parts: [{ text: `Summarize the following conversation turns into concise bullets (<= ${CONVERSATION_SUMMARY_MAX_CHARS} chars). Preserve user asks and assistant replies. Return plain text.\n\n${clipped}` }] }
      ]
    });
    const text = response.text || '';
    return text.slice(0, CONVERSATION_SUMMARY_MAX_CHARS);
  } catch (err) {
    logger.warn({ message: 'conversation.summary.fallback', err });
    return clipped.slice(0, CONVERSATION_SUMMARY_MAX_CHARS);
  }
};

const upsertSummary = async (reportId: string, sessionId: string | null, summary: string, coverageUpTo: Date | null) => {
  const [existing] = await db.select({ id: conversationSummaries.id })
    .from(conversationSummaries)
    .where(eq(conversationSummaries.reportId, reportId))
    .limit(1);

  if (existing?.id) {
    await db.update(conversationSummaries)
      .set({
        summary,
        sessionId: sessionId || null,
        coverageUpTo: coverageUpTo || null,
        tokensEstimate: Math.ceil(summary.length / 4),
        updatedAt: new Date()
      })
      .where(eq(conversationSummaries.id, existing.id));
    return existing.id;
  }

  const [created] = await db.insert(conversationSummaries).values({
    reportId,
    sessionId: sessionId || null,
    summary,
    coverageUpTo: coverageUpTo || null,
    tokensEstimate: Math.ceil(summary.length / 4)
  }).returning({ id: conversationSummaries.id });
  return created?.id;
};

const pruneOldMessages = async (reportId: string, userId: string, coverageUpTo: Date | null) => {
  if (!coverageUpTo) return;
  await db.delete(conversationMessages)
    .where(and(
      eq(conversationMessages.reportId, reportId),
      eq(conversationMessages.userId, userId),
      lte(conversationMessages.createdAt, coverageUpTo)
    ));
};

const applyRetention = async (reportId: string, userId: string) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CONVERSATION_RETENTION_DAYS);
  await db.delete(conversationMessages)
    .where(and(
      eq(conversationMessages.reportId, reportId),
      eq(conversationMessages.userId, userId),
      lte(conversationMessages.createdAt, cutoff)
    ));
};

export const summarizeIfNeeded = async (reportId: string, userId: string) => {
  await ensureReportOwnership(reportId, userId);
  const [{ value: messageCountRaw }] = await db.select({ value: count() })
    .from(conversationMessages)
    .where(and(eq(conversationMessages.reportId, reportId), eq(conversationMessages.userId, userId)));
  const messageCount = Number(messageCountRaw || 0);
  const totalBytes = await getStorageUsage(reportId, userId);
  const overThreshold = messageCount > CONVERSATION_SUMMARY_MESSAGE_THRESHOLD || totalBytes > CONVERSATION_SUMMARY_BYTE_THRESHOLD;
  if (!overThreshold) {
    return { summarized: false };
  }

  const messages = await fetchMessagesAsc(reportId, userId);
  if (!messages.length) {
    return { summarized: false };
  }

  const cutoffIndex = Math.max(0, messages.length - CONVERSATION_SUMMARY_ANCHOR_COUNT);
  const toSummarize = messages.slice(0, cutoffIndex);
  if (!toSummarize.length) {
    return { summarized: false };
  }

  const summary = await summarizeText(toSummarize);
  const coverageUpTo = toSummarize[toSummarize.length - 1]?.createdAt || null;
  const sessionId = messages[messages.length - 1]?.sessionId || null;

  await upsertSummary(reportId, sessionId, summary, coverageUpTo);
  await pruneOldMessages(reportId, userId, coverageUpTo);
  await applyRetention(reportId, userId);

  return { summarized: true, coverageUpTo };
};

export const getConversation = async (reportId: string, userId: string, limit?: number) => {
  await ensureReportOwnership(reportId, userId);
  const safeLimit = Math.max(1, Math.min(limit || CONVERSATION_DEFAULT_WINDOW, CONVERSATION_MAX_WINDOW));

  const [summary] = await db.select({
    summary: conversationSummaries.summary,
    coverageUpTo: conversationSummaries.coverageUpTo
  }).from(conversationSummaries)
    .where(eq(conversationSummaries.reportId, reportId))
    .orderBy(desc(conversationSummaries.updatedAt))
    .limit(1);

  const rows = await db.select({
    id: conversationMessages.id,
    role: conversationMessages.role,
    content: conversationMessages.content,
    createdAt: conversationMessages.createdAt
  }).from(conversationMessages)
    .where(and(eq(conversationMessages.reportId, reportId), eq(conversationMessages.userId, userId)))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(safeLimit);

  const messages = rows.reverse();

  return {
    summary: summary?.summary ? {
      text: summary.summary,
      coverageUpTo: summary.coverageUpTo
    } : null,
    messages
  };
};
