import axios from 'axios';

const REDDIT_BASE_URL = 'https://www.reddit.com';
const DEFAULT_USER_AGENT =
  'EquityInsightApp/1.0 (+https://example.com/contact)';

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

export const getRedditInsights = async (
  ticker: string,
  limit = 10,
): Promise<RedditInsightsResponse> => {
  const symbol = ticker.trim().toUpperCase();

  if (!symbol) {
    throw new Error('Ticker symbol is required for Reddit insights.');
  }

  const query = `${symbol} stock`;

  const { data } = await axios.get(`${REDDIT_BASE_URL}/search.json`, {
    params: {
      q: query,
      sort: 'hot',
      limit,
      type: 'link',
      t: 'week',
      restrict_sr: false,
    },
    headers: {
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

      const id = typeof payload.id === 'string' ? payload.id : undefined;
      const title = typeof payload.title === 'string' ? payload.title.trim() : '';
      const subreddit = typeof payload.subreddit === 'string' ? payload.subreddit : '';
      const permalink = payload.permalink;
      const url = buildPostUrl(permalink, payload.url_overridden_by_dest ?? payload.url);

      if (!id || !title || !url) {
        return null;
      }

      const score = toNumber(payload.ups ?? payload.score);
      const comments = toNumber(payload.num_comments);
      const createdUtc = toNumber(payload.created_utc);

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





