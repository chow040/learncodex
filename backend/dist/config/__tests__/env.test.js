import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
describe('env configuration with Grok support', () => {
    const originalEnv = process.env;
    beforeEach(() => {
        // Reset process.env before each test
        process.env = { ...originalEnv };
    });
    afterEach(() => {
        // Restore original env after each test
        process.env = originalEnv;
        // Clear module cache to force re-evaluation of env.ts
        vi.resetModules();
    });
    it('should merge OpenAI and Grok models into tradingAllowedModels', async () => {
        process.env.OPENAI_API_KEY = 'test-openai-key';
        process.env.GROK_API_KEY = 'test-grok-key';
        process.env.GROK_MODEL = 'grok-beta';
        const { env } = await import('../env.js');
        expect(env.tradingAllowedModels).toContain('gpt-4o-mini');
        expect(env.tradingAllowedModels).toContain('grok-beta');
    });
    it('should set defaultTradingModel based on priority', async () => {
        process.env.OPENAI_API_KEY = 'test-openai-key';
        process.env.OPENAI_MODEL = 'gpt-4o';
        process.env.TRADING_DEFAULT_MODEL = 'gpt-4o-mini';
        const { env } = await import('../env.js');
        expect(env.defaultTradingModel).toBe('gpt-4o-mini');
    });
    it('should fall back to OPENAI_MODEL when TRADING_DEFAULT_MODEL is not set', async () => {
        process.env.OPENAI_API_KEY = 'test-openai-key';
        process.env.OPENAI_MODEL = 'gpt-4o';
        const { env } = await import('../env.js');
        expect(env.defaultTradingModel).toBe('gpt-4o');
    });
    it('should fall back to GROK_MODEL when neither TRADING_DEFAULT_MODEL nor OPENAI_MODEL is set', async () => {
        process.env.GROK_API_KEY = 'test-grok-key';
        process.env.GROK_MODEL = 'grok-beta';
        delete process.env.OPENAI_MODEL;
        const { env } = await import('../env.js');
        expect(env.defaultTradingModel).toBe('grok-beta');
    });
    it('should warn when Grok model configured without API key', async () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
        process.env.OPENAI_API_KEY = 'test-openai-key';
        process.env.GROK_MODEL = 'grok-beta';
        delete process.env.GROK_API_KEY;
        await import('../env.js');
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Grok model(s) configured but GROK_API_KEY is not set'));
        consoleWarnSpy.mockRestore();
    });
    it('should export Grok configuration variables', async () => {
        process.env.OPENAI_API_KEY = 'test-openai-key';
        process.env.GROK_API_KEY = 'test-grok-key';
        process.env.GROK_BASE_URL = 'https://api.x.ai/v1';
        process.env.GROK_MODEL = 'grok-beta';
        process.env.GROK_ALLOWED_MODELS = 'grok-beta,grok-2-1212';
        const { env } = await import('../env.js');
        expect(env.grokApiKey).toBe('test-grok-key');
        expect(env.grokBaseUrl).toBe('https://api.x.ai/v1');
        expect(env.grokModel).toBe('grok-beta');
        expect(env.grokAllowedModels).toEqual(['grok-beta', 'grok-2-1212']);
    });
    it('should handle TRADING_ALLOWED_MODELS override', async () => {
        process.env.OPENAI_API_KEY = 'test-openai-key';
        process.env.GROK_API_KEY = 'test-grok-key';
        process.env.TRADING_ALLOWED_MODELS = 'gpt-4o,grok-beta,custom-model';
        const { env } = await import('../env.js');
        expect(env.tradingAllowedModels).toContain('gpt-4o');
        expect(env.tradingAllowedModels).toContain('grok-beta');
        expect(env.tradingAllowedModels).toContain('custom-model');
    });
    it('should use default Grok models when GROK_ALLOWED_MODELS is not set', async () => {
        process.env.OPENAI_API_KEY = 'test-openai-key';
        process.env.GROK_API_KEY = 'test-grok-key';
        delete process.env.GROK_ALLOWED_MODELS;
        delete process.env.GROK_MODEL;
        const { env } = await import('../env.js');
        // Should include default Grok models
        expect(env.tradingAllowedModels).toContain('grok-beta');
        expect(env.tradingAllowedModels).toContain('grok-2-1212');
        expect(env.tradingAllowedModels).toContain('grok-2-vision-1212');
    });
});
//# sourceMappingURL=env.test.js.map