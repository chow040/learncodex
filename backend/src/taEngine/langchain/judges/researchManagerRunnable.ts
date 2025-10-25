import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import type { RunnableInterface } from '@langchain/core/runnables';
import { AIMessage } from '@langchain/core/messages';

export interface ResearchManagerInput {
  debateHistory: string;
  marketReport: string;
  sentimentReport: string;
  newsReport: string;
  fundamentalsReport: string;
  pastMemories: string;
}

export const RESEARCH_MANAGER_SYSTEM_PROMPT = `As the portfolio manager and debate facilitator, your role is to critically evaluate this round of debate and make a definitive decision: align with the bear analyst, the bull analyst, or choose Hold only if it is strongly justified based on the arguments presented.

Summarize the key points from both sides concisely, focusing on the most compelling evidence or reasoning. Your recommendation—Buy, Sell, or Hold—must be clear and actionable. Avoid defaulting to Hold simply because both sides have valid points; commit to a stance grounded in the debate's strongest arguments.

Additionally, develop a detailed investment plan for the trader. This should include:

Your Recommendation: A decisive stance supported by the most convincing arguments.
Rationale: An explanation of why these arguments lead to your conclusion.
Strategic Actions: Concrete steps for implementing the recommendation.
Take into account your past mistakes on similar situations. Use these insights to refine your decision-making and ensure you are learning and improving. Present your analysis conversationally, as if speaking naturally, without special formatting.`;

export const buildResearchManagerUserMessage = (input: ResearchManagerInput): string => {
  const pastReflections =
    input.pastMemories && input.pastMemories.trim().length > 0 ? input.pastMemories.trim() : '(none)';
  const debateHistory = input.debateHistory && input.debateHistory.trim().length > 0 ? input.debateHistory : '(none)';

  return `Here are your past reflections on mistakes:
"${pastReflections}"

Here is the debate:
Debate History:
${debateHistory}`;
};

const messageToString = (message: unknown): string => {
  if (typeof message === 'string') return message;
  if (message instanceof AIMessage) {
    if (typeof message.content === 'string') return message.content;
    if (Array.isArray(message.content)) {
      return message.content
        .map((chunk: unknown) => (typeof chunk === 'string' ? chunk : JSON.stringify(chunk)))
        .join('');
    }
    return message.content ? JSON.stringify(message.content) : '';
  }
  if (message && typeof (message as any).content === 'string') {
    return (message as any).content;
  }
  return JSON.stringify(message ?? '');
};

export const createResearchManagerRunnable = (
  llm: RunnableInterface<any, any>,
): RunnableInterface<ResearchManagerInput, string> => {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', RESEARCH_MANAGER_SYSTEM_PROMPT],
    ['human', '{userMessage}'],
  ]);

  const prepareInputs = new RunnableLambda({
    func: async (input: ResearchManagerInput) => ({
      userMessage: buildResearchManagerUserMessage(input),
    }),
  });

  const convertOutput = new RunnableLambda({
    func: async (message: unknown) => messageToString(message),
  });

  return RunnableSequence.from([
    prepareInputs,
    prompt,
    llm,
    convertOutput,
  ]);
};
