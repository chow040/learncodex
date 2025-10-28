import axios, { type AxiosInstance } from 'axios';

import { env } from '../config/env.js';

let client: AxiosInstance | null = null;

const USER_AGENT = 'autotrade-gateway/1.0';
const DEFAULT_TIMEOUT_MS = 10_000;

export const getAutotradeHttpClient = (): AxiosInstance => {
  if (!env.autotradeServiceUrl) {
    throw new Error('AUTOTRADE_SERVICE_URL is not configured');
  }

  if (client) {
    return client;
  }

  client = axios.create({
    baseURL: env.autotradeServiceUrl,
    timeout: DEFAULT_TIMEOUT_MS,
    headers: {
      'user-agent': USER_AGENT,
    },
  });

  client.interceptors.request.use((config) => {
    if (env.autotradeServiceKey) {
      config.headers = config.headers ?? {};
      if (!config.headers['x-service-key']) {
        config.headers['x-service-key'] = env.autotradeServiceKey;
      }
    }
    return config;
  });

  return client;
};

/** Test hook to clear the cached Axios instance. */
export const resetAutotradeHttpClient = (): void => {
  client = null;
};

