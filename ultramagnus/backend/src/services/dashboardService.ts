import type { DashboardFilters, DashboardView, DashboardError, ActivityEvent } from '../types/dashboard.js';
import { listReportsByUser } from './reportService.js';
import { listBookmarksByUserWithResolution } from './bookmarkService.js';
import { listActivityByUser } from './activityService.js';

export const fetchDashboard = async (userId: string, filters: DashboardFilters): Promise<{ dashboard: DashboardView; errors: DashboardError[] }> => {
  const errors: DashboardError[] = [];

  const reportsPromise = listReportsByUser(userId, filters);
  const bookmarksPromise = listBookmarksByUserWithResolution(userId, filters);
  const activityPromise = listActivityByUser(userId, filters.activityLimit || 50);

  const [reportsResult, bookmarksResult, activityResult] = await Promise.allSettled([reportsPromise, bookmarksPromise, activityPromise]);

  const reports = reportsResult.status === 'fulfilled' ? reportsResult.value : [];
  if (reportsResult.status === 'rejected') {
    errors.push({ section: 'reports', message: reportsResult.reason?.message || 'Failed to load reports' });
  }

  const bookmarks = bookmarksResult.status === 'fulfilled' ? bookmarksResult.value.bookmarks : [];
  if (bookmarksResult.status === 'fulfilled' && bookmarksResult.value.errors.length > 0) {
    errors.push(...bookmarksResult.value.errors);
  }
  if (bookmarksResult.status === 'rejected') {
    errors.push({ section: 'bookmarks', message: bookmarksResult.reason?.message || 'Failed to load bookmarks' });
  }

  const recentActivity = activityResult.status === 'fulfilled' ? activityResult.value : [];
  if (activityResult.status === 'rejected') {
    errors.push({ section: 'activity', message: activityResult.reason?.message || 'Failed to load activity' });
  }

  const limitedActivity = (recentActivity as ActivityEvent[])
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, filters.activityLimit || 50);

  const dashboard: DashboardView = {
    userId,
    reports,
    bookmarks,
    recentActivity: limitedActivity,
    generatedAt: new Date().toISOString()
  };

  return { dashboard, errors };
};
