import axios from 'axios';

import { env } from '../config/env.js';

const REDDIT_BASE_URL = 'https://www.reddit.com';
const REDDIT_OAUTH_URL = 'https://oauth.reddit.com';
const REDDIT_TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const DEFAULT_USER_AGENT = env.redditUserAgent;
const TOKEN_REFRESH_BUFFER_MS = 60_000;
const MAX_POST_LIMIT = 50;

export interface RedditPostInsight {
  id: string;
  title: string;
  url: string;
  score: number;
  comments: number;
  createdAt: string;
  subreddit: string;
}

export interface RedditSubredditInsight {
  name: string;
  mentions: number;
}

export interface RedditInsightsResponse {
  ticker: string;
  query: string;
  totalPosts: number;
  totalUpvotes: number;
  averageComments: number;
  topSubreddits: RedditSubredditInsight[];
  posts: RedditPostInsight[];
  lastUpdated: string;
}

type RedditListingChild = {
  data?: Record<string, unknown>;
};

type RedditTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

type CachedToken = {
  value: string;
  expiresAt: number;
};

let cachedToken: CachedToken | null = null;

const buildPostUrl = (permalink: unknown, fallbackUrl: unknown): string | null => {
  if (typeof fallbackUrl === 'string' && fallbackUrl.startsWith('http')) {
    return fallbackUrl;
  }

  if (typeof permalink === 'string' && permalink) {
    return `${REDDIT_BASE_URL}${permalink}`;
  }

  return null;
};

const toNumber = (value: unknown): number => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const ensureCredentials = () => {
  if (!env.redditClientId || !env.redditClientSecret) {
    throw new Error('Reddit API credentials are not configured. Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET.');
  }
};

const requestAccessToken = async (): Promise<string> => {
  ensureCredentials();

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const params = new URLSearchParams({ grant_type: 'client_credentials' });

  const { data } = await axios.post<RedditTokenResponse>(REDDIT_TOKEN_URL, params, {
    auth: {
      username: env.redditClientId,
      password: env.redditClientSecret,
    },
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': DEFAULT_USER_AGENT,
    },
    timeout: 10_000,
  });

  const accessToken = typeof data?.access_token === 'string' ? data.access_token : '';
  const expiresInSeconds = Number.isFinite(data?.expires_in) ? Number(data?.expires_in) : 3600;

  if (!accessToken) {
    throw new Error('Failed to retrieve Reddit access token.');
  }

  const expiresAt = Date.now() + Math.max(expiresInSeconds * 1000 - TOKEN_REFRESH_BUFFER_MS, TOKEN_REFRESH_BUFFER_MS);
  cachedToken = { value: accessToken, expiresAt };

  return accessToken;
};

const getAccessToken = async (): Promise<string> => requestAccessToken();

export const getRedditInsights = async (
  ticker: string,
  limit = 10,
): Promise<RedditInsightsResponse> => {
  const symbol = ticker.trim().toUpperCase();

  if (!symbol) {
    throw new Error('Ticker symbol is required for Reddit insights.');
  }

  const token = await getAccessToken();
  const query = `${symbol} stock`;
  const normalizedLimit = Math.min(Math.max(limit, 1), MAX_POST_LIMIT);

  const { data } = await axios.get(`${REDDIT_OAUTH_URL}/search`, {
    params: {
      q: query,
      sort: 'hot',
      limit: normalizedLimit,
      type: 'link',
      t: 'week',
      restrict_sr: false,
    },
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': DEFAULT_USER_AGENT,
    },
    timeout: 10_000,
  });

  const children: RedditListingChild[] = Array.isArray(data?.data?.children)
    ? (data.data.children as RedditListingChild[])
    : [];

  const posts: RedditPostInsight[] = children
    .map((child: RedditListingChild) => {
      const payload = child?.data ?? {};

      if (typeof payload !== 'object' || payload === null) {
        return null;
      }

      const payloadRecord = payload as Record<string, unknown>;

      const id = typeof payloadRecord.id === 'string' ? payloadRecord.id : undefined;
      const title = typeof payloadRecord.title === 'string' ? payloadRecord.title.trim() : '';
      const subreddit = typeof payloadRecord.subreddit === 'string' ? payloadRecord.subreddit : '';
      const permalink = payloadRecord.permalink;
      const externalUrl = payloadRecord.url_overridden_by_dest ?? payloadRecord.url;
      const url = buildPostUrl(permalink, externalUrl);

      if (!id || !title || !url) {
        return null;
      }

      const score = toNumber(payloadRecord.ups ?? payloadRecord.score);
      const comments = toNumber(payloadRecord.num_comments);
      const createdUtc = toNumber(payloadRecord.created_utc);

      return {
        id,
        title,
        url,
        score,
        comments,
        subreddit,
        createdAt: createdUtc ? new Date(createdUtc * 1000).toISOString() : new Date().toISOString(),
      } satisfies RedditPostInsight;
    })
    .filter((item: RedditPostInsight | null): item is RedditPostInsight => Boolean(item));

  const subredditCount = posts.reduce<Record<string, number>>((acc, post) => {
    if (post.subreddit) {
      acc[post.subreddit] = (acc[post.subreddit] ?? 0) + 1;
    }
    return acc;
  }, {});

  const topSubreddits = Object.entries(subredditCount)
    .sort(([, countA], [, countB]) => countB - countA)
    .slice(0, 5)
    .map(([name, mentions]) => ({ name, mentions }));

  const totalUpvotes = posts.reduce((sum, post) => sum + post.score, 0);
  const totalComments = posts.reduce((sum, post) => sum + post.comments, 0);

  const averageComments = posts.length ? Number((totalComments / posts.length).toFixed(1)) : 0;

  return {
    ticker: symbol,
    query,
    totalPosts: posts.length,
    totalUpvotes,
    averageComments,
    topSubreddits,
    posts,
    lastUpdated: new Date().toISOString(),
  } satisfies RedditInsightsResponse;
};
