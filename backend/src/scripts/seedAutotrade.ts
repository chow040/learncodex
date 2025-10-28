import { randomUUID } from "node:crypto"
import { eq, inArray } from "drizzle-orm"

import { db } from "../db/client.js"
import {
  autoPortfolios,
  autoPortfolioSettings,
  autotradeEvents,
  portfolioPositions,
  llmPromptPayloads,
  llmDecisionLogs,
  users,
} from "../db/schema.js"

const PORTFOLIO_ID = "11111111-1111-1111-1111-111111111111"
const USER_ID = "00000000-0000-0000-0000-000000000000"
const PROMPT_ID = "22222222-2222-2222-2222-222222222222"
const COT_ID = "33333333-3333-3333-3333-333333333333"

const ensureDb = () => {
  if (!db) {
    console.error("[seedAutotrade] DATABASE_URL is not configured. Aborting.")
    process.exit(1)
  }
  return db
}

async function seed() {
  const client = ensureDb()

  console.log("[seedAutotrade] Seeding auto-trading portfolio…")

  // Ensure pilot user exists (idempotent)
  await client
    .insert(users)
    .values({
      id: USER_ID,
      email: "autotrade-pilot@example.com",
      emailVerified: true,
      fullName: "Autotrade Pilot",
      avatarUrl: null,
    })
    .onConflictDoNothing()

  // Cleanup previous seed data if rerun
  await client.delete(llmDecisionLogs).where(eq(llmDecisionLogs.portfolioId, PORTFOLIO_ID))
  await client.delete(portfolioPositions).where(eq(portfolioPositions.portfolioId, PORTFOLIO_ID))
  await client.delete(autoPortfolioSettings).where(eq(autoPortfolioSettings.portfolioId, PORTFOLIO_ID))
  await client.delete(autotradeEvents).where(eq(autotradeEvents.portfolioId, PORTFOLIO_ID))
  await client.delete(autoPortfolios).where(eq(autoPortfolios.id, PORTFOLIO_ID))
  await client.delete(llmPromptPayloads).where(inArray(llmPromptPayloads.id, [PROMPT_ID, COT_ID]))

  // Portfolio + settings
  await client.insert(autoPortfolios).values({
    id: PORTFOLIO_ID,
    userId: USER_ID,
    status: "active",
    automationEnabled: true,
    startingCapital: 20000,
    currentCash: 13654.1,
    sharpe: 0.58,
    drawdownPct: 3.1,
    lastRunAt: new Date("2025-10-27T04:45:00Z"),
  })

  await client.insert(autoPortfolioSettings).values({
    portfolioId: PORTFOLIO_ID,
    maxLeverage: 10,
    maxPositionPct: 50,
    maxDailyLoss: 1000,
    maxDrawdownPct: 5,
    cooldownMinutes: 15,
  })

  await client.insert(portfolioPositions).values([
    {
      id: randomUUID(),
      portfolioId: PORTFOLIO_ID,
      symbol: "BTC",
      quantity: 0.12,
      avgCost: 107343,
      markPrice: 115301.5,
      unrealizedPnl: 955.02,
      leverage: 10,
      confidence: 0.75,
      riskUsd: 619.23,
      exitPlan: {
        profitTarget: 118136.15,
        stopLoss: 102026.675,
        invalidation: "Close below 105000 on 3-minute candle",
      },
    },
    {
      id: randomUUID(),
      portfolioId: PORTFOLIO_ID,
      symbol: "ETH",
      quantity: 5.74,
      avgCost: 4189.12,
      markPrice: 4214.55,
      unrealizedPnl: 145.97,
      leverage: 10,
      confidence: 0.65,
      riskUsd: 722.78,
      exitPlan: {
        profitTarget: 4568.31,
        stopLoss: 4065.43,
        invalidation: "Close below 4000 on 3-minute candle",
      },
    },
  ])

  await client.insert(llmPromptPayloads).values([
    {
      id: PROMPT_ID,
      storageUri: "s3://autotrade/prompts/run-001.json",
      sha256: "prompt-sha",
      payloadType: "prompt",
    },
    {
      id: COT_ID,
      storageUri: "s3://autotrade/cot/run-001.txt",
      sha256: "cot-sha",
      payloadType: "cot",
    },
  ])

  const decisionId = randomUUID()
  const runId = randomUUID()

  await client.insert(llmDecisionLogs).values({
    id: decisionId,
    portfolioId: PORTFOLIO_ID,
    runId,
    symbol: "BTC",
    action: "hold",
    sizePct: 0,
    confidence: 0.78,
    rationale: "Momentum intact on 4h; funding neutral; invalidation untouched.",
    promptRef: PROMPT_ID,
    cotRef: COT_ID,
    createdAt: new Date("2025-10-27T04:45:00Z"),
  })

  await client.insert(autotradeEvents).values([
    {
      id: randomUUID(),
      portfolioId: PORTFOLIO_ID,
      eventType: "resume",
      payload: { label: "Paper mode engaged" },
      createdAt: new Date("2025-10-27T00:00:00Z"),
    },
    {
      id: randomUUID(),
      portfolioId: PORTFOLIO_ID,
      eventType: "risk_override",
      payload: { label: "Risk cap raised to $750/trade" },
      createdAt: new Date("2025-10-26T18:20:00Z"),
    },
  ])

  console.log("[seedAutotrade] Seed complete.")
}

seed()
  .catch((error) => {
    console.error("[seedAutotrade] Failed: ", error)
    process.exit(1)
  })
  .finally(() => {
    process.exit(0)
  })
