import type { RunnableInterface } from '@langchain/core/runnables';
import type { BaseMessage, AIMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';

import { env } from '../../config/env.js';
import { GoogleGenAiChatModel } from './providers/googleGenAiChatModel.js';

export type ChatModelRunnable = RunnableInterface<BaseMessage[], AIMessage>;
export type LlmProvider = 'openai' | 'grok' | 'google';

const normalizeModelId = (modelId: string): string => (modelId ?? '').trim().toLowerCase();

const googleModelMatches = (): Set<string> => {
  const set = new Set<string>();
  if (env.googleGenAiModel) {
    set.add(env.googleGenAiModel.trim().toLowerCase());
  }
  for (const model of env.googleGenAiAllowedModels) {
    set.add(model.trim().toLowerCase());
  }
  return set;
};

const grokModelMatches = (): Set<string> => {
  const set = new Set<string>();
  if (env.grokModel) {
    set.add(env.grokModel.trim().toLowerCase());
  }
  for (const model of env.grokAllowedModels) {
    set.add(model.trim().toLowerCase());
  }
  return set;
};

const GOOGLE_MODEL_PREFIXES = ['gemini-'];
const GROK_MODEL_PREFIXES = ['grok-'];

export const resolveProvider = (modelId: string): LlmProvider => {
  const normalized = normalizeModelId(modelId);
  const googleMatches = googleModelMatches();
  if (
    GOOGLE_MODEL_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
    googleMatches.has(normalized)
  ) {
    return 'google';
  }

  const grokMatches = grokModelMatches();
  if (
    GROK_MODEL_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
    grokMatches.has(normalized) ||
    normalized.startsWith('grok')
  ) {
    return 'grok';
  }

  return 'openai';
};

type CreateChatModelOptions = {
  modelId?: string;
  temperature?: number;
};

export const createChatModel = (options?: CreateChatModelOptions): ChatModelRunnable => {
  const requestedModel = options?.modelId ?? env.defaultTradingModel;
  const modelId = requestedModel?.trim() || env.defaultTradingModel;
  const provider = resolveProvider(modelId);
  const temperature = options?.temperature ?? 1;

  if (provider === 'grok') {
    if (!env.grokApiKey) {
      throw new Error('GROK_API_KEY is not configured. Cannot use Grok models.');
    }
    return new ChatOpenAI({
      apiKey: env.grokApiKey,
      model: modelId,
      temperature,
      configuration: { baseURL: env.grokBaseUrl },
    });
  }

  if (provider === 'google') {
    if (!env.googleGenAiApiKey) {
      throw new Error('GOOGLE_GENAI_API_KEY is not configured. Cannot use Google GenAI models.');
    }
    return new GoogleGenAiChatModel({
      apiKey: env.googleGenAiApiKey,
      model: modelId,
      temperature,
    });
  }

  if (!env.openAiApiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  return new ChatOpenAI({
    apiKey: env.openAiApiKey,
    model: modelId,
    temperature,
    ...(env.openAiBaseUrl ? { configuration: { baseURL: env.openAiBaseUrl } } : {}),
  });
};
