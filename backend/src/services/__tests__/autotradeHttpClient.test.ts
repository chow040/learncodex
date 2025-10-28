import { beforeEach, describe, expect, it, vi } from 'vitest';

const axiosCreateMock = vi.fn();
const requestUseMock = vi.fn();

vi.mock('axios', () => ({
  default: { create: axiosCreateMock },
  create: axiosCreateMock,
}));

const buildMockInstance = () => ({
  interceptors: {
    request: {
      use: requestUseMock,
    },
  },
});

describe('getAutotradeHttpClient', () => {
  beforeEach(() => {
    vi.resetModules();
    axiosCreateMock.mockReset();
    requestUseMock.mockReset();
    process.env.AUTOTRADE_SERVICE_URL = 'http://127.0.0.1:8000';
    process.env.AUTOTRADE_SERVICE_KEY = 'sk-test';
  });

  it('creates an axios client with baseURL, timeout, and service key header', async () => {
    axiosCreateMock.mockReturnValue(buildMockInstance());

    const { getAutotradeHttpClient, resetAutotradeHttpClient } = await import('../autotradeHttpClient.js');

    const client = getAutotradeHttpClient();
    expect(client).toBeDefined();

    expect(axiosCreateMock).toHaveBeenCalledWith({
      baseURL: 'http://127.0.0.1:8000',
      timeout: 10_000,
      headers: { 'user-agent': 'autotrade-gateway/1.0' },
    });

    expect(requestUseMock).toHaveBeenCalledTimes(1);
    const interceptor = requestUseMock.mock.calls[0][0];
    const configWithoutHeaders = interceptor({});
    expect(configWithoutHeaders.headers['x-service-key']).toBe('sk-test');

    const configWithHeaders = interceptor({ headers: { 'x-service-key': 'custom-key' } });
    expect(configWithHeaders.headers['x-service-key']).toBe('custom-key');

    resetAutotradeHttpClient();
  });

  it('throws when AUTOTRADE_SERVICE_URL is missing', async () => {
    delete process.env.AUTOTRADE_SERVICE_URL;
    axiosCreateMock.mockReturnValue(buildMockInstance());

    const { getAutotradeHttpClient, resetAutotradeHttpClient } = await import('../autotradeHttpClient.js');

    expect(() => getAutotradeHttpClient()).toThrow('AUTOTRADE_SERVICE_URL is not configured');

    resetAutotradeHttpClient();
  });
});
