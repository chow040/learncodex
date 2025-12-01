export type ReportStatus = 'draft' | 'running' | 'complete' | 'failed';

export interface ReportSummary {
  id: string;
  title: string;
  status: ReportStatus;
  ownerId: string;
  type: string;
  ticker?: string;
  verdict?: string;
  rocketScore?: number;
  currentPrice?: string;
  priceChange?: string;
  priceTarget?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportDetail extends ReportSummary {
  payload: unknown;
}

export interface Bookmark {
  id: string;
  targetId: string;
  targetType: string;
  userId: string;
  createdAt: string;
  pinned: boolean;
  updatedAt?: string;
  report?: ReportSummary;
}

export interface ActivityEvent {
  id: string;
  userId: string;
  targetId: string;
  targetType: string;
  verb: 'view' | 'edit' | 'share' | 'generate';
  occurredAt: string;
  metadata?: Record<string, string>;
}

export interface DashboardView {
  userId: string;
  reports: ReportSummary[];
  bookmarks: Bookmark[];
  recentActivity: ActivityEvent[];
  generatedAt: string;
}

export interface DashboardError {
  section: 'reports' | 'bookmarks' | 'activity';
  message: string;
}

export interface DashboardFilters {
  reportsPage?: number;
  reportsPageSize?: number;
  reportsStatus?: string;
  reportsType?: string;
  bookmarksPage?: number;
  bookmarksPageSize?: number;
  activityLimit?: number;
}
