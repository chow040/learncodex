import type {
  AgentConfiguration,
  AgentContextPolicyConfig,
  PromptProfileDetail,
} from '../types/adminDashboard.js';
import { extractToolDirectives } from './promptToolDirectives.js';

export interface AssemblePromptInput {
  agent: AgentConfiguration;
  promptProfile: PromptProfileDetail;
  tickers: string[];
  question?: string;
  contextBlock?: string;
}

export interface AssembledPrompt {
  behaviorBlock: string;
  systemPrompt: string;
  contextBlock?: string;
  userBlock: string;
  assembledPrompt: string;
  tokenEstimate: number;
}

export const buildBehaviorBlock = (agent: AgentConfiguration): string => {
  const sections = [
    `Agent: ${agent.name}`,
    `Description: ${agent.description}`,
    `Default Horizon: ${agent.defaultHorizon}`,
    `Tone: ${agent.defaultTone}`,
    `Risk Bias: ${agent.defaultRiskBias}`,
    `Focus: ${agent.defaultFocus}`,
  ];
  return sections.join('\n');
};

export const buildSystemPrompt = (
  agent: AgentConfiguration,
  promptProfile: PromptProfileDetail,
): string => {
  const behaviorBlock = buildBehaviorBlock(agent);
  const { sanitizedContent } = extractToolDirectives(promptProfile.content ?? '');
  const schemaSection = promptProfile.outputSchemaExample
    ? `\n\nExpected Output Format:\n${promptProfile.outputSchemaExample}`
    : '';
  return `${behaviorBlock}\n\n${sanitizedContent}${schemaSection}`;
};

export const buildUserBlock = (tickers: string[], question?: string): string => {
  const tickersText = tickers.join(', ');
  const sanitizedQuestion = question?.trim() || 'General analysis';
  return ['## Analysis Request', `Tickers: ${tickersText}`, `Question: ${sanitizedQuestion}`].join('\n');
};

const estimateTokens = (...sections: Array<string | undefined>): number => {
  const totalChars = sections.reduce((sum, section) => sum + (section?.length ?? 0), 0);
  return Math.max(1, Math.ceil(totalChars / 4));
};

export const assembleAgentPrompt = (input: AssemblePromptInput): AssembledPrompt => {
  const systemPrompt = buildSystemPrompt(input.agent, input.promptProfile);
  const userBlock = buildUserBlock(input.tickers, input.question);
  const contextBlock = input.contextBlock?.trim() ? input.contextBlock : undefined;
  const assembledPrompt = [systemPrompt, contextBlock, userBlock]
    .filter((section): section is string => Boolean(section))
    .join('\n\n');

  const result: AssembledPrompt = {
    behaviorBlock: buildBehaviorBlock(input.agent),
    systemPrompt,
    userBlock,
    assembledPrompt,
    tokenEstimate: estimateTokens(systemPrompt, contextBlock, userBlock),
  };
  if (contextBlock) {
    result.contextBlock = contextBlock;
  }
  return result;
};

export const describeContextPolicy = (policy?: AgentContextPolicyConfig | null): string | undefined => {
  if (!policy) return undefined;
  const lines = ['## Historical Context'];
  if (policy.includePreviousAnalyses) {
    lines.push(
      `- Include up to ${policy.maxAnalyses} previous analyses (token budget ${policy.maxContextTokens}).`,
    );
  }
  if (policy.includeUserNotes) {
    lines.push('- Include user notes when available.');
  }
  if (policy.includeGlobalSummary) {
    lines.push('- Include the latest global macro summary.');
  }
  if (lines.length === 1) {
    lines.push('- No historical context is currently enabled.');
  }
  return lines.join('\n');
};
