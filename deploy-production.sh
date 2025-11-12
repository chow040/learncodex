#!/bin/bash

# Production Deployment Script
# This script helps deploy the application step by step

set -e  # Exit on error

echo "🚀 LearnCodex Production Deployment"
echo "===================================="
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "⚠️  This script should be run as root or with sudo" 
   exit 1
fi

# Function to ask for confirmation
confirm() {
    read -p "$1 (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Deployment cancelled"
        exit 1
    fi
}

echo "This script will:"
echo "1. Install system dependencies"
echo "2. Setup Node.js, Python, Redis, Nginx"
echo "3. Deploy Backend service"
echo "4. Deploy Auto-Trading service"
echo "5. Configure Nginx"
echo "6. Setup SSL with Let's Encrypt"
echo ""

confirm "Continue with deployment?"

# Variables
read -p "Enter your domain (e.g., example.com): " DOMAIN
read -p "Enter API subdomain (e.g., api.example.com): " API_DOMAIN
read -p "Enter Auto-Trading subdomain (e.g., autotrade.example.com): " AUTOTRADE_DOMAIN
read -p "Enter your email for SSL certificates: " EMAIL

echo ""
echo "📦 Installing system dependencies..."
apt update
apt upgrade -y

echo ""
echo "📦 Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

echo ""
echo "📦 Installing Python 3.11..."
apt install -y python3.11 python3.11-venv python3-pip

echo ""
echo "📦 Installing Redis..."
apt install -y redis-server
systemctl enable redis-server
systemctl start redis-server

echo ""
echo "📦 Installing Nginx..."
apt install -y nginx

echo ""
echo "📦 Installing PM2..."
npm install -g pm2

echo ""
echo "📦 Installing Certbot..."
apt install -y certbot python3-certbot-nginx

echo ""
echo "🔒 Setting up firewall..."
ufw allow 22
ufw allow 80
ufw allow 443
ufw --force enable

echo ""
echo "📁 Creating application directories..."
mkdir -p /var/www/backend
mkdir -p /var/www/python-auto-trade
mkdir -p /var/www/html

echo ""
echo "🔧 Backend Deployment"
echo "====================="
echo "Please manually:"
echo "1. Copy your backend code to /var/www/backend"
echo "2. Create /var/www/backend/.env.production with your production environment variables"
echo "3. Run the following commands:"
echo "   cd /var/www/backend"
echo "   npm ci --production"
echo "   npm run build"
echo "   pm2 start dist/server.js --name backend"
echo "   pm2 save"
echo ""
confirm "Backend deployed?"

echo ""
echo "🔧 Auto-Trading Service Deployment"
echo "==================================="
echo "Please manually:"
echo "1. Copy your python-auto-trade code to /var/www/python-auto-trade"
echo "2. Create /var/www/python-auto-trade/.env.production"
echo "3. Run the following commands:"
echo "   cd /var/www/python-auto-trade"
echo "   python3.11 -m venv venv"
echo "   source venv/bin/activate"
echo "   pip install -e ."
echo ""
confirm "Auto-Trading service ready?"

echo ""
echo "Creating systemd service for Auto-Trading..."
cat > /etc/systemd/system/autotrade.service << EOF
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
EOF

systemctl daemon-reload
systemctl enable autotrade
systemctl start autotrade

echo ""
echo "🌐 Configuring Nginx..."

# Remove default config
rm -f /etc/nginx/sites-enabled/default

# Create new config
cat > /etc/nginx/sites-available/learncodex << EOF
# Frontend
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    
    root /var/www/html;
    index index.html;
    
    location / {
        try_files \$uri \$uri/ /index.html;
    }
    
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}

# Backend API
server {
    listen 80;
    server_name $API_DOMAIN;
    
    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}

# Auto-Trading API
server {
    listen 80;
    server_name $AUTOTRADE_DOMAIN;
    
    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -s /etc/nginx/sites-available/learncodex /etc/nginx/sites-enabled/

nginx -t
systemctl restart nginx

echo ""
echo "🔐 Setting up SSL certificates..."
certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos -m $EMAIL
certbot --nginx -d $API_DOMAIN --non-interactive --agree-tos -m $EMAIL
certbot --nginx -d $AUTOTRADE_DOMAIN --non-interactive --agree-tos -m $EMAIL

echo ""
echo "✅ Deployment Complete!"
echo "======================="
echo ""
echo "Your services should be running at:"
echo "  Frontend: https://$DOMAIN"
echo "  Backend API: https://$API_DOMAIN"
echo "  Auto-Trading API: https://$AUTOTRADE_DOMAIN"
echo ""
echo "Next steps:"
echo "1. Copy your frontend build to /var/www/html"
echo "2. Test all services"
echo "3. Setup monitoring and backups"
echo "4. Review the PRODUCTION_DEPLOYMENT_GUIDE.md for more details"
echo ""
echo "Useful commands:"
echo "  pm2 status               - Check backend status"
echo "  pm2 logs backend         - View backend logs"
echo "  systemctl status autotrade - Check auto-trading status"
echo "  journalctl -u autotrade -f - View auto-trading logs"
echo "  nginx -t                 - Test nginx config"
echo ""
