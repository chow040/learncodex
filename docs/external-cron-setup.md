# External Cron Setup

Vercel removed cron support for our plan, so scheduler triggers now come from cronjob.org (or any external HTTP cron). This doc captures the wiring so future deploys stay healthy.

## Flow

1. The Python service exposes `POST /internal/autotrade/v1/scheduler/cron-trigger`.
2. We set `AUTOTRADE_CRON_TRIGGER_TOKEN` so only trusted callers can reach it. Every cron request must include `X-Cron-Token: <token>`.
3. Cronjob.org hits the endpoint on a cadence that matches `AUTOTRADE_DECISION_INTERVAL_MINUTES` (default 3 minutes).
4. The scheduler still records `nextRunAt` internally, so the dashboard timer stays accurate.

## Cronjob.org recipe

1. Create a new job → Request type `POST`.
2. URL: `https://YOUR-AUTOTRADE.vercel.app/internal/autotrade/v1/scheduler/cron-trigger`.
3. Headers:
   - `Content-Type: application/json`
   - `X-Cron-Token: ${AUTOTRADE_CRON_TRIGGER_TOKEN}`
4. Body can stay empty (`{}`) because the service ignores it.
5. Schedule: `*/3 * * * *` (or match whatever you set for `AUTOTRADE_DECISION_INTERVAL_MINUTES`).
6. Enable failure notifications so we know if cron stops firing.

### Smoke test command

```bash
curl -i \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-Cron-Token: $AUTOTRADE_CRON_TRIGGER_TOKEN" \
  https://YOUR-AUTOTRADE.vercel.app/internal/autotrade/v1/scheduler/cron-trigger
```

Expect `200` with `{"triggered_at": "...", "scheduler": {...}}`.

## Checklist

- [ ] `AUTOTRADE_CRON_TRIGGER_TOKEN` set in Vercel dashboard (same value shared with cronjob.org)
- [ ] Deployment includes the new token and exposes `/scheduler/cron-trigger`
- [ ] Cronjob.org POST configured with the token header and correct cadence
- [ ] Manual curl succeeds and returns scheduler metadata
- [ ] Cronjob.org dashboard shows green executions for the last 24 hours
