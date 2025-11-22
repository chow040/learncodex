# Production Deployment Guide

## Architecture Overview

Your application consists of 3 main services:
1. **Frontend (React + Vite)** - Port 5173 (dev)
2. **Backend (Node.js + Express)** - Port 4000
3. **Auto-Trading Service (Python + FastAPI)** - Port 8000

**External Dependencies:**
- PostgreSQL (Supabase)
- Redis (localhost:6379)
- OKX Exchange API
- OpenAI/DeepSeek APIs

---

## Pre-Deployment Checklist

### 1. Code Quality & Security
- [ ] Remove all `console.log` statements from production code
- [ ] Review and remove any hardcoded secrets
- [ ] Ensure all `.env` files are in `.gitignore`
- [ ] Run security audits:
  ```bash
  # Backend
  cd backend && npm audit fix
  
  # Frontend
  cd equity-insight-react && npm audit fix
  
  # Python Auto-Trade
  cd python-auto-trade && pip-audit
  ```

### 2. Environment Variables Audit
- [ ] Create `.env.production` for each service
- [ ] Verify all API keys are production keys (not development/demo)
- [ ] Update database URLs to production instances
- [ ] Configure CORS origins for production domains
- [ ] Set `NODE_ENV=production`

### 3. Database Preparation
- [ ] Run all pending migrations on production database
- [ ] Create database backups before deployment
- [ ] Verify connection pooling settings
- [ ] Test database connections from production environment

### 4. Testing
- [ ] Run full test suite for all services
- [ ] Perform load testing on critical endpoints
- [ ] Test with production-like data volumes
- [ ] Verify all integrations (OKX, OpenAI, DeepSeek)

---

## Deployment Strategy

### Option A: Cloud Platform (Recommended)

#### 1. Deploy to Vercel (Frontend + Backend)

**Frontend (React):**
```bash
cd equity-insight-react

# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

**Vercel Configuration:**
Create `vercel.json`:
```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm install",
  "env": {
    "VITE_API_BASE_URL": "@api_base_url",
    "VITE_AUTOTRADE_API_BASE_URL": "@autotrade_api_base_url"
  }
}
```

**Backend (Node.js):**
```bash
cd backend

# Deploy
vercel --prod
```

Create `backend/vercel.json`:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "dist/server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "dist/server.js"
    }
  ]
}
```

#### 2. Deploy Auto-Trading Service (Railway/Render/Fly.io)

**Using Railway:**

1. Create `Dockerfile` in `python-auto-trade/`:
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY pyproject.toml .
COPY src/ src/
COPY README.md .

# Install Python dependencies
RUN pip install --no-cache-dir .

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "autotrade_service.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

2. Create `railway.json`:
```json
{
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

3. Deploy:
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

#### 3. Redis Setup

**Option 1: Redis Cloud (Recommended)**
- Sign up at https://redis.com/try-free/
- Get connection URL
- Update `AUTOTRADE_REDIS_URL` in production env

**Option 2: Railway Redis**
```bash
railway add redis
```

---

### Option B: VPS/Self-Hosted

#### 1. Server Requirements

**Minimum Specs:**
- CPU: 2 cores
- RAM: 4GB
- Storage: 20GB SSD
- OS: Ubuntu 22.04 LTS

**Recommended Providers:**
- DigitalOcean
- Linode
- AWS Lightsail
- Hetzner

#### 2. Initial Server Setup

```bash
# SSH into server
ssh root@your-server-ip

# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install Python 3.11
apt install -y python3.11 python3.11-venv python3-pip

# Install Nginx
apt install -y nginx

# Install Redis
apt install -y redis-server
systemctl enable redis-server
systemctl start redis-server

# Install PM2 for process management
npm install -g pm2

# Install PostgreSQL client (if needed)
apt install -y postgresql-client

# Setup firewall
ufw allow 22
ufw allow 80
ufw allow 443
ufw enable
```

#### 3. Deploy Backend Service

```bash
# Create app directory
mkdir -p /var/www/backend
cd /var/www/backend

# Clone your repository
git clone https://github.com/chow040/learncodex.git .
cd backend

# Install dependencies
npm ci --production

# Build
npm run build

# Create .env.production
nano .env.production
# Paste your production environment variables

# Start with PM2
pm2 start dist/server.js --name backend
pm2 save
pm2 startup
```

#### 4. Deploy Auto-Trading Service

```bash
# Create app directory
mkdir -p /var/www/python-auto-trade
cd /var/www/python-auto-trade

# Copy files from repository
cp -r /path/to/learncodex/python-auto-trade/* .

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -e .

# Create .env.production
nano .env.production
# Paste your production environment variables

# Create systemd service
sudo nano /etc/systemd/system/autotrade.service
```

Create `/etc/systemd/system/autotrade.service`:
```ini
[Unit]
Description=Auto Trading Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/python-auto-trade
Environment="PATH=/var/www/python-auto-trade/venv/bin"
EnvironmentFile=/var/www/python-auto-trade/.env.production
ExecStart=/var/www/python-auto-trade/venv/bin/uvicorn autotrade_service.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable autotrade
sudo systemctl start autotrade
sudo systemctl status autotrade
```

#### 5. Deploy Frontend

```bash
# Build frontend locally
cd equity-insight-react
npm run build

# Copy dist folder to server
scp -r dist/* root@your-server:/var/www/html/

# Or build on server
cd /var/www/frontend
git clone https://github.com/chow040/learncodex.git .
cd equity-insight-react
npm ci --production
npm run build
cp -r dist/* /var/www/html/
```

#### 6. Configure Nginx

```bash
# Remove default config
sudo rm /etc/nginx/sites-enabled/default

# Create new config
sudo nano /etc/nginx/sites-available/learncodex
```

Create Nginx configuration:
```nginx
# Frontend
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    
    root /var/www/html;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}

# Backend API
server {
    listen 80;
    server_name api.your-domain.com;
    
    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Auto-Trading API
server {
    listen 80;
    server_name autotrade.your-domain.com;
    
    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/learncodex /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

#### 7. Setup SSL with Let's Encrypt

```bash
# Install Certbot
apt install -y certbot python3-certbot-nginx

# Get SSL certificates
certbot --nginx -d your-domain.com -d www.your-domain.com
certbot --nginx -d api.your-domain.com
certbot --nginx -d autotrade.your-domain.com

# Auto-renewal is automatic, but you can test:
certbot renew --dry-run
```

---

## Environment Configuration

### Frontend (.env.production)
```bash
VITE_API_BASE_URL=https://api.your-domain.com
VITE_AUTOTRADE_API_BASE_URL=https://autotrade.your-domain.com
```

### Backend (.env.production)
```bash
NODE_ENV=production
PORT=4000

# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# OpenAI
OPENAI_API_KEY=sk-prod-...
OPENAI_MODEL=gpt-4

# Grok
GROK_API_KEY=xai-...
GROK_MODEL=grok-beta

# CORS
FRONTEND_URL=https://your-domain.com

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://api.your-domain.com/api/auth/google/callback

# Other APIs
FINNHUB_API_KEY=...
ALPHAVANTAGE_API_KEY=...
```

### Auto-Trading Service (.env.production)
```bash
# Database
AUTOTRADE_DB_URL=postgresql://user:password@host:5432/database

# Redis
AUTOTRADE_REDIS_URL=redis://your-redis-host:6379/0

# OKX API (Production)
AUTOTRADE_OKX_BASE_URL=https://www.okx.com
AUTOTRADE_OKX_API_KEY=your-production-key
AUTOTRADE_OKX_SECRET_KEY=your-production-secret
AUTOTRADE_OKX_PASSPHRASE=your-production-passphrase
AUTOTRADE_OKX_DEMO_MODE=false  # Set to false for live trading!

# CCXT
AUTOTRADE_CCXT_ENABLED=true
AUTOTRADE_CCXT_EXCHANGE_ID=okx

# DeepSeek
AUTOTRADE_DEEPSEEK_API_URL=https://api.deepseek.com
AUTOTRADE_DEEPSEEK_API_KEY=sk-...
AUTOTRADE_DEEPSEEK_MODEL=deepseek-reasoner

# Service
AUTOTRADE_SERVICE_NAME=autotrade-service
AUTOTRADE_SERVICE_PORT=8000
AUTOTRADE_LOG_LEVEL=info
AUTOTRADE_DUAL_SCHEDULER_ENABLED=true
AUTOTRADE_DECISION_INTERVAL_MINUTES=5

# Trading Mode
AUTOTRADE_SIMULATION_ENABLED=false  # Set to false for live trading!
AUTOTRADE_TRADING_BROKER=okx_demo  # Change to 'okx_live' for production

# Market Data
AUTOTRADE_MARKET_DATA_SYMBOLS=["BTC-USDT-SWAP","ETH-USDT-SWAP","SOL-USDT-SWAP"]
AUTOTRADE_LLM_TRADING_SYMBOLS=["BTC-USDT-SWAP","ETH-USDT-SWAP"]
```

---

## Post-Deployment Steps

### 1. Database Migrations
```bash
# Backend migrations
cd backend
npm run drizzle:migrate

# Verify tables
psql $DATABASE_URL -c "\dt"
```

### 2. Health Checks

Create monitoring endpoints and test:
```bash
# Backend
curl https://api.your-domain.com/health

# Auto-Trading
curl https://autotrade.your-domain.com/health
```

### 3. Monitoring Setup

**Option 1: PM2 Monitoring**
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7

# View logs
pm2 logs backend
```

**Option 2: Sentry for Error Tracking**
```bash
# Install
npm install @sentry/node @sentry/tracing

# Add to backend/src/server.ts
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: "your-sentry-dsn",
  environment: "production",
  tracesSampleRate: 0.1,
});
```

**Option 3: Uptime Monitoring**
- UptimeRobot (free)
- Pingdom
- StatusCake

### 4. Backup Strategy

**Database Backups:**
```bash
# Create backup script
nano /root/backup-db.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/postgres"
mkdir -p $BACKUP_DIR

pg_dump $DATABASE_URL > $BACKUP_DIR/backup_$DATE.sql
gzip $BACKUP_DIR/backup_$DATE.sql

# Keep only last 7 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete
```

```bash
# Make executable
chmod +x /root/backup-db.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /root/backup-db.sh
```

### 5. Security Hardening

```bash
# Disable root SSH login
nano /etc/ssh/sshd_config
# Set: PermitRootLogin no
systemctl restart sshd

# Setup fail2ban
apt install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# Configure automatic security updates
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

---

## Rollback Plan

### If Deployment Fails:

1. **Frontend Rollback:**
```bash
# Vercel: Rollback via dashboard
# Self-hosted:
cd /var/www/html
rm -rf *
cp -r /backup/previous-build/* .
```

2. **Backend Rollback:**
```bash
pm2 stop backend
cd /var/www/backend
git checkout <previous-commit>
npm ci
npm run build
pm2 restart backend
```

3. **Auto-Trading Rollback:**
```bash
sudo systemctl stop autotrade
cd /var/www/python-auto-trade
git checkout <previous-commit>
source venv/bin/activate
pip install -e .
sudo systemctl start autotrade
```

4. **Database Rollback:**
```bash
# Restore from backup
psql $DATABASE_URL < /var/backups/postgres/backup_YYYYMMDD_HHMMSS.sql
```

---

## Performance Optimization

### 1. Frontend Optimization
- Enable Vite build optimizations
- Use CDN for static assets (Cloudflare)
- Implement code splitting
- Add service worker for caching

### 2. Backend Optimization
```javascript
// Add compression
import compression from 'compression';
app.use(compression());

// Add rate limiting
import rateLimit from 'express-rate-limit';
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);
```

### 3. Database Optimization
- Add indexes on frequently queried columns
- Enable connection pooling
- Use read replicas if needed

---

## Cost Estimation

### Cloud Platform Option:
- **Vercel (Frontend + Backend)**: $20-50/month
- **Railway (Auto-Trading)**: $5-20/month
- **Redis Cloud**: $0-10/month (free tier available)
- **Supabase**: $0-25/month
- **Total**: ~$25-105/month

### VPS Option:
- **DigitalOcean Droplet (4GB)**: $24/month
- **Redis Cloud**: $0-10/month
- **Supabase**: $0-25/month
- **Domain**: $12/year
- **Total**: ~$24-59/month

---

## Support & Maintenance

### Weekly Tasks:
- [ ] Check error logs
- [ ] Review system metrics
- [ ] Verify backup completion

### Monthly Tasks:
- [ ] Update dependencies
- [ ] Security audit
- [ ] Performance review
- [ ] Cost optimization review

### Emergency Contacts:
- Database issues: Supabase support
- OKX API issues: OKX support
- SSL issues: Let's Encrypt community

---

## Additional Resources

- [PM2 Documentation](https://pm2.keymetrics.io/docs/)
- [Nginx Configuration](https://nginx.org/en/docs/)
- [Let's Encrypt](https://letsencrypt.org/getting-started/)
- [Vercel Deployment](https://vercel.com/docs)
- [Railway Deployment](https://docs.railway.app/)

---

## Next Steps

1. **Choose deployment strategy** (Cloud vs VPS)
2. **Prepare environment variables** for all services
3. **Test in staging environment** first
4. **Schedule deployment** during low-traffic period
5. **Monitor closely** for first 24-48 hours
6. **Have rollback plan ready**

Good luck with your deployment! 🚀
