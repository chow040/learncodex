import { randomUUID } from 'crypto';
// In lieu of a persisted store, use lightweight in-memory mock data per user.
const sampleReports = (userId) => [
    {
        id: randomUUID(),
        title: 'AI Infrastructure Outlook',
        status: 'complete',
        ownerId: userId,
        type: 'equity',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
        updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString()
    },
    {
        id: randomUUID(),
        title: 'Renewable Storage Watchlist',
        status: 'running',
        ownerId: userId,
        type: 'equity',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
        updatedAt: new Date().toISOString()
    },
    {
        id: randomUUID(),
        title: 'Space Launch Vehicles Snapshot',
        status: 'draft',
        ownerId: userId,
        type: 'equity',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
        updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString()
    }
];
const sampleBookmarks = (userId) => [
    {
        id: randomUUID(),
        targetId: 'ai-infra-outlook',
        targetType: 'report',
        userId,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
        pinned: true,
        updatedAt: new Date().toISOString()
    },
    {
        id: randomUUID(),
        targetId: 'renewable-storage',
        targetType: 'report',
        userId,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
        pinned: false,
        updatedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString()
    }
];
const sampleActivity = (userId) => [
    {
        id: randomUUID(),
        userId,
        targetId: 'ai-infra-outlook',
        targetType: 'report',
        verb: 'view',
        occurredAt: new Date(Date.now() - 1000 * 60 * 15).toISOString()
    },
    {
        id: randomUUID(),
        userId,
        targetId: 'renewable-storage',
        targetType: 'report',
        verb: 'generate',
        occurredAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString()
    },
    {
        id: randomUUID(),
        userId,
        targetId: 'space-launch',
        targetType: 'report',
        verb: 'share',
        occurredAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
    }
];
export const fetchDashboard = async (userId, filters) => {
    const errors = [];
    const reportsPromise = Promise.resolve(sampleReports(userId));
    const bookmarksPromise = Promise.resolve(sampleBookmarks(userId));
    const activityPromise = Promise.resolve(sampleActivity(userId));
    const [reportsResult, bookmarksResult, activityResult] = await Promise.allSettled([reportsPromise, bookmarksPromise, activityPromise]);
    const reports = reportsResult.status === 'fulfilled' ? reportsResult.value : [];
    if (reportsResult.status === 'rejected') {
        errors.push({ section: 'reports', message: reportsResult.reason?.message || 'Failed to load reports' });
    }
    const bookmarks = bookmarksResult.status === 'fulfilled' ? bookmarksResult.value : [];
    if (bookmarksResult.status === 'rejected') {
        errors.push({ section: 'bookmarks', message: bookmarksResult.reason?.message || 'Failed to load bookmarks' });
    }
    const recentActivity = activityResult.status === 'fulfilled' ? activityResult.value : [];
    if (activityResult.status === 'rejected') {
        errors.push({ section: 'activity', message: activityResult.reason?.message || 'Failed to load activity' });
    }
    const limitedActivity = recentActivity
        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
        .slice(0, filters.activityLimit || 50);
    const dashboard = {
        userId,
        reports,
        bookmarks,
        recentActivity: limitedActivity,
        generatedAt: new Date().toISOString()
    };
    return { dashboard, errors };
};
