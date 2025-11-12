# 🚀 Vercel Deployment Checklist

Use this checklist to ensure you don't miss any steps during deployment.

## Pre-Deployment ✓

### Code Preparation
- [ ] All code committed and pushed to GitHub
- [ ] `.env` files are in `.gitignore`
- [ ] Production build works locally:
  ```bash
  cd backend && npm run build
  cd ../equity-insight-react && npm run build
  ```
- [ ] All tests pass (if applicable)
- [ ] No console.log() or debug code in production

### Environment Variables Ready
- [ ] Database credentials (Supabase)
- [ ] API keys (OpenAI, DeepSeek, OKX)
- [ ] Google OAuth credentials
- [ ] JWT secret (generate: `openssl rand -base64 32`)
- [ ] All keys saved securely (password manager)

### Accounts Created
- [ ] GitHub account with repo access
- [ ] Vercel account (vercel.com)
- [ ] Railway account (railway.app)
- [ ] Supabase account (if not already)

---

## Deployment Steps ✓

### 1. Frontend Deployment (10 min)
- [ ] Login to Vercel
- [ ] Click "Add New..." → "Project"
- [ ] Import GitHub repository
- [ ] Root directory: `equity-insight-react`
- [ ] Framework: Vite
- [ ] Add environment variables (leave API URLs blank for now)
- [ ] Deploy and wait for completion
- [ ] Note frontend URL: `_________________`

### 2. Backend Deployment (15 min)
- [ ] In Vercel, click "Add New..." → "Project"
- [ ] Import same GitHub repository
- [ ] Root directory: `backend`
- [ ] Add ALL environment variables:
  - [ ] DATABASE_URL
  - [ ] SUPABASE_URL
  - [ ] SUPABASE_ANON_KEY
  - [ ] OPENAI_API_KEY
  - [ ] DEEPSEEK_API_KEY
  - [ ] LANGCHAIN_API_KEY
  - [ ] XAI_API_KEY
  - [ ] GOOGLE_CLIENT_ID
  - [ ] GOOGLE_CLIENT_SECRET
  - [ ] JWT_SECRET
  - [ ] NODE_ENV=production
  - [ ] ALLOWED_ORIGINS=(your frontend URL)
- [ ] Deploy and wait for completion
- [ ] Note backend URL: `_________________`
- [ ] Test: `curl https://your-backend.vercel.app/health`

### 3. Update Frontend with Backend URL
- [ ] Go to frontend project in Vercel
- [ ] Settings → Environment Variables
- [ ] Update `VITE_API_BASE_URL` with backend URL
- [ ] Deployments → Redeploy

### 4. Railway - Auto-Trading Service (20 min)
- [ ] Login to Upstash (console.upstash.com)
- [ ] Create new Redis database
- [ ] Name: learncodex-redis
- [ ] Choose region closest to Vercel
- [ ] Copy REST URL and REST Token
- [ ] Login to Vercel
- [ ] Create new project for auto-trading
- [ ] Root directory: `python-auto-trade`
- [ ] Add ALL environment variables:
  - [ ] DATABASE_URL
  - [ ] SUPABASE_URL
  - [ ] SUPABASE_SERVICE_KEY
  - [ ] UPSTASH_REDIS_REST_URL (from Upstash)
  - [ ] UPSTASH_REDIS_REST_TOKEN (from Upstash)
  - [ ] OKX_API_KEY
  - [ ] OKX_API_SECRET
  - [ ] OKX_API_PASSPHRASE
  - [ ] OKX_BASE_URL=https://my.okx.com
  - [ ] OKX_DEMO_MODE=true
  - [ ] DEEPSEEK_API_KEY
  - [ ] OPENAI_API_KEY
  - [ ] CCXT_EXCHANGE_ID=okx
  - [ ] CCXT_SHORT_TERM_TIMEFRAME=15m
  - [ ] CCXT_LONG_TERM_TIMEFRAME=1h
  - [ ] TRADING_SYMBOLS=BTC-USDT-SWAP,ETH-USDT-SWAP,SOL-USDT-SWAP,BNB-USDT-SWAP,DOGE-USDT-SWAP,XRP-USDT-SWAP
  - [ ] LLM_DECISION_INTERVAL_MINUTES=30
  - [ ] POSITION_SYNC_INTERVAL_MINUTES=5
  - [ ] LOG_LEVEL=INFO
- [ ] Deploy and wait
- [ ] Note Vercel URL: `_________________`
- [ ] Test: `curl https://your-app.vercel.app/health`

### 5. Update Backend with Auto-Trading URL
- [ ] Go to backend project in Vercel
- [ ] Settings → Environment Variables
- [ ] Add `AUTOTRADE_API_BASE_URL` with Vercel URL
- [ ] Deployments → Redeploy

### 6. Update Frontend with Auto-Trading URL
- [ ] Go to frontend project in Vercel
- [ ] Settings → Environment Variables
- [ ] Update `VITE_AUTOTRADE_API_BASE_URL` with Vercel URL
- [ ] Deployments → Redeploy

---

## Post-Deployment ✓

### Verification (30 min)
- [ ] Frontend loads: https://your-frontend.vercel.app
- [ ] Backend health check: `curl https://your-backend.vercel.app/health`
- [ ] Auto-trading health: `curl https://your-autotrade.vercel.app/health`
- [ ] Login with Google OAuth works
- [ ] Trading Agents page loads
- [ ] Auto Trading Dashboard displays:
  - [ ] Portfolio value
  - [ ] Positions
  - [ ] Decision logs
  - [ ] Real-time price updates

### Configuration
- [ ] Google OAuth redirect URI updated:
  - [ ] Added: `https://your-frontend.vercel.app/auth/google/callback`
- [ ] CORS configured correctly (no CORS errors in browser console)
- [ ] All API endpoints responding

### Monitoring Setup
- [ ] Vercel Analytics enabled (optional)
- [ ] Vercel Cron Jobs monitored
- [ ] Upstash Redis usage monitored
- [ ] Error tracking setup (Sentry - optional)
- [ ] Uptime monitoring (UptimeRobot - optional)

### Security
- [ ] No API keys in frontend code
- [ ] HTTPS enabled on all services (automatic with Vercel/Railway)
- [ ] Database connection secure
- [ ] OAuth credentials valid

### Database
- [ ] Supabase daily backups enabled
- [ ] Connection pooling configured
- [ ] All migrations applied

---

## Monitoring (First 48 Hours) ✓

### Hour 1
- [ ] Check all services are running
- [ ] Test full user flow (signup → trading dashboard)
- [ ] Monitor logs for errors

### Hour 6
- [ ] Check LLM scheduler is running
- [ ] Verify decisions are being logged
- [ ] Check position sync is working

### Hour 24
- [ ] Review error logs
- [ ] Check database performance
- [ ] Verify OKX API calls are working
- [ ] Monitor API usage and costs

### Hour 48
- [ ] Full system health check
- [ ] Performance optimization if needed
- [ ] Consider scaling options

---

## Rollback Plan ✓

If something goes wrong:

### Vercel Rollback
1. Go to Deployments tab
2. Find last working deployment
3. Click three dots → "Promote to Production"

### Emergency Contacts
- Vercel Support: support@vercel.com
- Railway Support: help@railway.app
- Your team: _________________

---

## Cost Tracking ✓

### Monthly Estimates
- Vercel (Hobby): $0
- Vercel (Pro): $20
- Upstash (Free): $0
- Upstash (Pay-as-go): $10-20
- Supabase (Free): $0
- Supabase (Pro): $25

**Total**: $0 (all free tiers) or $45-65/month (production)

### Usage Monitoring
- [ ] Check Vercel bandwidth usage weekly
- [ ] Check Vercel function execution time
- [ ] Monitor Upstash command usage daily
- [ ] Review API usage (OpenAI, DeepSeek)
- [ ] Database storage usage

---

## Troubleshooting ✓

### Build Errors
Problem: Build fails on Vercel
```bash
# Test locally first
npm run build

# Check for missing dependencies
npm install
```

### Environment Variables
Problem: Missing variables cause runtime errors
```bash
# Verify all variables are set in Vercel/Railway dashboard
# Check variable names match exactly (no typos)
```

### CORS Errors
Problem: Frontend can't access backend
```bash
# Solution:
1. Backend ALLOWED_ORIGINS must include frontend URL
2. Check URL format (no trailing slash)
3. Redeploy backend after changing
```

### Database Connection
Problem: Can't connect to database
```bash
# Verify:
1. DATABASE_URL is correct
2. Supabase allows connections from Vercel
3. Connection pool settings are appropriate
```

### Redis Connection
Problem: Upstash Redis errors
```bash
# Verify:
1. UPSTASH_REDIS_REST_URL is correct
2. UPSTASH_REDIS_REST_TOKEN is valid
3. Using REST API (not Redis protocol)
```

### OKX API
Problem: Trading operations fail
```bash
# Check:
1. API keys are for demo mode (if OKX_DEMO_MODE=true)
2. API key has correct permissions (Trade + Read)
3. OKX_BASE_URL=https://my.okx.com
```

---

## Quick Reference URLs

### Deployment
- Frontend: `___________________________`
- Backend: `___________________________`
- Auto-Trading: `___________________________`

### Dashboards
- Vercel: https://vercel.com/dashboard
- Upstash: https://console.upstash.com
- Supabase: https://app.supabase.com
- Google Cloud: https://console.cloud.google.com

### Documentation
- Full Guide: `VERCEL_DEPLOYMENT_GUIDE.md`
- VPS Alternative: `PRODUCTION_DEPLOYMENT_GUIDE.md`

---

## Notes

Date Deployed: `___________________________`

Issues Encountered:
```
1. 
2. 
3. 
```

Performance Baseline:
- Frontend Load Time: `_____` ms
- Backend Response Time: `_____` ms
- Auto-Trading API: `_____` ms

---

**Status**: [ ] Not Started | [ ] In Progress | [ ] Completed | [ ] Monitoring

**Deployed By**: `___________________________`

**Last Updated**: `___________________________`
