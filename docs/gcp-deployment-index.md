# GCP Cloud Run Deployment - Complete Guide Index

Complete deployment guides for migrating from Vercel to Google Cloud Run.

---

## 📋 Overview

This project consists of 3 services:
1. **React Frontend** - Stays on Vercel (no migration needed)
2. **Node.js Backend** - Migrate to GCP Cloud Run (stateless API)
3. **Python Autotrade** - Migrate to GCP Cloud Run (stateful with schedulers)

---

## 🚀 Deployment Guides

### 1. Node.js Backend Deployment

**Guide**: [gcp-nodejs-backend-deployment.md](./gcp-nodejs-backend-deployment.md)

**What it does**:
- Express API with LangGraph trading agents
- Handles HTTP requests from frontend
- No built-in schedulers (pure API)

**Key features**:
- ✅ 15-minute timeout (vs Vercel's 10s)
- ✅ Min instances = 0 (cold starts OK, free)
- ✅ No cron jobs needed
- ✅ **Cost: $0/month**

**Deploy first**: Yes - frontend needs backend URL

---

### 2A. Python Autotrade - Free Tier VM (Recommended)

**Guide**: [gcp-vm-python-autotrade-deployment.md](./gcp-vm-python-autotrade-deployment.md)

**What it does**:
- FastAPI service on E2-micro VM (free tier)
- Built-in schedulers running 24/7
- Systemd auto-restart on crashes
- SSH access via browser for debugging

**Key features**:
- ✅ **$0/month forever** (free tier VM)
- ✅ 1 GB RAM (sufficient for Python service)
- ✅ No external cron needed (schedulers are internal)
- ✅ Full control over environment

**Deploy second**: Recommended if you want automated trading at $0 cost

---

### 2B. Python Autotrade - Cloud Run (Alternative)

**Guide**: [gcp-python-autotrade-deployment.md](./gcp-python-autotrade-deployment.md)

**What it does**:
- FastAPI service with built-in schedulers
- LLMDecisionScheduler (runs trading decisions every 60 min)
- MarketDataScheduler (fetches market data every 5 sec)
- WebSocket server (streams real-time data to frontend)

**Key features**:
- ✅ Min instances = 1 (always-on schedulers)
- ✅ 60-minute timeout for LLM operations
- ✅ No external cron needed (schedulers are internal)
- ✅ Auto-deploy from GitHub
- ⚠️ **Cost: ~$8/month**

**Deploy second**: Only if you need auto-scaling or prefer managed service

---

## 💰 Total Cost Breakdown

| Service | Deployment Type | Monthly Cost |
|---------|----------------|--------------|
| Node.js Backend | Cloud Run (min=0) | $0 |
| Python Autotrade | **VM E2-micro (recommended)** | **$0** ✅ |
| Python Autotrade | Cloud Run (min=1) | ~$8 ⚠️ |
| Redis (Upstash) | Free tier | $0 |
| PostgreSQL (Supabase) | Free tier | $0 |
| Frontend (Vercel) | Free tier | $0 |
| **TOTAL (with VM)** | | **$0/month** ✅ |
| **TOTAL (with Cloud Run)** | | **~$8/month** |

---

## 📝 Deployment Order

Follow this sequence for smooth migration:

### Step 1: Prerequisites (Both Services)
1. Create GCP account and project
2. Enable required APIs (Cloud Run, Cloud Build, Artifact Registry)
3. Set up billing and budget alerts
4. ✅ Complete this once for both services

### Step 2: Deploy Node.js Backend
1. Follow [gcp-nodejs-backend-deployment.md](./gcp-nodejs-backend-deployment.md)
2. Get backend URL: `https://backend-xxxxx-uc.a.run.app`
3. Update frontend environment variables on Vercel
4. Test end-to-end (frontend → backend)

### Step 3: Deploy Python Autotrade (Optional)

**Option A: Free Tier VM (Recommended - $0/month)**
1. Set up Upstash Redis (free tier)
2. Get OKX API credentials
3. Follow [gcp-vm-python-autotrade-deployment.md](./gcp-vm-python-autotrade-deployment.md)
4. Create E2-micro VM in us-west1
5. SSH via browser and install Python service
6. Set up systemd auto-start
7. Configure firewall rules
8. Get VM IP: `http://34.83.123.456:8080`
9. Connect WebSocket to frontend
10. Monitor with `sudo journalctl -u autotrade -f`

**Option B: Cloud Run ($8/month)**
1. Follow [gcp-python-autotrade-deployment.md](./gcp-python-autotrade-deployment.md)
2. Deploy with min instances = 1
3. Auto-deploy from GitHub (recommended)

---

## 🔧 When to Deploy Each Service

### Node.js Backend - Deploy When:
- ✅ LangGraph agents timeout on Vercel (>10s)
- ✅ Need longer request timeouts for complex operations
- ✅ Want to keep costs at $0

### Python Autotrade - Deploy When:
- ✅ Want automated trading decisions (runs every 60 min)
- ✅ Need real-time market data streaming via WebSocket
- ✅ Want to stay at **$0/month** → Use **VM option**
- ⚠️ Need auto-scaling and managed service → Use Cloud Run ($8/month)
- ⚠️ Don't deploy if you only want manual trading from UI

---

## 🆘 Support

**Need help?**
- Check **Troubleshooting** sections in each guide
- Review Cloud Run logs: https://console.cloud.google.com/logs
- Check billing: https://console.cloud.google.com/billing
- GCP Community: https://www.googlecloudcommunity.com/

**Common Issues**:
- Backend timeout → Increase request timeout to 900s
- Python service down → Check min instances = 1
- High costs → Review billing dashboard and optimize

---

## 📚 Related Documentation

- [AWS Deployment Guide](./AWS_DEPLOYMENT_GUIDE.md) - Alternative to GCP
- [External Cron Setup](./external-cron-setup.md) - If you need external schedulers
- [Trading Agents Background Run](./trading-agents-background-run-SSE-blueprint.md)

---

**Last Updated**: 2025-11-16
**Status**: Production-ready guides
