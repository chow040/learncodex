import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from '../config/env.js';
import type { TradingAgentsPayload, AgentPrompt } from './types.js';
import type { TradingAgentsDecision } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultTaLogsDir = path.resolve(__dirname, '..', '..', 'logs');

const resolveTaLogsDir = (): string => {
  const configured = env.taLogDir?.trim();
  return configured && configured.length > 0 ? path.resolve(configured) : defaultTaLogsDir;
};

// Write agent prompts to backend/logs as a JSON file for later debugging.
export async function logAgentPrompts(
  payload: TradingAgentsPayload,
  prompts: AgentPrompt[],
  mode: string
): Promise<string> {
  const logsDir = resolveTaLogsDir();

  try {
    await fs.mkdir(logsDir, { recursive: true });
  } catch (err) {
    // if mkdir fails, keep going and let writeFile report the error
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safeSymbol = (payload.symbol || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `ta_prompts_${ts}_${safeSymbol}_${Math.random().toString(36).slice(2,8)}.json`;
  const filePath = path.join(logsDir, filename);

  const out = {
    createdAt: new Date().toISOString(),
    symbol: payload.symbol,
    tradeDate: payload.tradeDate,
    mode,
    contextSummary: {
      market_technical_report: payload.context?.market_technical_report ?? null,
      social_reddit_summary: payload.context?.social_reddit_summary ?? null,
      news_company: payload.context?.news_company ?? null,
      // fundamentals_summary intentionally omitted from logs
    },
    prompts: prompts.map((p) => ({ roleLabel: p.roleLabel, system: p.system, user: p.user })),
  };

  await fs.writeFile(filePath, JSON.stringify(out, null, 2), 'utf8');

  return filePath;
}

// Emit a summary JSON similar to Python logs under eval_results/<SYMBOL>/TradingAgentsStrategy_logs
export async function writeEvalSummary(
  payload: TradingAgentsPayload,
  decision: TradingAgentsDecision,
  details: {
    investmentDebateHistory?: string;
    bullArg?: string | null;
    bearArg?: string | null;
    riskDebateHistory?: string;
    riskyOut?: string | null;
    safeOut?: string | null;
    neutralOut?: string | null;
  } = {},
): Promise<string> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const baseDir = path.resolve(__dirname, '..', '..');
  const symbol = (payload.symbol || 'UNKNOWN').toUpperCase();
  const logDir = path.join(baseDir, 'eval_results', symbol, 'TradingAgentsStrategy_logs');

  await fs.mkdir(logDir, { recursive: true }).catch(() => {});

  const date = payload.tradeDate || new Date().toISOString().slice(0, 10);
  const fname = `full_states_log_${date}.json`;
  const fpath = path.join(logDir, fname);

  const out = {
    [date]: {
      company_of_interest: symbol,
      trade_date: payload.tradeDate,
      market_report: decision.marketReport ?? null,
      sentiment_report: decision.sentimentReport ?? null,
      news_report: decision.newsReport ?? null,
      fundamentals_report: decision.fundamentalsReport ?? null,
      investment_debate_state: {
        bull_history: details.bullArg ?? null,
        bear_history: details.bearArg ?? null,
        history: details.investmentDebateHistory ?? null,
        current_response: decision.investmentPlan ?? null,
        judge_decision: decision.investmentJudge ?? decision.investmentPlan ?? null,
      },
      trader_investment_decision: decision.traderPlan ?? null,
      risk_debate_state: {
        risky_history: details.riskyOut ?? null,
        safe_history: details.safeOut ?? null,
        neutral_history: details.neutralOut ?? null,
        history: details.riskDebateHistory ?? null,
        judge_decision: decision.riskJudge ?? null,
      },
      investment_plan: decision.investmentPlan ?? null,
      final_trade_decision: decision.finalTradeDecision ?? decision.decision,
    },
  } as const;

  await fs.writeFile(fpath, JSON.stringify(out, null, 2), 'utf8');
  return fpath;
}

export async function logFundamentalsToolCalls(
  payload: TradingAgentsPayload,
  entries: Array<{ toolCallId: string; name: string | null; args: unknown; output: string }>,
): Promise<string | null> {
  if (!entries.length) return null;

  const logsDir = resolveTaLogsDir();

  await fs.mkdir(logsDir, { recursive: true }).catch(() => {});

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safeSymbol = (payload.symbol || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `ta_toolcalls_${ts}_${safeSymbol}_${Math.random().toString(36).slice(2, 8)}.json`;
  const filePath = path.join(logsDir, filename);

  const serializableEntries = entries.map((entry) => ({
    toolCallId: entry.toolCallId,
    name: entry.name,
    args: entry.args ?? null,
    output: entry.output,
  }));

  const payloadSummary = {
    createdAt: new Date().toISOString(),
    symbol: payload.symbol,
    tradeDate: payload.tradeDate,
    entries: serializableEntries,
  };

  await fs.writeFile(filePath, JSON.stringify(payloadSummary, null, 2), 'utf8');
  return filePath;
}

export async function logFundamentalsConversation(
  payload: TradingAgentsPayload,
  messages: any[],
  stepCount: number,
  toolCallsMade: number,
): Promise<string | null> {
  if (!messages.length) return null;

  const logsDir = resolveTaLogsDir();

  await fs.mkdir(logsDir, { recursive: true }).catch(() => {});

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safeSymbol = (payload.symbol || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `ta_conversation_${ts}_${safeSymbol}_${Math.random().toString(36).slice(2, 8)}.json`;
  const filePath = path.join(logsDir, filename);

  // Sanitize messages for logging
  const sanitizedMessages = messages.map((msg, index) => {
    const content = typeof msg.content === 'string' ? msg.content : 
                   Array.isArray(msg.content) ? JSON.stringify(msg.content) :
                   msg.content ? String(msg.content) : null;
    
    return {
      step: index + 1,
      role: msg.role,
      content: content,
      tool_calls: msg.tool_calls ? msg.tool_calls.length : 0,
      tool_calls_details: msg.tool_calls || null,
    };
  });

  const conversationLog = {
    createdAt: new Date().toISOString(),
    symbol: payload.symbol,
    tradeDate: payload.tradeDate,
    stepCount,
    toolCallsMade,
    messages: sanitizedMessages,
  };

  await fs.writeFile(filePath, JSON.stringify(conversationLog, null, 2), 'utf8');
  return filePath;
}

