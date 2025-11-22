# GCP Free Tier VM - Python Autotrade Deployment (UI Guide)

Complete guide to deploy Python autotrade service on a **free GCP E2-micro VM** using the **Google Cloud Console UI** (no command line required on your local machine).

## Why GCP Free Tier VM?

- ✅ **$0/month** - Completely free forever (vs $8 for Cloud Run)
- ✅ **24/7 uptime** with systemd auto-restart
- ✅ **Built-in schedulers** work perfectly (always-on)
- ✅ **1 GB RAM** - Sufficient for Python service
- ✅ **30 GB disk** - Plenty of space
- ✅ **SSH access** via browser for debugging

---

## Free Tier VM Specs

| Resource | E2-micro (Free Tier) |
|----------|---------------------|
| vCPU | 0.25-0.5 (burstable) |
| RAM | 1 GB |
| Disk | 30 GB standard persistent disk |
| Network | 1 GB egress/month (North America) |
| Regions | us-west1, us-central1, us-east1 |
| Cost | **$0/month forever** ✅ |

---

## Prerequisites

### 1. Create Google Cloud Account

1. Go to https://cloud.google.com/
2. Click **Get started for free**
3. Sign in with your Google account
4. Enter billing information (required even for free tier, won't be charged)
5. Accept terms and complete setup

### 2. Create New Project (if not exists)

1. Go to https://console.cloud.google.com/
2. Click the project dropdown at the top
3. Click **NEW PROJECT**
4. Enter project details:
   - **Project name**: `learncodex-prod`
   - **Organization**: Leave as default
5. Click **CREATE**
6. Select the new project

### 3. Enable Required APIs

1. Go to **APIs & Services** → **Library**
2. Search and enable:
   - **Compute Engine API** (for VMs)
     - Search "Compute Engine" → Click **ENABLE**

### 4. Set Up External Services

**Redis (Upstash - Free Tier)**:
1. Go to https://upstash.com/
2. Sign up with Google/GitHub
3. Click **Create Database**
4. Configure:
   - **Name**: `learncodex-autotrade`
   - **Type**: Regional
   - **Region**: `us-east-1` (closest to VM)
   - **TLS**: Enabled
5. Copy the **REDIS_URL**: `rediss://default:xxx@xxx.upstash.io:6379`

**PostgreSQL (Supabase - Existing)**:
- Use your existing `DATABASE_URL` from Supabase

**OKX API Credentials**:
1. Go to https://www.okx.com/account/my-api
2. Create API key with Trade + Read permissions
3. Copy API Key, Secret Key, Passphrase
4. Enable **Demo Trading Mode** for testing

---

## Part 1: Create Free Tier VM

### Step 1: Navigate to Compute Engine

1. Go to **Compute Engine** → **VM instances** (https://console.cloud.google.com/compute/instances)
2. Wait for Compute Engine API to initialize (takes ~30 seconds)
3. Click **CREATE INSTANCE**

### Step 2: Configure VM Instance

**Basic Settings**:
1. **Name**: `autotrade-vm`
2. **Region**: `us-west1` (Oregon) ⚠️ **Must be free tier region**
3. **Zone**: `us-west1-b` (or any zone in us-west1)

**Machine Configuration**:
1. **Series**: E2
2. **Machine type**: Click **e2-micro (2 vCPU, 1 GB memory)** ⚠️ **This is the free tier option**
3. You should see a note: "Your first e2-micro instance is free"

**Boot Disk**:
1. Click **CHANGE** button
2. Configure:
   - **Operating system**: Ubuntu
   - **Version**: Ubuntu 22.04 LTS
   - **Boot disk type**: Standard persistent disk
   - **Size (GB)**: 30 (max free tier)
3. Click **SELECT**

**Firewall**:
1. ✅ Check **Allow HTTP traffic**
2. ✅ Check **Allow HTTPS traffic**

**Advanced Options** (click to expand):
1. Click **Networking** tab
2. Under **Network interfaces**:
   - Click the pencil icon to edit
   - **External IPv4 address**: Click dropdown → **CREATE IP ADDRESS**
     - **Name**: `autotrade-static-ip`
     - **Network Service Tier**: Premium
     - Click **RESERVE**
   - Click **DONE**

3. Click **Management** tab
4. Under **Metadata**, click **ADD ITEM**:
   - **Key**: `startup-script`
   - **Value**: 
     ```bash
     #!/bin/bash
     apt-get update
     apt-get install -y python3.11 python3.11-venv python3-pip git curl
     ```

5. Click **CREATE**

### Step 3: Wait for VM Creation

1. Wait 1-2 minutes for VM to start
2. You'll see a green checkmark when ready
3. Note the **External IP** address (e.g., `34.83.123.456`)

---

## Part 2: Connect to VM and Set Up Environment

### Step 1: SSH into VM via Browser

1. In **VM instances** page, find your `autotrade-vm`
2. Click **SSH** button (opens browser SSH terminal)
3. Wait for connection (might take 10-20 seconds first time)
4. You should see a terminal prompt: `yourname@autotrade-vm:~$`

### Step 2: Verify Python Installation

In the SSH terminal, run:

```bash
python3.11 --version
```

You should see: `Python 3.11.x`

### Step 3: Create Application Directory

```bash
# Create app directory
sudo mkdir -p /opt/autotrade
sudo chown $USER:$USER /opt/autotrade
cd /opt/autotrade
```

### Step 4: Clone Your Code (Option A - Recommended)

If your code is on GitHub:

```bash
# Clone repository
git clone https://github.com/chow040/learncodex.git
cd learncodex/python-auto-trade
```

### Step 4 Alternative: Upload Code Manually (Option B)

If you don't use GitHub:

1. On your local machine, zip the `python-auto-trade/` folder
2. In GCP Console, go to **Cloud Storage**
3. Create a bucket: `learncodex-code`
4. Upload `python-auto-trade.zip`
5. In SSH terminal:
   ```bash
   cd /opt/autotrade
   gsutil cp gs://learncodex-code/python-auto-trade.zip .
   unzip python-auto-trade.zip
   cd python-auto-trade
   ```

### Step 5: Install UV (Fast Python Package Manager)

```bash
# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# Add to PATH for current session
export PATH="$HOME/.cargo/bin:$PATH"

# Verify installation
uv --version
```

### Step 6: Create Python Virtual Environment

```bash
# Create virtual environment
python3.11 -m venv .venv

# Activate it
source .venv/bin/activate

# Install dependencies with uv (faster than pip)
uv pip install -e .
```

This will take 2-3 minutes to install all dependencies.

### Step 7: Create Environment Variables File

```bash
# Create .env file
nano .env
```

Paste this content (replace with your actual values):

```bash
# Service Config
AUTOTRADE_SERVICE_NAME=autotrade-service
AUTOTRADE_SERVICE_PORT=8080
AUTOTRADE_LOG_LEVEL=info

# Database & Cache
AUTOTRADE_DB_URL=postgresql://your-supabase-connection-string
AUTOTRADE_REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379

# LLM Config (DeepSeek)
AUTOTRADE_DEEPSEEK_API_KEY=your-deepseek-api-key
AUTOTRADE_DEEPSEEK_MODEL=deepseek-chat
AUTOTRADE_DEEPSEEK_BASE_URL=https://api.deepseek.com/v1

# OKX Exchange (Demo Mode)
AUTOTRADE_OKX_DEMO_MODE=true
AUTOTRADE_OKX_API_KEY=your-okx-api-key
AUTOTRADE_OKX_SECRET_KEY=your-okx-secret
AUTOTRADE_OKX_PASSPHRASE=your-okx-passphrase
AUTOTRADE_TRADING_BROKER=okx_demo

# Scheduler Config
AUTOTRADE_DUAL_SCHEDULER_ENABLED=true
AUTOTRADE_LLM_SCHEDULER_INTERVAL_MINUTES=60
AUTOTRADE_MARKET_DATA_REFRESH_INTERVAL_SECONDS=5

# Trading Symbols
AUTOTRADE_MARKET_DATA_SYMBOLS=["BTC-USDT-SWAP","ETH-USDT-SWAP","SOL-USDT-SWAP"]

# CORS (Frontend URLs)
AUTOTRADE_CORS_ALLOW_ORIGINS=["https://your-frontend.vercel.app","http://localhost:5173"]

# Portfolio Persistence
AUTOTRADE_AUTO_PORTFOLIO_USER_ID=your-user-id-here
AUTOTRADE_LOG_DIR=/opt/autotrade/logs
```

**Save and exit**:
- Press `Ctrl+X`
- Press `Y` to confirm
- Press `Enter`

### Step 8: Create Logs Directory

```bash
mkdir -p /opt/autotrade/logs
```

### Step 9: Test Run Service Manually

```bash
# Make sure you're in the python-auto-trade directory with venv activated
cd /opt/autotrade/learncodex/python-auto-trade  # Adjust path if different
source .venv/bin/activate

# Test run
uvicorn autotrade_service.main:app --host 0.0.0.0 --port 8080
```

You should see:
```
INFO:     Started server process
INFO:     Uvicorn running on http://0.0.0.0:8080
INFO:     Dual scheduler mode enabled
```

**Test in another terminal** (open new SSH session):
```bash
curl http://localhost:8080/healthz
```

Should return JSON with scheduler status.

**Stop the test** (press `Ctrl+C` in the first terminal)

---

## Part 3: Set Up Systemd Service (Auto-Start)

### Step 1: Create Systemd Service File

```bash
sudo nano /etc/systemd/system/autotrade.service
```

Paste this content:

```ini
[Unit]
Description=LearnCodex Autotrade Service
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/opt/autotrade/learncodex/python-auto-trade
Environment="PATH=/opt/autotrade/learncodex/python-auto-trade/.venv/bin:/usr/local/bin:/usr/bin:/bin"
EnvironmentFile=/opt/autotrade/learncodex/python-auto-trade/.env
ExecStart=/opt/autotrade/learncodex/python-auto-trade/.venv/bin/uvicorn autotrade_service.main:app --host 0.0.0.0 --port 8080
Restart=always
RestartSec=10
StandardOutput=append:/opt/autotrade/logs/autotrade.log
StandardError=append:/opt/autotrade/logs/autotrade-error.log

[Install]
WantedBy=multi-user.target
```

**Replace `YOUR_USERNAME`**:
- Run `whoami` to get your username
- Replace `YOUR_USERNAME` with the output

**Adjust paths if needed**:
- If you used Option B (manual upload), adjust paths accordingly

**Save and exit**: `Ctrl+X`, `Y`, `Enter`

### Step 2: Enable and Start Service

```bash
# Reload systemd to recognize new service
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable autotrade

# Start service now
sudo systemctl start autotrade

# Check status
sudo systemctl status autotrade
```

You should see:
```
● autotrade.service - LearnCodex Autotrade Service
   Loaded: loaded
   Active: active (running)
```

### Step 3: Verify Service is Running

```bash
# Check logs
tail -f /opt/autotrade/logs/autotrade.log
```

You should see:
- `Dual scheduler mode enabled`
- `MarketDataScheduler started`
- `LLMDecisionScheduler started`

**Exit log view**: Press `Ctrl+C`

### Step 4: Test Health Endpoint

```bash
curl http://localhost:8080/healthz | jq
```

Should return:
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

---

## Part 4: Configure Firewall Rules

### Step 1: Create Firewall Rule for Port 8080

1. Go to **VPC network** → **Firewall** (https://console.cloud.google.com/networking/firewalls/list)
2. Click **CREATE FIREWALL RULE**
3. Configure:
   - **Name**: `allow-autotrade-8080`
   - **Description**: Allow traffic to autotrade service
   - **Logs**: Off
   - **Network**: default
   - **Priority**: 1000
   - **Direction of traffic**: Ingress
   - **Action on match**: Allow
   - **Targets**: Specified target tags
   - **Target tags**: `autotrade-vm`
   - **Source filter**: IP ranges
   - **Source IP ranges**: 
     - `0.0.0.0/0` (allow all - or restrict to your IPs)
   - **Protocols and ports**:
     - ✅ Specified protocols and ports
     - **TCP**: `8080`
4. Click **CREATE**

### Step 2: Add Network Tag to VM

1. Go to **Compute Engine** → **VM instances**
2. Click on `autotrade-vm`
3. Click **EDIT** at the top
4. Scroll to **Network tags**
5. Add tag: `autotrade-vm`
6. Click **SAVE**

### Step 3: Test External Access

1. Get your VM's external IP from VM instances page (e.g., `34.83.123.456`)
2. In your browser, visit:
   ```
   http://34.83.123.456:8080/healthz
   ```
3. You should see the health check JSON response

---

## Part 5: Set Up HTTPS with Caddy (Optional but Recommended)

### Step 1: Install Caddy (Reverse Proxy)

In SSH terminal:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

### Step 2: Configure Domain (Optional)

If you have a domain:
1. Point your domain DNS A record to VM's external IP
2. Example: `autotrade.yourdomain.com` → `34.83.123.456`
3. Wait for DNS propagation (5-30 minutes)

### Step 3: Configure Caddy

```bash
sudo nano /etc/caddy/Caddyfile
```

**Option A - With Domain (HTTPS auto-enabled)**:
```
autotrade.yourdomain.com {
    reverse_proxy localhost:8080
}
```

**Option B - IP Only (HTTP)**:
```
:80 {
    reverse_proxy localhost:8080
}
```

**Save and exit**: `Ctrl+X`, `Y`, `Enter`

### Step 4: Restart Caddy

```bash
sudo systemctl restart caddy
sudo systemctl status caddy
```

### Step 5: Update Firewall for HTTP/HTTPS

Firewall rules for HTTP (80) and HTTPS (443) should already be enabled from VM creation.

If using domain with HTTPS:
```
https://autotrade.yourdomain.com/healthz
```

If using IP with HTTP:
```
http://34.83.123.456/healthz
```

---

## Part 6: Connect Frontend to Autotrade VM

### Step 1: Get Service URL

**With domain**:
```
API: https://autotrade.yourdomain.com
WebSocket: wss://autotrade.yourdomain.com/ws/market-data
```

**Without domain (IP)**:
```
API: http://34.83.123.456:8080
WebSocket: ws://34.83.123.456:8080/ws/market-data
```

### Step 2: Update Backend Environment Variables

If your Node.js backend calls the Python service:

1. Go to **Cloud Run** → `backend` service (if deployed)
2. Or update your Vercel deployment
3. Add environment variable:
   ```
   AUTOTRADE_SERVICE_URL=https://autotrade.yourdomain.com
   ```

### Step 3: Update Frontend Environment Variables

1. Go to Vercel dashboard
2. Select your frontend project
3. Go to **Settings** → **Environment Variables**
4. Add:
   - **Key**: `VITE_AUTOTRADE_API_URL`
   - **Value**: `https://autotrade.yourdomain.com` (or IP)
   - **Key**: `VITE_AUTOTRADE_WS_URL`
   - **Value**: `wss://autotrade.yourdomain.com/ws/market-data` (or ws://IP:8080/...)
5. Redeploy frontend

### Step 4: Update CORS in Autotrade

1. SSH into VM
2. Edit `.env`:
   ```bash
   cd /opt/autotrade/learncodex/python-auto-trade
   nano .env
   ```
3. Update CORS:
   ```bash
   AUTOTRADE_CORS_ALLOW_ORIGINS=["https://your-frontend.vercel.app","http://localhost:5173","https://backend-xxx.run.app"]
   ```
4. Save and restart service:
   ```bash
   sudo systemctl restart autotrade
   ```

---

## Part 7: Monitoring & Maintenance

### View Service Logs

```bash
# Real-time logs
sudo journalctl -u autotrade -f

# Last 100 lines
sudo journalctl -u autotrade -n 100

# Today's logs
sudo journalctl -u autotrade --since today

# Application logs
tail -f /opt/autotrade/logs/autotrade.log

# Error logs
tail -f /opt/autotrade/logs/autotrade-error.log
```

### Check Service Status

```bash
# Service status
sudo systemctl status autotrade

# Restart service
sudo systemctl restart autotrade

# Stop service
sudo systemctl stop autotrade

# Start service
sudo systemctl start autotrade
```

### Monitor System Resources

```bash
# CPU and memory usage
top

# Press 'q' to exit

# Disk usage
df -h

# Check autotrade process
ps aux | grep autotrade
```

### Check Scheduler Health

```bash
# Via API
curl http://localhost:8080/healthz | jq

# Check Redis connection
curl http://localhost:8080/readyz | jq

# Get cached prices
curl http://localhost:8080/api/market/v1/prices | jq
```

### Set Up Log Rotation

```bash
sudo nano /etc/logrotate.d/autotrade
```

Add:
```
/opt/autotrade/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 YOUR_USERNAME YOUR_USERNAME
}
```

Replace `YOUR_USERNAME` with your username.

Save and test:
```bash
sudo logrotate -f /etc/logrotate.d/autotrade
```

---

## Part 8: Updates & Deployments

### Update Code from GitHub

```bash
# SSH into VM
# Navigate to project
cd /opt/autotrade/learncodex

# Pull latest changes
git pull origin main

# Activate venv
cd python-auto-trade
source .venv/bin/activate

# Install any new dependencies
uv pip install -e .

# Restart service
sudo systemctl restart autotrade

# Check logs
sudo journalctl -u autotrade -f
```

### Update Environment Variables

```bash
# Edit .env
cd /opt/autotrade/learncodex/python-auto-trade
nano .env

# Make changes, save

# Restart service
sudo systemctl restart autotrade
```

### Upgrade Python Packages

```bash
cd /opt/autotrade/learncodex/python-auto-trade
source .venv/bin/activate

# Upgrade all packages
uv pip install --upgrade -e .

# Or upgrade specific package
uv pip install --upgrade langchain

# Restart service
sudo systemctl restart autotrade
```

---

## Part 9: Backup & Disaster Recovery

### Backup Critical Files

```bash
# Create backup script
nano ~/backup-autotrade.sh
```

Add:
```bash
#!/bin/bash
BACKUP_DIR=~/autotrade-backups
DATE=$(date +%Y%m%d-%H%M%S)

mkdir -p $BACKUP_DIR

# Backup .env file
cp /opt/autotrade/learncodex/python-auto-trade/.env $BACKUP_DIR/env-$DATE

# Backup logs
tar -czf $BACKUP_DIR/logs-$DATE.tar.gz /opt/autotrade/logs/

# Keep only last 7 backups
ls -t $BACKUP_DIR/env-* | tail -n +8 | xargs rm -f
ls -t $BACKUP_DIR/logs-* | tail -n +8 | xargs rm -f

echo "Backup completed: $DATE"
```

Make executable:
```bash
chmod +x ~/backup-autotrade.sh
```

Run manually:
```bash
~/backup-autotrade.sh
```

### Create VM Snapshot (Recommended)

1. Go to **Compute Engine** → **Snapshots**
2. Click **CREATE SNAPSHOT**
3. Configure:
   - **Name**: `autotrade-vm-snapshot-YYYYMMDD`
   - **Source disk**: Select `autotrade-vm`
   - **Location**: Multi-regional (us)
4. Click **CREATE**

**Schedule automatic snapshots**:
1. Go to **Compute Engine** → **Snapshot schedules**
2. Click **CREATE SNAPSHOT SCHEDULE**
3. Configure:
   - **Name**: `autotrade-weekly`
   - **Region**: us-west1
   - **Schedule frequency**: Weekly on Sunday
   - **Start time**: 02:00
   - **Auto-delete after**: 4 weeks
4. Click **CREATE**
5. Attach to VM:
   - Go to **VM instances** → `autotrade-vm` → **EDIT**
   - Under **Boot disk**, click disk name
   - **Snapshot schedule**: `autotrade-weekly`
   - Click **SAVE**

### Restore from Snapshot

If VM crashes:
1. Go to **Compute Engine** → **Snapshots**
2. Find latest snapshot
3. Click **⋮** → **Create disk**
4. Create new VM with this disk
5. Update firewall rules and external IP

---

## Troubleshooting

### Issue: Service Won't Start

**Check status**:
```bash
sudo systemctl status autotrade
```

**Check logs**:
```bash
sudo journalctl -u autotrade -n 50
```

**Common causes**:
- Wrong paths in systemd file
- Missing environment variables
- Python dependencies not installed
- Redis connection failed

**Solution**:
```bash
# Test manually first
cd /opt/autotrade/learncodex/python-auto-trade
source .venv/bin/activate
uvicorn autotrade_service.main:app --host 0.0.0.0 --port 8080
```

### Issue: Out of Memory (OOM)

**Symptoms**:
- Service crashes randomly
- `dmesg` shows OOM killer messages

**Check memory**:
```bash
free -h
dmesg | grep -i "out of memory"
```

**Solutions**:
1. **Add swap space**:
   ```bash
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```

2. **Reduce memory usage**:
   - Decrease `AUTOTRADE_MARKET_DATA_SYMBOLS` list
   - Increase `AUTOTRADE_LLM_SCHEDULER_INTERVAL_MINUTES`
   - Optimize LangGraph chains

3. **Upgrade VM** (costs money):
   - Stop VM
   - Edit machine type → e2-small (2 GB RAM, ~$14/month)

### Issue: Schedulers Not Running

**Check health**:
```bash
curl http://localhost:8080/healthz | jq '.schedulers'
```

**Check logs**:
```bash
tail -100 /opt/autotrade/logs/autotrade.log | grep -i scheduler
```

**Verify environment**:
```bash
cat /opt/autotrade/learncodex/python-auto-trade/.env | grep DUAL_SCHEDULER
```

Should be: `AUTOTRADE_DUAL_SCHEDULER_ENABLED=true`

**Restart service**:
```bash
sudo systemctl restart autotrade
```

### Issue: Can't Connect from Outside

**Check firewall rule**:
1. Go to **VPC network** → **Firewall**
2. Verify `allow-autotrade-8080` rule exists
3. Verify VM has tag `autotrade-vm`

**Check service is listening**:
```bash
sudo netstat -tulpn | grep 8080
```

Should show: `uvicorn` listening on `0.0.0.0:8080`

**Test locally first**:
```bash
curl http://localhost:8080/healthz
```

If works locally but not externally, it's firewall.

### Issue: High CPU Usage

**Check what's using CPU**:
```bash
top
# Press 'P' to sort by CPU
```

**If autotrade is using >50% CPU**:
- Check for infinite loops in logs
- Verify LLM API calls aren't timing out and retrying
- Reduce market data refresh interval:
  ```bash
  AUTOTRADE_MARKET_DATA_REFRESH_INTERVAL_SECONDS=10
  ```

### Issue: Disk Full

**Check disk usage**:
```bash
df -h
du -sh /opt/autotrade/logs/*
```

**Clean up logs**:
```bash
# Archive old logs
cd /opt/autotrade/logs
tar -czf archive-$(date +%Y%m%d).tar.gz *.log
rm *.log

# Restart service (creates new logs)
sudo systemctl restart autotrade
```

**Set up log rotation** (see Part 7)

---

## Cost Monitoring

### Verify Free Tier Status

1. Go to **Billing** (https://console.cloud.google.com/billing)
2. Click **Reports**
3. Filter by **Compute Engine**
4. Verify:
   - **E2-micro instance in us-west1**: $0.00
   - **30 GB standard disk**: $0.00
   - **Egress < 1 GB**: $0.00

### Set Up Billing Alerts

1. Go to **Billing** → **Budgets & alerts**
2. Click **CREATE BUDGET**
3. Configure:
   - **Budget name**: `free-tier-alert`
   - **Projects**: Select your project
   - **Time range**: Monthly
   - **Budget type**: Specified amount
   - **Target amount**: $1
   - **Alert threshold rules**: 50%, 100%
   - **Email notification**: Your email
4. Click **FINISH**

**Important**: If you get charged anything, investigate immediately!

---

## Security Best Practices

### 1. Restrict SSH Access

1. Go to **VPC network** → **Firewall**
2. Find rule `default-allow-ssh`
3. Click to edit
4. **Source IP ranges**: Add only your IP (e.g., `123.45.67.89/32`)
5. Click **SAVE**

### 2. Create Firewall Rule for Your IP Only

For extra security:
```bash
# Get your current IP
curl ifconfig.me
```

1. Create new firewall rule `allow-autotrade-my-ip`
2. Source IP ranges: `YOUR_IP/32`
3. Target tags: `autotrade-vm`
4. TCP: 8080

### 3. Disable Root SSH

```bash
sudo nano /etc/ssh/sshd_config
```

Find and set:
```
PermitRootLogin no
```

Restart SSH:
```bash
sudo systemctl restart sshd
```

### 4. Set Up Automatic Security Updates

```bash
sudo apt install unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

Select **Yes** to enable automatic updates.

### 5. Rotate API Keys Regularly

Every 3 months:
1. Generate new OKX API keys
2. Generate new DeepSeek API keys
3. Update `.env` file
4. Restart service

---

## Migration Checklist

- [ ] Create GCP account and project
- [ ] Enable Compute Engine API
- [ ] Set up Upstash Redis (free tier)
- [ ] Get OKX API credentials
- [ ] Create E2-micro VM in us-west1
- [ ] Reserve static external IP
- [ ] SSH into VM via browser
- [ ] Install Python 3.11 and uv
- [ ] Clone code or upload manually
- [ ] Create virtual environment
- [ ] Install dependencies
- [ ] Create .env file with all variables
- [ ] Test run service manually
- [ ] Create systemd service file
- [ ] Enable and start systemd service
- [ ] Verify service is running
- [ ] Create firewall rule for port 8080
- [ ] Add network tag to VM
- [ ] Test external access
- [ ] Optional: Set up Caddy for HTTPS
- [ ] Optional: Configure custom domain
- [ ] Update frontend environment variables
- [ ] Update CORS settings
- [ ] Test WebSocket connection
- [ ] Set up log rotation
- [ ] Create VM snapshot
- [ ] Set up automatic snapshots
- [ ] Set up billing alerts
- [ ] Verify $0 cost in billing
- [ ] Document external IP and URLs
- [ ] Celebrate! 🎉

---

## Quick Reference

### Important Commands

```bash
# Service management
sudo systemctl status autotrade
sudo systemctl restart autotrade
sudo systemctl stop autotrade
sudo systemctl start autotrade

# View logs
sudo journalctl -u autotrade -f
tail -f /opt/autotrade/logs/autotrade.log

# Health check
curl http://localhost:8080/healthz | jq

# Update code
cd /opt/autotrade/learncodex
git pull origin main
cd python-auto-trade
source .venv/bin/activate
uv pip install -e .
sudo systemctl restart autotrade

# Monitor resources
top
free -h
df -h
```

### Important URLs

- **GCP Console**: https://console.cloud.google.com/
- **VM Instances**: https://console.cloud.google.com/compute/instances
- **Firewall Rules**: https://console.cloud.google.com/networking/firewalls
- **Billing**: https://console.cloud.google.com/billing
- **Upstash Dashboard**: https://console.upstash.com/

### Service Endpoints

```
API: http://YOUR_VM_IP:8080
Health Check: http://YOUR_VM_IP:8080/healthz
WebSocket: ws://YOUR_VM_IP:8080/ws/market-data
Metrics: http://YOUR_VM_IP:8080/metrics

With Domain:
API: https://autotrade.yourdomain.com
WebSocket: wss://autotrade.yourdomain.com/ws/market-data
```

### Important Files

```
Service file: /etc/systemd/system/autotrade.service
Environment: /opt/autotrade/learncodex/python-auto-trade/.env
Application logs: /opt/autotrade/logs/autotrade.log
Error logs: /opt/autotrade/logs/autotrade-error.log
Code location: /opt/autotrade/learncodex/python-auto-trade/
```

---

## Support Resources

- **GCP Compute Engine Docs**: https://cloud.google.com/compute/docs
- **GCP Free Tier**: https://cloud.google.com/free/docs/free-cloud-features
- **Systemd Docs**: https://www.freedesktop.org/software/systemd/man/systemd.service.html
- **Caddy Docs**: https://caddyserver.com/docs/
- **Upstash Redis**: https://docs.upstash.com/redis

---

## Important Notes

⚠️ **Free Tier Requirements**:
- Must use E2-micro machine type
- Must be in us-west1, us-central1, or us-east1 region
- 30 GB standard persistent disk (not SSD)
- 1 GB egress per month (North America)

⚠️ **Always Free**: This is "Always Free" not "12 months free trial". It stays free forever as long as you stay within limits.

⚠️ **Memory Limits**: 1 GB RAM might be tight for LangGraph. Monitor memory usage and add swap space if needed.

⚠️ **No Auto-Scaling**: Unlike Cloud Run, VM doesn't auto-scale. If you need more resources, manually upgrade (costs money).

⚠️ **Manual Maintenance**: You're responsible for OS updates, security patches, and service monitoring.

---

**Last Updated**: 2025-11-16
**Guide Type**: Python Autotrade on Free Tier VM
**Expected Cost**: **$0/month forever** ✅
