import { Router } from 'express'

import { env } from '../config/env.js'
import { fetchAutoTradePortfolio, fetchAutoTradeDecisions, fetchAutoTradeDecisionById } from '../services/autoTradeService.js'
import { autoTradeMockPortfolio } from '../mocks/autoTradeMock.js'
import {
  fetchPythonHealth,
  fetchSchedulerStatus,
  pauseScheduler,
  resumeScheduler,
  triggerScheduler,
} from '../services/autotradePythonService.js'

export const autotradeRouter = Router()

autotradeRouter.get('/v1/health', async (_req, res, next) => {
  if (!env.autotradeServiceUrl) {
    return res.status(503).json({
      status: 'unconfigured',
      detail: 'AUTOTRADE_SERVICE_URL is not set',
    })
  }

  try {
    const python = await fetchPythonHealth()
    res.json({ status: 'ok', python })
  } catch (error) {
    next(error)
  }
})

autotradeRouter.get('/v1/portfolio', async (_req, res, next) => {
  try {
    const portfolio = await fetchAutoTradePortfolio()
    res.json({ portfolio })
  } catch (error) {
    next(error)
  }
})

autotradeRouter.get('/v1/decisions', async (req, res, next) => {
  try {
    const symbolFilter = typeof req.query.symbol === 'string' ? req.query.symbol.toUpperCase() : undefined
    const items = await fetchAutoTradeDecisions(symbolFilter)
    res.json({ items, next_cursor: null })
  } catch (error) {
    next(error)
  }
})

autotradeRouter.get('/v1/decisions/:decisionId', async (req, res, next) => {
  const decisionId = typeof req.params.decisionId === 'string' ? req.params.decisionId.trim() : ''
  if (!decisionId) {
    return res.status(400).json({ error: 'decisionId is required', field: 'decisionId' })
  }
  try {
    const decision = await fetchAutoTradeDecisionById(decisionId)
    if (!decision) {
      return res.status(404).json({ error: 'Decision not found' })
    }
    res.json({ decision })
  } catch (error) {
    next(error)
  }
})

autotradeRouter.post('/v1/actions/pause', (_req, res) => {
  // Mock implementation – in production this would persist an event and toggle automation
  res.status(204).end()
})

autotradeRouter.post('/v1/actions/resume', (_req, res) => {
  res.status(204).end()
})

autotradeRouter.post('/v1/evaluate-now', (_req, res) => {
  const runId = `mock-run-${Date.now()}`
  const scheduledFor = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  res.json({ run_id: runId, scheduled_for: scheduledFor })
})

autotradeRouter.get('/v1/metrics', async (_req, res, next) => {
  try {
    const scheduler = await fetchSchedulerStatus()
    res.json({ scheduler })
  } catch (error) {
    next(error)
  }
})

autotradeRouter.get('/v1/scheduler/status', async (_req, res, next) => {
  try {
    const scheduler = await fetchSchedulerStatus()
    res.json({ scheduler })
  } catch (error) {
    next(error)
  }
})

autotradeRouter.post('/v1/scheduler/pause', async (_req, res, next) => {
  try {
    const scheduler = await pauseScheduler()
    res.json({ status: 'paused', scheduler })
  } catch (error) {
    next(error)
  }
})

autotradeRouter.post('/v1/scheduler/resume', async (_req, res, next) => {
  try {
    const scheduler = await resumeScheduler()
    res.json({ status: 'running', scheduler })
  } catch (error) {
    next(error)
  }
})

autotradeRouter.post('/v1/scheduler/trigger', async (_req, res, next) => {
  try {
    const result = await triggerScheduler()
    res.json(result)
  } catch (error) {
    next(error)
  }
})
