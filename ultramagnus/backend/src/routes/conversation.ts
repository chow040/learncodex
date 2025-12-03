import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  appendMessage,
  ConversationError,
  getConversation,
  summarizeIfNeeded
} from '../services/conversationService.js';
import { logger } from '../utils/logger.js';

export const conversationRouter = Router();

conversationRouter.get('/reports/:id/chat', requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const { id } = req.params;
  const limit = Number(req.query.limit) || undefined;

  try {
    const conversation = await getConversation(id, userId, limit);
    return res.json(conversation);
  } catch (err: any) {
    const status = err instanceof ConversationError ? err.status || 400 : 500;
    if (status >= 500) {
      req.log?.error({ message: 'conversation.fetch.failed', err, userId, reportId: id });
    } else {
      req.log?.warn({ message: 'conversation.fetch.blocked', err, userId, reportId: id });
    }
    return res.status(status).json({ error: err.message || 'Failed to fetch conversation', code: err.code });
  }
});

conversationRouter.post('/reports/:id/chat', requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const { id } = req.params;
  const { role, content, model } = req.body || {};

  try {
    const { messageId, sessionId } = await appendMessage({ reportId: id, userId, role, content, model });
    const conversation = await getConversation(id, userId, Number(req.query.limit) || undefined);
    const summaryResult = await summarizeIfNeeded(id, userId);
    return res.status(201).json({ messageId, sessionId, conversation, summaryResult });
  } catch (err: any) {
    const status = err instanceof ConversationError ? err.status || 400 : 500;
    if (status >= 500) {
      logger.error({ message: 'conversation.append.failed', err, userId, reportId: id });
    } else {
      logger.warn({ message: 'conversation.append.blocked', err, userId, reportId: id });
    }
    return res.status(status).json({ error: err.message || 'Failed to append message', code: err.code });
  }
});
