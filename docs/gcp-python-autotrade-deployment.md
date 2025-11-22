# GCP Cloud Run - Python Autotrade Service Deployment (UI Guide)

Complete guide to deploy Python autotrade service to Google Cloud Run with **always-on schedulers** using the **Google Cloud Console UI** (no command line required).

## Why GCP Cloud Run for Python Service?

- ✅ **24/7 uptime** with min instances = 1 (keeps schedulers alive)
- ✅ **Built-in schedulers** (LLMDecisionScheduler, MarketDataScheduler)
- ✅ **No external cron needed** (schedulers run internally)
- ✅ **60-minute timeout** for long-running LLM operations
- ✅ **Free tier + ~$5/month** for 1 warm instance
- ✅ **Redis & PostgreSQL** via external services (Upstash, Supabase)

---

## Architecture Overview

The Python autotrade service has:
- **LLMDecisionScheduler**: Runs trading decisions every 5-60 minutes
- **MarketDataScheduler**: Fetches real-time market data every 5 seconds
- **PositionSyncService**: Syncs positions with OKX exchange
- **WebSocket server**: Streams market data to frontend
- **FastAPI endpoints**: Internal API for trading operations

**Key requirement**: Service must stay warm (min instances = 1) to keep schedulers running.

---

## Prerequisites

### 1. Use Existing GCP Project

If you already deployed the Node.js backend:
1. Go to https://console.cloud.google.com/
2. Select your existing project (`learncodex-prod`)
3. Skip to **Step 2: Enable Redis/PostgreSQL** below

If this is a new deployment:
1. Follow the Prerequisites section from the Node.js guide
2. Create project, enable APIs, set up billing
3. Continue to Step 2 below

### 2. Set Up External Services (Required)

The Python service needs Redis and PostgreSQL:

**Redis (Upstash - Free Tier)**:
1. Go to https://upstash.com/
2. Sign up with Google/GitHub
3. Click **Create Database**
4. Configure:
   - **Name**: `learncodex-autotrade`
   - **Type**: Regional
   - **Region**: `ap-southeast-1` (Singapore)
   - **TLS**: Enabled
5. Copy the **REDIS_URL** (format: `rediss://default:xxx@xxx.upstash.io:6379`)

**PostgreSQL (Supabase - Already set up)**:
- Use your existing `DATABASE_URL` from Supabase
- No changes needed if you're already using it for Node.js backend

### 3. Get OKX API Credentials (Required for Trading)

1. Go to https://www.okx.com/account/my-api
2. Click **Create API Key**
3. Configure:
   - **API Key Name**: `learncodex-autotrade`
   - **Passphrase**: Create a strong passphrase (save it!)
   - **Permissions**: Trade, Read
   - **IP Restriction**: Leave empty for Cloud Run (dynamic IPs)
4. Copy:
   - **API Key**
   - **Secret Key**
   - **Passphrase**

**Important**: For demo trading, enable OKX demo mode in environment variables.

---

## Part 1: Prepare Python Service for Cloud Run

### Step 1: Create Dockerfile

1. Open your project in VS Code
2. Navigate to `python-auto-trade/` folder
3. Create a new file named `Dockerfile` (no extension)
4. Copy and paste this content:

```dockerfile
# Use official Python slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY pyproject.toml ./
COPY src ./src

# Install uv (fast Python package installer)
RUN pip install --no-cache-dir uv

# Install dependencies using uv
RUN uv pip install --system --no-cache -e .

# Expose port (Cloud Run will set PORT env var)
ENV PORT=8080
EXPOSE 8080

# Start FastAPI service
CMD uvicorn autotrade_service.main:app --host 0.0.0.0 --port ${PORT}
```

### Step 2: Create .dockerignore

1. In `python-auto-trade/` folder, create `.dockerignore`
2. Add this content:

```
__pycache__
*.pyc
*.pyo
*.pyd
.Python
env/
venv/
.venv/
.env
.env.local
*.log
logs/
.pytest_cache/
.mypy_cache/
.ruff_cache/
.git
.gitignore
README.md
.vscode
.idea
*.md
tests/
docs/
```

### Step 3: Update Service Port (if needed)

1. Open `python-auto-trade/src/autotrade_service/main.py`
2. Verify the app uses `PORT` environment variable
3. No changes needed - FastAPI uses uvicorn's `--port` flag from Dockerfile

---

## Part 2: Deploy Python Service to Cloud Run

### Step 1: Create Artifact Registry Repository (if not exists)

If you already created this for Node.js backend, skip to Step 2.

1. Go to **Artifact Registry** (https://console.cloud.google.com/artifacts)
2. Click **CREATE REPOSITORY**
3. Configure:
   - **Name**: `python-images`
   - **Format**: Docker
   - **Location type**: Region
   - **Region**: `asia-southeast1 (Singapore)`
   - **Encryption**: Google-managed encryption key
4. Click **CREATE**

### Step 2: Upload Code to Cloud Storage

1. Go to **Cloud Storage** (https://console.cloud.google.com/storage)
2. Click on your existing bucket or create a new one:
   - **Name**: `learncodex-python-source` (must be globally unique)
   - **Location type**: Region
   - **Region**: `asia-southeast1`
3. Click **UPLOAD FILES**
4. Zip your entire `python-auto-trade/` folder:
   - On Mac: Right-click `python-auto-trade/` → Compress
   - On Windows: Right-click `python-auto-trade/` → Send to → Compressed folder
5. Upload the `python-auto-trade.zip` file

### Step 3: Build with Cloud Build

1. Go to https://console.cloud.google.com/
2. Click the **Activate Cloud Shell** icon (terminal icon at top right)
3. Wait for shell to initialize
4. Run these commands:

```bash
# Create workspace directory
mkdir -p ~/python-deploy
cd ~/python-deploy

# Download your code from bucket
gsutil cp gs://learncodex-python-source/python-auto-trade.zip .

# Unzip
unzip python-auto-trade.zip

# Navigate to the extracted folder
cd python-auto-trade

# Build and push to Artifact Registry
gcloud builds submit --tag asia-southeast1-docker.pkg.dev/$(gcloud config get-value project)/python-images/autotrade:latest

# This will take 5-7 minutes (Python dependencies)
```

### Step 4: Deploy to Cloud Run via UI

1. Go to **Cloud Run** (https://console.cloud.google.com/run)
2. Click **CREATE SERVICE**
3. Configure deployment:

   **Container image URL**:
   - Click **SELECT**
   - Navigate to: `python-images` → `autotrade` → `latest`
   - Click **SELECT**

   **Service name**: `autotrade`
   
   **Region**: `asia-southeast1 (Singapore)`
   
   **CPU allocation**: **CPU is always allocated** ⚠️ (required for schedulers)
   
   **Autoscaling**:
   - Minimum instances: `1` ⚠️ (keeps schedulers alive 24/7)
   - Maximum instances: `3`
   
   **Authentication**: Allow unauthenticated invocations (check this box)

4. Click **CONTAINER, VARIABLES & SECRETS, CONNECTIONS, SECURITY** to expand advanced settings

5. Configure **Container** settings:
   - **Container port**: `8080`
   - **Request timeout**: `3600` seconds (1 hour for long LLM operations)
   - **Memory**: `1 GiB` (LangGraph + market data requires more memory)
   - **CPU**: `1`

6. Click **VARIABLES & SECRETS** tab

7. Add environment variables (click **+ ADD VARIABLE** for each):

   ```
   # Service Config
   AUTOTRADE_SERVICE_NAME = autotrade-service
   AUTOTRADE_SERVICE_PORT = 8080
   AUTOTRADE_LOG_LEVEL = info
   
   # Database & Cache
   AUTOTRADE_DB_URL = postgresql://your-supabase-connection-string
   AUTOTRADE_REDIS_URL = rediss://default:xxx@xxx.upstash.io:6379
   
   # LLM Config (DeepSeek)
   AUTOTRADE_DEEPSEEK_API_KEY = your-deepseek-api-key
   AUTOTRADE_DEEPSEEK_MODEL = deepseek-chat
   AUTOTRADE_DEEPSEEK_BASE_URL = https://api.deepseek.com/v1
   
   # OKX Exchange (Demo Mode)
   AUTOTRADE_OKX_DEMO_MODE = true
   AUTOTRADE_OKX_API_KEY = your-okx-api-key
   AUTOTRADE_OKX_SECRET_KEY = your-okx-secret
   AUTOTRADE_OKX_PASSPHRASE = your-okx-passphrase
   AUTOTRADE_TRADING_BROKER = okx_demo
   
   # Scheduler Config
   AUTOTRADE_DUAL_SCHEDULER_ENABLED = true
   AUTOTRADE_LLM_SCHEDULER_INTERVAL_MINUTES = 60
   AUTOTRADE_MARKET_DATA_REFRESH_INTERVAL_SECONDS = 5
   
   # Trading Symbols
   AUTOTRADE_MARKET_DATA_SYMBOLS = ["BTC-USDT-SWAP","ETH-USDT-SWAP","SOL-USDT-SWAP"]
   
   # CORS (Frontend URLs)
   AUTOTRADE_CORS_ALLOW_ORIGINS = ["https://your-frontend.vercel.app","http://localhost:5173"]
   
   # Portfolio Persistence (Optional)
   AUTOTRADE_AUTO_PORTFOLIO_USER_ID = your-user-id-here
   ```

8. Click **CREATE**

9. Wait 3-5 minutes for deployment

10. Once deployed, you'll see a **URL** like:
    ```
    https://autotrade-xxxxx-uc.a.run.app
    ```
    **Copy this URL - you'll need it later!**

### Step 5: Verify Deployment

1. Visit: `https://autotrade-xxxxx-uc.a.run.app/healthz`
2. You should see:
   ```json
   {
     "status": "ok",
     "redis": {"alive": true},
     "schedulers": {
       "mode": "dual",
       "market_data": {...},
       "llm_decision": {...}
     }
   }
   ```

3. Check logs to verify schedulers started:
   - Go to **Cloud Run** → `autotrade` service
   - Click **LOGS** tab
   - Look for:
     - `"Dual scheduler mode enabled"`
     - `"MarketDataScheduler started"`
     - `"LLMDecisionScheduler started"`

---

## Part 3: Connect Frontend to Autotrade Service

### Step 1: Update Backend Environment Variables

If your Node.js backend calls the Python autotrade service:

1. Go to **Cloud Run** → `backend` service
2. Click **EDIT & DEPLOY NEW REVISION**
3. Click **VARIABLES & SECRETS** tab
4. Add:
   ```
   AUTOTRADE_SERVICE_URL = https://autotrade-xxxxx-uc.a.run.app
   ```
5. Click **DEPLOY**

### Step 2: Update Frontend Environment Variables

1. Go to your Vercel dashboard (https://vercel.com/)
2. Select your frontend project (`equity-insight-react`)
3. Go to **Settings** → **Environment Variables**
4. Add new variable:
   - **Key**: `VITE_AUTOTRADE_WS_URL`
   - **Value**: `wss://autotrade-xxxxx-uc.a.run.app/ws/market-data`
   - **Environment**: Production
5. Click **Save**
6. Redeploy frontend

### Step 3: Test WebSocket Connection

1. Open browser console on your frontend
2. Connect to: `wss://autotrade-xxxxx-uc.a.run.app/ws/market-data`
3. You should receive real-time market data updates every 5 seconds

---

## Part 4: Monitoring & Maintenance

### View Service Logs

1. Go to **Cloud Run** (https://console.cloud.google.com/run)
2. Click on `autotrade` service
3. Click **LOGS** tab
4. Key things to monitor:
   - Scheduler execution logs
   - LLM decision traces
   - Market data updates
   - Trading execution logs
   - Error messages

### View Metrics

1. In Cloud Run service page, click **METRICS** tab
2. Important metrics:
   - **Container instance count**: Should always be ≥ 1
   - **CPU utilization**: Should be low except during LLM decisions
   - **Memory utilization**: Monitor to avoid OOM
   - **Request latency**: For API endpoints

### Set Up Alerts

**Alert 1: Service Down**
1. Go to **Monitoring** → **Alerting**
2. Click **CREATE POLICY**
3. Configure:
   - **Metric**: Cloud Run → Container instance count
   - **Threshold**: Alert if instance count < 1 for 5 minutes
   - **Notification**: Email

**Alert 2: High Memory**
1. Create another policy
2. Configure:
   - **Metric**: Cloud Run → Memory utilization
   - **Threshold**: Alert if > 80% for 10 minutes
   - **Notification**: Email

### Monitor Scheduler Health

1. Visit: `https://autotrade-xxxxx-uc.a.run.app/healthz`
2. Check `schedulers` object:
   ```json
   {
     "market_data": {
       "last_run": "2025-11-16T10:30:00",
       "next_run": "2025-11-16T10:30:05",
       "status": "running"
     },
     "llm_decision": {
       "last_run": "2025-11-16T10:00:00",
       "next_run": "2025-11-16T11:00:00",
       "status": "running"
     }
   }
   ```

---

## Part 5: Cost Management

### Estimated Monthly Costs

| Resource | Config | Free Tier | Cost |
|----------|--------|-----------|------|
| **Cloud Run (warm)** | 1 instance, 1 GiB RAM | 360K vCPU-sec | ~$8/month |
| **Cloud Run requests** | ~50K/month | 2M free | $0 |
| **Egress** | <1GB/day | 1GB/day free | $0 |
| **Redis (Upstash)** | Free tier | 10K commands/day | $0 |
| **PostgreSQL (Supabase)** | Free tier | 500MB | $0 |
| **Cloud Build** | ~5 builds/month | 120 builds free | $0 |

**Total: ~$8/month** ✅

### Cost Optimization Tips

1. **Reduce memory if possible**:
   - Monitor actual usage in metrics
   - If consistently < 512 MiB, downgrade to 512 MiB (~$4/month)

2. **Adjust LLM scheduler interval**:
   - Running every 60 min vs 5 min reduces API costs
   - Set `AUTOTRADE_LLM_SCHEDULER_INTERVAL_MINUTES = 60`

3. **Use DeepSeek instead of GPT-4**:
   - Already configured (much cheaper)
   - DeepSeek: ~$0.14 per 1M tokens
   - GPT-4: ~$10 per 1M tokens

4. **Monitor Redis usage**:
   - Upstash free tier: 10K commands/day
   - Upgrade to paid if exceeding (~$0.20/100K commands)

---

## Part 6: Update Your Deployment

### When You Make Code Changes

1. Zip your updated `python-auto-trade/` folder
2. Go to **Cloud Storage**
3. Upload new zip to your bucket (overwrite old one)
4. Go to **Cloud Shell**
5. Run:
   ```bash
   cd ~/python-deploy
   rm -rf *
   gsutil cp gs://learncodex-python-source/python-auto-trade.zip .
   unzip python-auto-trade.zip
   cd python-auto-trade
   gcloud builds submit --tag asia-southeast1-docker.pkg.dev/$(gcloud config get-value project)/python-images/autotrade:latest
   ```
6. Go to **Cloud Run**
7. Click `autotrade` service
8. Click **EDIT & DEPLOY NEW REVISION**
9. Container image should auto-update to `:latest`
10. Click **DEPLOY**

**Note**: Deployment will cause ~30 seconds of downtime as the new instance starts.

### Alternative: Deploy from GitHub (Recommended)

**One-time setup**:

1. Go to **Cloud Run**
2. Click `autotrade` service
3. Click **SET UP CONTINUOUS DEPLOYMENT**
4. Choose **GitHub**
5. Authenticate and select your repository
6. Configure:
   - **Branch**: `main`
   - **Build type**: Dockerfile
   - **Source location**: `/python-auto-trade/Dockerfile`
7. Click **SAVE**

**After setup**:
- Every push to `main` branch auto-deploys!
- View builds in **Cloud Build** → **History**

---

## Troubleshooting

### Issue: Schedulers Not Running

**Symptoms**:
- `/healthz` shows empty scheduler status
- No market data updates
- No LLM decisions being made

**Solution**:
1. Check logs for errors:
   - Redis connection failed?
   - Database connection failed?
2. Verify environment variables:
   - `AUTOTRADE_DUAL_SCHEDULER_ENABLED = true`
   - `AUTOTRADE_REDIS_URL` is correct
3. Ensure **CPU is always allocated**:
   - Go to Cloud Run → `autotrade`
   - Edit service → **CPU is always allocated** must be checked

### Issue: Service Keeps Shutting Down

**Symptoms**:
- Instance count drops to 0
- Schedulers stop running

**Solution**:
1. Verify **Minimum instances**: Must be `1` (not `0`)
2. Go to Cloud Run → `autotrade`
3. Click **EDIT & DEPLOY NEW REVISION**
4. Set **Minimum instances**: `1`
5. Click **DEPLOY**

### Issue: Out of Memory (OOM)

**Symptoms**:
- Service crashes during LLM operations
- Logs show "Memory limit exceeded"

**Solution**:
1. Increase memory:
   - Go to Cloud Run → `autotrade`
   - Edit service → **Memory**: `2 GiB`
2. Optimize code:
   - Reduce `AUTOTRADE_MARKET_DATA_SYMBOLS` list
   - Lower `llm_trading_symbols` count

### Issue: Redis Connection Timeout

**Symptoms**:
- `/healthz` shows `redis: {"alive": false}`
- Logs show "Redis connection timeout"

**Solution**:
1. Verify `AUTOTRADE_REDIS_URL` format:
   - Must be `rediss://` (with SSL)
   - Get from Upstash dashboard
2. Check Upstash free tier limits:
   - 10K commands/day
   - Upgrade if exceeding

### Issue: LLM Decisions Taking Too Long

**Symptoms**:
- Request timeout errors
- LLM operations > 60 seconds

**Solution**:
1. Increase timeout:
   - Go to Cloud Run → `autotrade`
   - Edit service → **Request timeout**: `3600` (1 hour max)
2. Optimize LLM config:
   - Reduce `AUTOTRADE_DEEPSEEK_TIMEOUT_SECONDS`
   - Use faster model variant

### Issue: High Costs

**Symptoms**:
- Monthly bill > $10

**Solution**:
1. Check **Billing** → **Reports** to identify cost driver
2. Likely culprits:
   - Memory too high (reduce to 512 MiB)
   - Too many LLM API calls (increase interval)
   - Exceeded Upstash free tier (check dashboard)
3. Set budget alerts at $5, $10, $15

---

## Migration Checklist

- [ ] Set up Upstash Redis (free tier)
- [ ] Get OKX API credentials (demo mode)
- [ ] Create Dockerfile in python-auto-trade/
- [ ] Create .dockerignore
- [ ] Create Artifact Registry repository (python-images)
- [ ] Upload code to Cloud Storage
- [ ] Build and push Docker image
- [ ] Deploy to Cloud Run with min instances = 1
- [ ] Set **CPU is always allocated**
- [ ] Add all environment variables (Redis, DB, OKX, DeepSeek)
- [ ] Test /healthz endpoint
- [ ] Verify schedulers are running in logs
- [ ] Connect frontend WebSocket to /ws/market-data
- [ ] Update backend with AUTOTRADE_SERVICE_URL
- [ ] Test end-to-end market data flow
- [ ] Set up monitoring alerts (service down, high memory)
- [ ] Set up billing alerts
- [ ] Document service URLs and secrets
- [ ] Optional: Set up GitHub continuous deployment
- [ ] Celebrate! 🎉

---

## Quick Reference

### Important URLs

- **Cloud Console**: https://console.cloud.google.com/
- **Cloud Run**: https://console.cloud.google.com/run
- **Cloud Build**: https://console.cloud.google.com/cloud-build
- **Logs**: https://console.cloud.google.com/logs
- **Billing**: https://console.cloud.google.com/billing
- **Upstash Dashboard**: https://console.upstash.com/

### Your Service URLs

```
Autotrade API: https://autotrade-xxxxx-uc.a.run.app
Autotrade WebSocket: wss://autotrade-xxxxx-uc.a.run.app/ws/market-data
Health Check: https://autotrade-xxxxx-uc.a.run.app/healthz
Metrics: https://autotrade-xxxxx-uc.a.run.app/metrics
```

### Key Environment Variables

```
# Critical - Must be set correctly
AUTOTRADE_DUAL_SCHEDULER_ENABLED = true
AUTOTRADE_REDIS_URL = rediss://default:xxx@xxx.upstash.io:6379
AUTOTRADE_DB_URL = postgresql://...
AUTOTRADE_OKX_API_KEY = your-key
AUTOTRADE_DEEPSEEK_API_KEY = your-key

# Scheduler Intervals
AUTOTRADE_LLM_SCHEDULER_INTERVAL_MINUTES = 60
AUTOTRADE_MARKET_DATA_REFRESH_INTERVAL_SECONDS = 5
```

### Key Secrets to Save

```
OKX_API_KEY: [Your OKX API key]
OKX_SECRET_KEY: [Your OKX secret]
OKX_PASSPHRASE: [Your OKX passphrase]
DEEPSEEK_API_KEY: [Your DeepSeek key]
REDIS_URL: [Your Upstash Redis URL]
```

---

## Support Resources

- **GCP Cloud Run Docs**: https://cloud.google.com/run/docs
- **Upstash Redis Docs**: https://docs.upstash.com/redis
- **OKX API Docs**: https://www.okx.com/docs-v5/en/
- **DeepSeek API Docs**: https://platform.deepseek.com/docs
- **FastAPI Docs**: https://fastapi.tiangolo.com/
- **Support Forum**: https://www.googlecloudcommunity.com/

---

## Important Notes

⚠️ **Always-On Requirement**: This service MUST have `min instances = 1` and `CPU always allocated` to keep schedulers running 24/7.

⚠️ **Demo Trading**: Start with `AUTOTRADE_OKX_DEMO_MODE = true` for safe testing. Switch to real trading only after thorough testing.

⚠️ **Cost Awareness**: ~$8/month for 1 warm instance. Monitor billing dashboard weekly.

⚠️ **Security**: Never commit API keys to git. Use environment variables only.

---

**Last Updated**: 2025-11-16
**Guide Type**: Python Autotrade Service (Stateful with Schedulers)
**Expected Cost**: ~$8/month
