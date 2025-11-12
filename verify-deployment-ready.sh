#!/bin/bash

# ============================================================================
# Vercel Deployment Quick Start Script
# ============================================================================
# This script helps you prepare for deployment and validates your setup
# Run this BEFORE deploying to Vercel/Railway

set -e  # Exit on error

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         LearnCodex Vercel Deployment Preparation              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ============================================================================
# Function: Check if command exists
# ============================================================================
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# ============================================================================
# Function: Print status
# ============================================================================
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $2"
    else
        echo -e "${RED}✗${NC} $2"
    fi
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# ============================================================================
# Step 1: Check Prerequisites
# ============================================================================
echo ""
echo -e "${BLUE}[Step 1/7] Checking Prerequisites...${NC}"
echo ""

# Check Node.js
if command_exists node; then
    NODE_VERSION=$(node --version)
    print_status 0 "Node.js installed: $NODE_VERSION"
    
    # Check if version is >= 18
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ $NODE_MAJOR -lt 18 ]; then
        print_warning "Node.js version should be >= 18. Current: $NODE_VERSION"
    fi
else
    print_status 1 "Node.js not installed"
    echo "   Install from: https://nodejs.org"
    exit 1
fi

# Check npm
if command_exists npm; then
    NPM_VERSION=$(npm --version)
    print_status 0 "npm installed: $NPM_VERSION"
else
    print_status 1 "npm not installed"
    exit 1
fi

# Check Python
if command_exists python3; then
    PYTHON_VERSION=$(python3 --version)
    print_status 0 "Python installed: $PYTHON_VERSION"
else
    print_status 1 "Python 3 not installed"
    echo "   Install from: https://www.python.org"
    exit 1
fi

# Check git
if command_exists git; then
    GIT_VERSION=$(git --version)
    print_status 0 "Git installed: $GIT_VERSION"
else
    print_status 1 "Git not installed"
    exit 1
fi

# ============================================================================
# Step 2: Check Git Repository Status
# ============================================================================
echo ""
echo -e "${BLUE}[Step 2/7] Checking Git Repository...${NC}"
echo ""

# Check if we're in a git repository
if git rev-parse --git-dir > /dev/null 2>&1; then
    print_status 0 "Git repository initialized"
    
    # Check for uncommitted changes
    if git diff-index --quiet HEAD --; then
        print_status 0 "No uncommitted changes"
    else
        print_warning "You have uncommitted changes"
        git status --short
    fi
    
    # Check if remote exists
    if git remote -v | grep -q "origin"; then
        REMOTE_URL=$(git remote get-url origin)
        print_status 0 "Remote repository configured: $REMOTE_URL"
    else
        print_status 1 "No remote repository configured"
        print_info "Add remote with: git remote add origin <url>"
    fi
else
    print_status 1 "Not a git repository"
    exit 1
fi

# ============================================================================
# Step 3: Check Environment Files
# ============================================================================
echo ""
echo -e "${BLUE}[Step 3/7] Checking Environment Files...${NC}"
echo ""

# Check if .env files are in .gitignore
if grep -q "\.env" .gitignore 2>/dev/null; then
    print_status 0 ".env files are in .gitignore"
else
    print_warning ".env files might not be in .gitignore"
    echo "   Add this line to .gitignore: .env*"
fi

# Check for .env files in repository
if git ls-files | grep -q "\.env$"; then
    print_warning "Found .env files in git history"
    echo "   These should be removed from git history"
    echo "   Run: git filter-branch --index-filter 'git rm --cached --ignore-unmatch .env' HEAD"
else
    print_status 0 "No .env files in git history"
fi

# Check for environment variable templates
if [ -f ".env.production.template" ]; then
    print_status 0 "Environment template exists"
else
    print_warning "No .env.production.template found"
fi

# ============================================================================
# Step 4: Test Frontend Build
# ============================================================================
echo ""
echo -e "${BLUE}[Step 4/7] Testing Frontend Build...${NC}"
echo ""

cd equity-insight-react

if [ -d "node_modules" ]; then
    print_status 0 "Frontend dependencies installed"
else
    print_warning "Frontend dependencies not installed. Installing..."
    npm install
fi

print_info "Building frontend..."
if npm run build > /dev/null 2>&1; then
    print_status 0 "Frontend build successful"
    
    # Check build output
    if [ -d "dist" ]; then
        BUILD_SIZE=$(du -sh dist | cut -f1)
        print_info "Build size: $BUILD_SIZE"
    fi
else
    print_status 1 "Frontend build failed"
    echo "   Run 'npm run build' to see errors"
    cd ..
    exit 1
fi

cd ..

# ============================================================================
# Step 5: Test Backend Build
# ============================================================================
echo ""
echo -e "${BLUE}[Step 5/7] Testing Backend Build...${NC}"
echo ""

cd backend

if [ -d "node_modules" ]; then
    print_status 0 "Backend dependencies installed"
else
    print_warning "Backend dependencies not installed. Installing..."
    npm install
fi

print_info "Building backend..."
if npm run build > /dev/null 2>&1; then
    print_status 0 "Backend build successful"
    
    # Check build output
    if [ -d "dist" ]; then
        print_info "Build output created in dist/"
    fi
else
    print_status 1 "Backend build failed"
    echo "   Run 'npm run build' to see errors"
    cd ..
    exit 1
fi

cd ..

# ============================================================================
# Step 6: Validate Configuration Files
# ============================================================================
echo ""
echo -e "${BLUE}[Step 6/7] Validating Configuration Files...${NC}"
echo ""

# Check vercel.json files
if [ -f "backend/vercel.json" ]; then
    print_status 0 "Backend vercel.json exists"
else
    print_warning "Backend vercel.json not found"
fi

if [ -f "equity-insight-react/vercel.json" ]; then
    print_status 0 "Frontend vercel.json exists"
else
    print_warning "Frontend vercel.json not found"
fi

# Check package.json files
if [ -f "backend/package.json" ]; then
    # Check for build script
    if grep -q '"build"' backend/package.json; then
        print_status 0 "Backend has build script"
    else
        print_warning "Backend package.json missing build script"
    fi
fi

if [ -f "equity-insight-react/package.json" ]; then
    # Check for build script
    if grep -q '"build"' equity-insight-react/package.json; then
        print_status 0 "Frontend has build script"
    else
        print_warning "Frontend package.json missing build script"
    fi
fi

# ============================================================================
# Step 7: Pre-Deployment Summary
# ============================================================================
echo ""
echo -e "${BLUE}[Step 7/7] Pre-Deployment Summary${NC}"
echo ""

echo -e "${GREEN}✓ All checks passed!${NC}"
echo ""
echo "You are ready to deploy to Vercel. Next steps:"
echo ""
echo "1. Read the deployment guide:"
echo "   ${BLUE}VERCEL_DEPLOYMENT_GUIDE.md${NC}"
echo ""
echo "2. Follow the deployment checklist:"
echo "   ${BLUE}DEPLOYMENT_CHECKLIST.md${NC}"
echo ""
echo "3. Prepare environment variables:"
echo "   ${BLUE}.env.production.template${NC}"
echo ""
echo "4. Deploy Frontend:"
echo "   • Go to https://vercel.com"
echo "   • Import GitHub repository"
echo "   • Root directory: ${YELLOW}equity-insight-react${NC}"
echo "   • Framework: Vite"
echo ""
echo "5. Deploy Backend:"
echo "   • Import same repository"
echo "   • Root directory: ${YELLOW}backend${NC}"
echo "   • Add all environment variables"
echo ""
echo "6. Deploy Auto-Trading Service:"
echo "   • Go to https://railway.app"
echo "   • Deploy ${YELLOW}python-auto-trade${NC}"
echo "   • Add Redis database"
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Need help? Check these resources:"
echo "  • Vercel Docs: https://vercel.com/docs"
echo "  • Railway Docs: https://docs.railway.app"
echo "  • Support: Open an issue on GitHub"
echo ""
echo -e "${GREEN}Good luck with your deployment! 🚀${NC}"
echo ""

# ============================================================================
# Optional: Generate deployment checklist
# ============================================================================
read -p "Do you want to open the deployment checklist? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if command_exists code; then
        code DEPLOYMENT_CHECKLIST.md
        print_info "Opened DEPLOYMENT_CHECKLIST.md in VS Code"
    elif command_exists open; then
        open DEPLOYMENT_CHECKLIST.md
        print_info "Opened DEPLOYMENT_CHECKLIST.md"
    else
        print_info "Please open DEPLOYMENT_CHECKLIST.md manually"
    fi
fi

exit 0
