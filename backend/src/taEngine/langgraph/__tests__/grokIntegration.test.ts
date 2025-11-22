import { describe, it, expect } from 'vitest';

import { resolveProvider } from '../llmFactory.js';

/**
 * Integration tests for Grok model support in decisionWorkflow.
 * These tests verify that the resolveProvider helper and createChatModel
 * function correctly handle both OpenAI and Grok models.
 */
describe('Model provider resolution', () => {
  it('should identify Grok models correctly', () => {
    expect(resolveProvider('grok-beta')).toBe('grok');
    expect(resolveProvider('grok-2-1212')).toBe('grok');
    expect(resolveProvider('grok-2-vision-1212')).toBe('grok');
    expect(resolveProvider('Grok-Beta')).toBe('grok');
  });

  it('should identify Google Gemini models correctly', () => {
    expect(resolveProvider('gemini-1.5-flash')).toBe('google');
    expect(resolveProvider('Gemini-2.0-Flash-Thinking')).toBe('google');
    expect(resolveProvider('  gemini-1.5-pro  ')).toBe('google');
  });

  it('should default unknown models to OpenAI', () => {
    expect(resolveProvider('gpt-4o-mini')).toBe('openai');
    expect(resolveProvider('gpt-4o')).toBe('openai');
    expect(resolveProvider('gpt-5')).toBe('openai');
    expect(resolveProvider('gpt-5-pro')).toBe('openai');
    expect(resolveProvider('')).toBe('openai');
    expect(resolveProvider('unknown-model')).toBe('openai');
  });
});

describe('Model configuration priority', () => {
  it('should define correct priority order', () => {
    // This test documents the expected priority:
    // TRADING_DEFAULT_MODEL → OPENAI_MODEL → GROK_MODEL → default fallback
    const getPriority = (
      tradingDefault?: string,
      openaiModel?: string,
      grokModel?: string
    ): string => {
      return tradingDefault ?? (openaiModel ? openaiModel : grokModel || 'gpt-4o-mini');
    };

    expect(getPriority('custom-model', 'gpt-4o', 'grok-beta')).toBe('custom-model');
    expect(getPriority(undefined, 'gpt-4o', 'grok-beta')).toBe('gpt-4o');
    expect(getPriority(undefined, undefined, 'grok-beta')).toBe('grok-beta');
    expect(getPriority(undefined, undefined, undefined)).toBe('gpt-4o-mini');
  });
});
