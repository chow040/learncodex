// @ts-nocheck
import OpenAI from 'openai';
import { env } from '../../config/env.js';
import { logAgentPrompts, writeEvalSummary } from '../logger.js';
import { MarketAnalyst } from '../agents/analyst/MarketAnalyst.js';
import { NewsAnalyst } from '../agents/analyst/NewsAnalyst.js';
import { SocialAnalyst } from '../agents/analyst/SocialAnalyst.js';
import { FundamentalsAnalyst } from '../agents/analyst/FundamentalsAnalyst.js';
import { BullResearcher } from '../agents/researcher/BullResearcher.js';
import { BearResearcher } from '../agents/researcher/BearResearcher.js';
import { ResearchManager } from '../agents/managers/ResearchManager.js';
import { RiskyAnalyst, SafeAnalyst, NeutralAnalyst } from '../agents/riskanalyst/RiskDebators.js';
import { TraderAgent } from '../agents/trader/TraderAgent.js';
import { getPastMemories, appendMemory } from '../memoryStore.js';
import { StateFundamentalsAgent } from './stateFundamentalsAgent.js';
const systemPrompt = `You are an efficient assistant designed to analyze market, news, social, and fundamentals reports and output only one of: BUY, SELL, or HOLD. Reply with exactly one word: BUY, SELL, or HOLD.`;

// Simplified decision extraction:
// 1) Prefer a line like "Final Recommendation: BUY|SELL|HOLD" (case-insensitive, markdown-friendly)
// 2) Fallback: last standalone BUY/SELL/HOLD token
// 3) Default NO DECISION
const normalizeDecision = (text) => {
    const t = (text ?? '').toString();
    const m = t.match(/^\s*(?:#+\s*)?(?:Final\s+(?:Recommendation|Decision|Verdict))\s*[:\-]\s*\**\s*(BUY|SELL|HOLD)\s*\**/im);
    if (m) return m[1].toUpperCase();
    const matches = [...t.toUpperCase().matchAll(/\b(BUY|SELL|HOLD)\b/g)];
    if (matches.length) return matches[matches.length - 1][1];
    return 'NO DECISION';
};
export class TradingOrchestrator {
    client;
    market = new MarketAnalyst();
    news = new NewsAnalyst();
    social = new SocialAnalyst();
    fundamentals = new FundamentalsAnalyst();
    stateFundamentals;
    bull = new BullResearcher();
    bear = new BearResearcher();
    researchManager = new ResearchManager();
    risky = new RiskyAnalyst();
    safe = new SafeAnalyst();
    neutral = new NeutralAnalyst();
    trader = new TraderAgent();
    constructor() {
        if (!env.openAiApiKey) {
            throw new Error('OPENAI_API_KEY is not configured.');
        }
        this.client = new OpenAI({ apiKey: env.openAiApiKey, baseURL: env.openAiBaseUrl });
        this.stateFundamentals = new StateFundamentalsAgent(this.client);
    }
    async run(payload) {
        const { symbol, tradeDate, context } = payload;
        const prompts = [
            this.market.analyze(context, symbol, tradeDate),
            this.news.analyze(context, symbol, tradeDate),
            this.social.analyze(context, symbol, tradeDate),
            this.fundamentals.analyze(context, symbol, tradeDate),
        ];
        const mode = env.tradingAgentsEngineMode;
        // attempt to write prompts to a debug log file for later inspection; don't fail the run if logging fails
        try {
            // fire-and-forget but await so errors are caught locally
            await logAgentPrompts(payload, prompts, mode);
        }
        catch (e) {
            // swallow logging errors intentionally
            // console.debug('Logging failed', e);
        }
        if (mode === 'multi') {
            // Multi-turn: run analysts, then bull/bear debate, manager judge, trader, risk debate, risk manager judge
            const callAgent = async (p) => {
                const resp = await this.client.responses.create({
                    model: env.openAiModel,
                    input: [
                        { role: 'system', content: p.system },
                        { role: 'user', content: p.user },
                    ],
                });
                return resp.output_text?.trim() ?? '';
            };
            const withTimeout = (promise, ms = 150000) => new Promise((resolve, reject) => {
                const t = setTimeout(() => reject(new Error('Agent call timed out')), ms);
                promise
                    .then((v) => { clearTimeout(t); resolve(v); })
                    .catch((e) => { clearTimeout(t); reject(e); });
            });
            // 1) Base analysts in parallel
            const [marketPrompt, newsPrompt, socialPrompt, fundamentalsPrompt] = prompts;
            const mp = marketPrompt ?? this.market.analyze(context, symbol, tradeDate);
            const np = newsPrompt ?? this.news.analyze(context, symbol, tradeDate);
            const sp = socialPrompt ?? this.social.analyze(context, symbol, tradeDate);
            const fp = fundamentalsPrompt ?? this.fundamentals.analyze(context, symbol, tradeDate);
            console.log(`[Orchestrator] Starting parallel execution of 4 agents for ${symbol}...`);
            const [marketOut, newsOut, socialOut, fundamentalsOut] = await Promise.all([
                withTimeout(callAgent(mp)).catch(err => { 
                    console.error(`[Orchestrator] Market agent failed for ${symbol}:`, err); 
                    return `Market analysis unavailable: ${err.message}`; 
                }),
                withTimeout(callAgent(np)).catch(err => { 
                    console.error(`[Orchestrator] News agent failed for ${symbol}:`, err); 
                    return `News analysis unavailable: ${err.message}`; 
                }),
                withTimeout(callAgent(sp)).catch(err => { 
                    console.error(`[Orchestrator] Social agent failed for ${symbol}:`, err); 
                    return `Social analysis unavailable: ${err.message}`; 
                }),
                withTimeout(this.stateFundamentals.executeWithState(fp.system, fp.user, context, symbol, tradeDate, payload)).catch(err => { 
                    console.error(`[Orchestrator] StateFundamentals agent failed for ${symbol}:`, err); 
                    return `Fundamentals analysis unavailable: ${err.message}`; 
                }),
            ]);
            console.log(`[Orchestrator] All 4 agents completed for ${symbol}`);
            // 2) Investment debate: Bear then Bull (configurable rounds)
            const investRounds = Math.max(1, env.investDebateRounds ?? 1);
            let investHistory = '';
            let lastBearArg = null;
            let lastBullArg = null;
            for (let i = 0; i < investRounds; i++) {
                const bearArg = await withTimeout(callAgent(this.bear.analyze(context, symbol, tradeDate, investHistory, lastBullArg ?? '')));
                lastBearArg = bearArg?.trim() || null;
                investHistory = [
                    investHistory,
                    lastBearArg ? `Bear Analyst (Round ${i + 1}): ${lastBearArg}` : '',
                ].filter(Boolean).join('\n');
                const bullArg = await withTimeout(callAgent(this.bull.analyze(context, symbol, tradeDate, investHistory, lastBearArg ?? '')));
                lastBullArg = bullArg?.trim() || null;
                investHistory = [
                    investHistory,
                    lastBullArg ? `Bull Analyst (Round ${i + 1}): ${lastBullArg}` : '',
                ].filter(Boolean).join('\n');
            }
            // 3) Research Manager judge -> investment plan
            const managerPast = await getPastMemories(symbol, 'manager').catch(() => '');
            const investJudgePrompt = this.researchManager.judge(investHistory, marketOut || context.market_technical_report, socialOut || context.social_reddit_summary, newsOut || context.news_company, fundamentalsOut || context.fundamentals_summary, managerPast || '');
            const investmentPlan = await withTimeout(callAgent(investJudgePrompt));
            // 4) Trader proposes final plan
            const traderPast = await getPastMemories(symbol, 'trader').catch(() => '');
            const traderPrompt = this.trader.propose(symbol, investmentPlan, marketOut || context.market_technical_report, socialOut || context.social_reddit_summary, newsOut || context.news_company, fundamentalsOut || context.fundamentals_summary, traderPast || '');
            const traderPlan = await withTimeout(callAgent(traderPrompt));
            // 5) Risk debate: risky -> safe -> neutral (configurable rounds)
            const riskRounds = Math.max(1, env.riskDebateRounds ?? 1);
            let riskHistory = '';
            let lastRisky = null;
            let lastSafe = null;
            let lastNeutral = null;
            for (let i = 0; i < riskRounds; i++) {
                const riskyOut = await withTimeout(callAgent(this.risky.analyze(context, traderPlan, riskHistory, lastSafe ?? '', lastNeutral ?? '')));
                lastRisky = riskyOut?.trim() || null;
                riskHistory = [riskHistory, lastRisky ? `Risky Analyst (Round ${i + 1}): ${lastRisky}` : ''].filter(Boolean).join('\n');
                const safeOut = await withTimeout(callAgent(this.safe.analyze(context, traderPlan, riskHistory, lastRisky ?? '', lastNeutral ?? '')));
                lastSafe = safeOut?.trim() || null;
                riskHistory = [riskHistory, lastSafe ? `Safe Analyst (Round ${i + 1}): ${lastSafe}` : ''].filter(Boolean).join('\n');
                const neutralOut = await withTimeout(callAgent(this.neutral.analyze(context, traderPlan, riskHistory, lastRisky ?? '', lastSafe ?? '')));
                lastNeutral = neutralOut?.trim() || null;
                riskHistory = [riskHistory, lastNeutral ? `Neutral Analyst (Round ${i + 1}): ${lastNeutral}` : ''].filter(Boolean).join('\n');
            }
            // 6) Risk Manager judge -> final trade decision
                                    const riskJudgeSystem = `As the Risk Management Judge and Debate Facilitator, evaluate risky/safe/neutral debate and output a clear recommendation: Buy, Sell, or Hold. Include detailed reasoning. Learn from past mistakes.`;
            const riskPast = await getPastMemories(symbol, 'riskManager').catch(() => '');
            const riskJudgeUser = [
                `Trader plan:\n${traderPlan}`,
                `Debate history:\n${riskHistory || '(none)'}`,
                `Market report:\n${marketOut || context.market_technical_report}`,
                `Sentiment report:\n${socialOut || context.social_reddit_summary}`,
                `News report:\n${newsOut || context.news_company}`,
                `Fundamentals report:\n${fundamentalsOut || context.fundamentals_summary}`,
                `Past reflections:\n${riskPast || ''}`,
            ].join('\n\n');
            const riskJudgeResp = await withTimeout(callAgent({ roleLabel: 'Risk Manager', system: riskJudgeSystem, user: riskJudgeUser }));
            const finalDecision = normalizeDecision(riskJudgeResp);
            // Aggregate
            const result = {
                symbol,
                tradeDate,
                decision: finalDecision,
                finalTradeDecision: finalDecision,
                investmentPlan,
                traderPlan,
                investmentJudge: investmentPlan,
                riskJudge: riskJudgeResp,
                marketReport: marketOut || context.market_technical_report,
                sentimentReport: socialOut || context.social_reddit_summary,
                newsReport: newsOut || context.news_company,
                fundamentalsReport: fundamentalsOut || context.fundamentals_summary,
                debugPrompt: '',
            };
            // Write eval summary JSON mirroring Python logs (best-effort)
            try {
                await writeEvalSummary(payload, result, {
                    investmentDebateHistory: investHistory,
                    bullArg: lastBullArg,
                    bearArg: lastBearArg,
                    riskDebateHistory: riskHistory,
                    riskyOut: lastRisky,
                    safeOut: lastSafe,
                    neutralOut: lastNeutral,
                });
            }
            catch { }
            // Append short reflections to memory store (best-effort)
            try {
                const today = tradeDate || new Date().toISOString().slice(0, 10);
                await appendMemory({ symbol, date: today, role: 'manager', summary: `Plan: ${investmentPlan?.slice(0, 240) || ''}` });
                await appendMemory({ symbol, date: today, role: 'trader', summary: `Trader: ${traderPlan?.slice(0, 240) || ''}` });
                await appendMemory({ symbol, date: today, role: 'riskManager', summary: `Risk: ${riskJudgeResp?.slice(0, 240) || ''} | Decision: ${finalDecision}` });
            }
            catch { }
            return result;
        }
        // Single-call mode (default)
        const userSections = prompts
            .map((p) => `### ${p.roleLabel}\nSYSTEM CONTEXT:\n${p.system}\n\nINPUT:\n${p.user}`)
            .join('\n\n');
        const userPrompt = [`Symbol: ${symbol} | Trade date: ${tradeDate}`, userSections].join('\n\n');
        const debugPrompt = [`SYSTEM: ${systemPrompt}`, '---', userPrompt].join('\n');
        const response = await this.client.responses.create({
            model: env.openAiModel,
            input: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
        });
        const text = response.output_text?.trim() ?? 'HOLD';
        const decision = normalizeDecision(text);
        const result = {
            symbol,
            tradeDate,
            decision,
            finalTradeDecision: decision,
            investmentPlan: null,
            traderPlan: null,
            investmentJudge: null,
            riskJudge: null,
            marketReport: context.market_technical_report,
            sentimentReport: context.social_reddit_summary,
            newsReport: context.news_company,
            fundamentalsReport: context.fundamentals_summary,
            debugPrompt,
        };
        // Emit a compact summary file for single mode as well
        try {
            await writeEvalSummary(payload, result, {
                investmentDebateHistory: '',
                bullArg: null,
                bearArg: null,
                riskDebateHistory: '',
            });
        }
        catch { }
        // Append basic memories based on single-call decision
        try {
            const today = tradeDate || new Date().toISOString().slice(0, 10);
            await appendMemory({ symbol, date: today, role: 'manager', summary: `Decision: ${decision}` });
            await appendMemory({ symbol, date: today, role: 'trader', summary: `Decision context captured.` });
            await appendMemory({ symbol, date: today, role: 'riskManager', summary: `Final: ${decision}` });
        }
        catch { }
        return result;
    }
}
//# sourceMappingURL=orchestrator.js.map
