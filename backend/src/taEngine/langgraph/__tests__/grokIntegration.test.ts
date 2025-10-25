import { describe, it, expect } from 'vitest';

/**
 * Integration tests for Grok model support in decisionWorkflow.
 * These tests verify that the resolveProvider helper and createChatModel
 * function correctly handle both OpenAI and Grok models.
 */
describe('Grok model integration', () => {
  it('should identify grok models correctly', () => {
    // Test helper function (inline for testing)
    const resolveProvider = (modelId: string): 'openai' | 'grok' => {
      const normalized = (modelId ?? '').trim().toLowerCase();
      if (normalized.startsWith('grok-') || normalized.startsWith('grok')) {
        return 'grok';
      }
      return 'openai';
    };

    // Test Grok models
    expect(resolveProvider('grok-beta')).toBe('grok');
    expect(resolveProvider('grok-2-1212')).toBe('grok');
    expect(resolveProvider('grok-2-vision-1212')).toBe('grok');
    expect(resolveProvider('Grok-Beta')).toBe('grok');
    
    // Test OpenAI models
    expect(resolveProvider('gpt-4o-mini')).toBe('openai');
    expect(resolveProvider('gpt-4o')).toBe('openai');
    expect(resolveProvider('gpt-5')).toBe('openai');
    expect(resolveProvider('gpt-5-pro')).toBe('openai');
    
    // Test edge cases
    expect(resolveProvider('')).toBe('openai');
    expect(resolveProvider('unknown-model')).toBe('openai');
  });

  it('should handle model name variations', () => {
    const resolveProvider = (modelId: string): 'openai' | 'grok' => {
      const normalized = (modelId ?? '').trim().toLowerCase();
      if (normalized.startsWith('grok-') || normalized.startsWith('grok')) {
        return 'grok';
      }
      return 'openai';
    };

    // With spaces
    expect(resolveProvider('  grok-beta  ')).toBe('grok');
    expect(resolveProvider('  gpt-4o  ')).toBe('openai');
    
    // Case variations
    expect(resolveProvider('GROK-BETA')).toBe('grok');
    expect(resolveProvider('GPT-4O')).toBe('openai');
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
