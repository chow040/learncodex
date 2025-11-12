# Vercel Deployment Guide

This guide provides step-by-step instructions for deploying your LearnCodex application to Vercel.

## Architecture Overview

Your application consists of three services:
1. **Frontend** (React + Vite) → Deploy to Vercel
2. **Backend** (Node.js + Express) → Deploy to Vercel
3. **Auto-Trading Service** (Python + FastAPI) → Deploy to Vercel (Serverless Functions)

> **Note**: We'll use Vercel's Python serverless functions for the auto-trading service and Upstash for Redis (both have generous free tiers).

---

## Prerequisites

- [ ] GitHub account with your repository pushed
- [ ] Vercel account (free tier available)
- [ ] Upstash account (free tier - for Redis)
- [ ] Production database (Supabase recommended)
- [ ] Production API keys (OKX, OpenAI, DeepSeek, etc.)

---

## Part 1: Deploy Frontend to Vercel

### Step 1: Prepare Frontend Environment Variables

Create a file to track your production environment variables (don't commit this):

```bash
# equity-insight-react/.env.production (DO NOT COMMIT)
VITE_API_BASE_URL=https://your-backend.vercel.app
VITE_AUTOTRADE_API_BASE_URL=https://your-autotrade.vercel.app
```

### Step 2: Update Frontend Vercel Config

The `equity-insight-react/vercel.json` is already configured. Verify it looks correct:

```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm install",
  "devCommand": "npm run dev"
}
```

### Step 3: Deploy Frontend via Vercel Dashboard

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"Add New..."** → **"Project"**
3. Import your GitHub repository (`learncodex`)
4. Configure the project:
   - **Framework Preset**: Vite
   - **Root Directory**: `equity-insight-react`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

5. Add Environment Variables:
   - Click **"Environment Variables"**
   - Add:
     ```
     VITE_API_BASE_URL = (leave blank for now, we'll add this after backend deployment)
     VITE_AUTOTRADE_API_BASE_URL = (leave blank for now)
     ```

6. Click **"Deploy"**

7. Wait for deployment (2-3 minutes)

8. Your frontend will be available at: `https://your-project-name.vercel.app`

### Step 4: Configure Custom Domain (Optional)

1. Go to your project → **Settings** → **Domains**
2. Add your custom domain (e.g., `learncodex.com`)
3. Follow Vercel's DNS configuration instructions

---

## Part 2: Deploy Backend to Vercel

### Step 1: Prepare Backend Environment Variables

Create a secure note with your production environment variables:

```bash
# backend/.env.production (DO NOT COMMIT - REFERENCE ONLY)

# Database
DATABASE_URL=postgresql://user:password@host:5432/database
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key

# AI Services
OPENAI_API_KEY=sk-xxx
DEEPSEEK_API_KEY=sk-xxx
LANGCHAIN_API_KEY=lsv2_xxx
XAI_API_KEY=xai-xxx

# Google OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx

# JWT
JWT_SECRET=your_secure_random_string_min_32_chars

# Application
NODE_ENV=production
PORT=4000

# CORS (will be your frontend URL)
ALLOWED_ORIGINS=https://your-frontend.vercel.app

# Auto-trading API (will be your Railway URL)
AUTOTRADE_API_BASE_URL=https://your-autotrade.up.railway.app
```

### Step 2: Verify Backend Build Configuration

Check `backend/package.json` has the correct build script:

```json
{
  "scripts": {
    "build": "npm run clean && node ./node_modules/typescript/bin/tsc -p .",
    "start": "node dist/server.js"
  }
}
```

### Step 3: Deploy Backend via Vercel Dashboard

1. In Vercel dashboard, click **"Add New..."** → **"Project"**
2. Import the same GitHub repository
3. Configure the project:
   - **Framework Preset**: Other
   - **Root Directory**: `backend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

4. Add Environment Variables (click **"Environment Variables"**):
   - Copy all variables from your `.env.production` note above
   - Add them one by one in the Vercel dashboard
   - **Important**: Set `ALLOWED_ORIGINS` to your frontend Vercel URL

5. Click **"Deploy"**

6. Wait for deployment (2-4 minutes)

7. Your backend will be available at: `https://your-backend.vercel.app`

### Step 4: Update Frontend Environment Variable

1. Go to your **frontend project** in Vercel
2. Go to **Settings** → **Environment Variables**
3. Update `VITE_API_BASE_URL` with your backend URL:
   ```
   VITE_API_BASE_URL = https://your-backend.vercel.app
   ```
4. Go to **Deployments** tab
5. Click the three dots on the latest deployment → **Redeploy**

---

## Part 3: Setup Upstash Redis (Free Tier)

### Step 1: Create Upstash Account

1. Go to [upstash.com](https://upstash.com)
2. Sign up with GitHub (free tier includes 10,000 commands/day)
3. Click **"Create Database"**

### Step 2: Configure Redis Database

1. **Name**: `learncodex-redis`
2. **Type**: Regional (cheaper, faster for single region)
3. **Region**: Choose closest to your Vercel deployment region
   - US East (Virginia) for us-east-1
   - EU West (Ireland) for eu-west-1
4. **TLS**: Enabled (default)
5. Click **"Create"**

### Step 3: Get Redis Credentials

1. Click on your database
2. Go to **"Details"** tab
3. Copy these values:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

> **Note**: Upstash uses REST API which works perfectly with Vercel serverless functions!

---

## Part 4: Deploy Auto-Trading Service to Vercel

### Step 1: Create Vercel Serverless Configuration

We'll deploy the Python auto-trading service as a Vercel project with cron jobs for schedulers.

### Step 2: Deploy via Vercel Dashboard

1. In Vercel dashboard, click **"Add New..."** → **"Project"**
2. Import the same GitHub repository
3. Configure the project:
   - **Framework Preset**: Other
   - **Root Directory**: `python-auto-trade`
   - **Build Command**: `pip install -e .`
   - **Install Command**: `pip install -r requirements.txt` (if you have one)

### Step 3: Add Environment Variables to Vercel

Click **"Environment Variables"** and add:

```bash
# Database
DATABASE_URL=postgresql://user:password@host.supabase.co:5432/postgres
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=your_service_key

# Redis (From Upstash)
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token_here

# OKX API
OKX_API_KEY=your_okx_api_key
OKX_API_SECRET=your_okx_secret
OKX_API_PASSPHRASE=your_passphrase
OKX_BASE_URL=https://my.okx.com
OKX_DEMO_MODE=true  # or false for production

# AI Services
DEEPSEEK_API_KEY=sk-xxx
OPENAI_API_KEY=sk-xxx

# Trading Configuration
CCXT_EXCHANGE_ID=okx
CCXT_SHORT_TERM_TIMEFRAME=15m
CCXT_LONG_TERM_TIMEFRAME=1h
TRADING_SYMBOLS=BTC-USDT-SWAP,ETH-USDT-SWAP,SOL-USDT-SWAP,BNB-USDT-SWAP,DOGE-USDT-SWAP,XRP-USDT-SWAP

# Scheduler Configuration
LLM_DECISION_INTERVAL_MINUTES=30
POSITION_SYNC_INTERVAL_MINUTES=5

# Application
LOG_LEVEL=INFO
```

### Step 4: Configure Vercel Cron Jobs

Create `python-auto-trade/vercel.json`:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "api/*.py",
      "use": "@vercel/python"
    }
  ],
  "crons": [
    {
      "path": "/api/cron/market-data",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/llm-decision",
      "schedule": "*/30 * * * *"
    },
    {
      "path": "/api/cron/position-sync",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

### Step 5: Deploy

1. Click **"Deploy"**
2. Wait for deployment (3-5 minutes)
3. Your service will be available at: `https://your-autotrade.vercel.app`

### Step 6: Update Backend Environment Variable

1. Go to your **backend project** in Vercel
2. Go to **Settings** → **Environment Variables**
3. Update:
   ```
   AUTOTRADE_API_BASE_URL = https://your-autotrade.vercel.app
   ```
4. Go to **Deployments** → Redeploy

### Step 7: Update Frontend Environment Variable

1. Go to your **frontend project** in Vercel
2. Go to **Settings** → **Environment Variables**
3. Update:
   ```
   VITE_AUTOTRADE_API_BASE_URL = https://your-autotrade.vercel.app
   ```
4. Redeploy

---

## Part 5: Verify Deployment

### Test Frontend
```bash
curl https://your-frontend.vercel.app
# Should return HTML
```

### Test Backend
```bash
curl https://your-backend.vercel.app/health
# Should return: {"status":"ok"}
```

### Test Auto-Trading API
```bash
curl https://your-autotrade.vercel.app/health
# Should return: {"status":"healthy"}

curl https://your-autotrade.vercel.app/api/autotrade/v1/portfolio
# Should return portfolio data
```

### Test Full Integration
1. Visit your frontend URL: `https://your-frontend.vercel.app`
2. Login with Google OAuth
3. Navigate to Auto Trading Dashboard
4. Verify:
   - Portfolio value displays
   - Positions load
   - Decision logs appear
   - Real-time prices update

---

## Part 6: Post-Deployment Configuration

### 1. Setup Google OAuth Redirect URIs

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to **APIs & Services** → **Credentials**
3. Edit your OAuth 2.0 Client ID
4. Add Authorized Redirect URIs:
   ```
   https://your-frontend.vercel.app/auth/google/callback
   ```

### 2. Update CORS Settings

Verify your backend allows requests from your frontend:
- Backend environment variable `ALLOWED_ORIGINS` should include your frontend URL

### 3. Setup Monitoring

**Vercel:**
1. Go to project **Settings** → **Integrations**
2. Add **Sentry** for error tracking (optional)
3. Enable **Analytics** for performance monitoring
4. Monitor **Cron Jobs** execution in the dashboard

**Upstash:**
1. Go to Upstash dashboard
2. Monitor Redis usage and commands
3. View performance metrics

### 4. Configure Database Backups

If using Supabase:
1. Go to Supabase dashboard → **Database** → **Backups**
2. Enable daily backups
3. Configure retention period (7 days recommended)

---

## Part 7: Continuous Deployment

### Automatic Deployments

Vercel supports automatic deployments:

1. **Push to main branch** → Automatic production deployment
2. **Push to other branches** → Preview deployments

### Manual Deployment

**Vercel:**
1. Go to **Deployments**
2. Click three dots → **Redeploy**

---

## Part 8: Rollback Procedure

### Rollback Any Service (Vercel)

1. Go to **Deployments**
2. Find the previous working deployment
3. Click three dots → **Promote to Production**

---

## Part 9: Troubleshooting

### Build Fails on Vercel

**Issue**: TypeScript compilation errors
```bash
# Solution: Test build locally first
cd backend  # or equity-insight-react
npm run build
```

**Issue**: Missing environment variables
```bash
# Solution: Check all required variables are set
# Compare with .env.production template
```

### Auto-Trading Service Issues

**Issue**: Cron jobs not executing
```bash
# Solution: Check Vercel cron configuration
# Verify cron paths in vercel.json
# Check function logs in Vercel dashboard
```

**Issue**: Redis connection timeout
```bash
# Solution: Verify Upstash credentials
# Check UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
# Ensure using REST API (not Redis protocol)
```

**Issue**: Database connection timeout
```bash
# Solution: Check DATABASE_URL is correct
# Verify Supabase allows connections from Railway IPs
```

### CORS Errors

**Issue**: Frontend can't access backend
```bash
# Solution: Update backend ALLOWED_ORIGINS
ALLOWED_ORIGINS=https://your-frontend.vercel.app
```

### OKX API Errors

**Issue**: Error 50119 (API key doesn't exist)
```bash
# Solution: Ensure API key is created in demo mode
# Visit: https://www.okx.com/demo-trading
```

---

## Cost Estimation

## Cost Estimation

### Vercel (Frontend + Backend + Auto-Trading)
- **Hobby Plan**: Free
  - 100 GB bandwidth
  - 100 builds per day
  - Unlimited preview deployments
  - 100 GB-Hrs serverless function execution
- **Pro Plan**: $20/month
  - 1 TB bandwidth
  - Unlimited builds
  - 1000 GB-Hrs serverless function execution
  - Better performance

### Upstash (Redis)
- **Free Tier**: $0
  - 10,000 commands/day
  - 256 MB storage
  - Perfect for development and small-scale production
- **Pay-as-you-go**: Starts at $0.2 per 100K commands
  - ~$10/month for moderate usage

### Supabase (Database)
- **Free Tier**: $0
  - 500 MB database
  - 1 GB file storage
- **Pro Plan**: $25/month
  - 8 GB database
  - Daily backups

**Total Estimated Cost**: 
- **Development/Small Scale**: $0/month (all free tiers)
- **Production**: $20-45/month (Vercel Pro + Supabase Pro + Upstash free tier)

---

## Next Steps

1. ✅ Deploy Frontend to Vercel
2. ✅ Deploy Backend to Vercel
3. ✅ Setup Upstash Redis
4. ✅ Deploy Auto-Trading to Vercel
5. ✅ Configure environment variables
6. ✅ Configure cron jobs
7. ✅ Test all endpoints
8. ✅ Setup monitoring
9. ✅ Configure backups
10. 🔄 Monitor for 24-48 hours
11. 🔄 Optimize based on performance metrics

---

## Quick Reference

### Important URLs

```bash
# Frontend
Production: https://your-frontend.vercel.app
Vercel Dashboard: https://vercel.com/your-username/your-frontend

# Backend
Production: https://your-backend.vercel.app
Vercel Dashboard: https://vercel.com/your-username/your-backend

# Auto-Trading
Production: https://your-autotrade.vercel.app
Vercel Dashboard: https://vercel.com/your-username/your-autotrade

# Upstash Redis
Dashboard: https://console.upstash.com

# Database
Supabase: https://app.supabase.com/project/your-project
```

### Useful Commands

```bash
# Install Vercel CLI (optional)
npm i -g vercel

# Deploy from CLI
vercel --prod

# Check deployment logs
vercel logs <deployment-url>

# Install Railway CLI (optional)
npm i -g @railway/cli

# Check Railway logs
# Check Railway logs (optional)
railway logs
```

---

## Support Resources

- **Vercel Documentation**: https://vercel.com/docs
- **Upstash Documentation**: https://docs.upstash.com
- **Vercel Cron Jobs**: https://vercel.com/docs/cron-jobs
- **Supabase Documentation**: https://supabase.com/docs
- **CCXT Documentation**: https://docs.ccxt.com

Need help? Check the `PRODUCTION_DEPLOYMENT_GUIDE.md` for more detailed VPS deployment options.
