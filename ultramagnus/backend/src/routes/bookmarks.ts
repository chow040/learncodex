import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { addBookmark, removeBookmark, listBookmarksPageByUser } from '../services/bookmarkService.js';
import { clampPagination } from '../utils/validation.js';
import { DEFAULT_PAGE_SIZE } from '../config/limits.js';

export const bookmarksRouter = Router();

bookmarksRouter.get('/bookmarks', requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const { page, pageSize } = clampPagination({
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || DEFAULT_PAGE_SIZE
  });

  try {
    const result = await listBookmarksPageByUser(userId, { bookmarksPage: page, bookmarksPageSize: pageSize });
    return res.json(result);
  } catch (err: any) {
    req.log?.error({ message: 'bookmarks.list.failed', err, userId });
    return res.status(500).json({ error: 'Failed to load bookmarks', correlationId: req.correlationId });
  }
});

bookmarksRouter.post('/bookmarks', requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const { targetId, targetType = 'report', pinned = false } = req.body || {};

  if (!targetId) {
    return res.status(400).json({ error: 'targetId is required' });
  }

  try {
    const bookmarkId = await addBookmark(userId, targetId, targetType, pinned);
    return res.status(201).json({ ok: true, bookmarkId });
  } catch (err: any) {
    if (err?.status === 400) {
      return res.status(400).json({ error: err.message || 'Invalid bookmark request' });
    }
    if (err?.status === 403) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (err?.status === 404) {
      return res.status(404).json({ error: 'Target report not found' });
    }
    req.log?.error({ message: 'bookmarks.create.failed', err, userId, targetId });
    return res.status(500).json({ error: 'Failed to add bookmark', correlationId: req.correlationId });
  }
});

bookmarksRouter.delete('/bookmarks/:id', requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Missing bookmark id' });
  }

  try {
    await removeBookmark(userId, id);
    return res.json({ ok: true });
  } catch (err: any) {
    if (err?.status === 404) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }
    req.log?.error({ message: 'bookmarks.delete.failed', err, userId, bookmarkId: id });
    return res.status(500).json({ error: 'Failed to remove bookmark', correlationId: req.correlationId });
  }
});
