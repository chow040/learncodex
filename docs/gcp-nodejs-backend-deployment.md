# GCP Cloud Run - Node.js Backend Deployment (UI Guide)

Complete guide to migrate Node.js backend from Vercel to Google Cloud Run to solve timeout issues using the **Google Cloud Console UI** (no command line required).

## Why GCP Cloud Run?

- ✅ **15-minute timeout** (vs Vercel's 10s free / 60s pro)
- ✅ **Free tier sufficient** for our usage (~1,720 requests/month)
- ✅ **Keep Supabase PostgreSQL** (no database migration needed)
- ✅ **Frontend stays on Vercel** (simpler deployment)
- ✅ **Stateless API** - no schedulers needed

---

## Prerequisites

### 1. Create Google Cloud Account

1. Go to https://cloud.google.com/
2. Click **Get started for free**
3. Sign in with your Google account
4. Enter billing information (required, but won't be charged if staying in free tier)
5. Accept terms and complete setup

### 2. Create New Project

1. Go to https://console.cloud.google.com/
2. Click the project dropdown at the top (next to "Google Cloud")
3. Click **NEW PROJECT**
4. Enter project details:
   - **Project name**: `learncodex-prod`
   - **Organization**: Leave as default or select your org
   - **Location**: Leave as default
5. Click **CREATE**
6. Wait for project creation (takes ~10 seconds)
7. Make sure the new project is selected in the dropdown

### 3. Enable Required APIs

1. Go to **APIs & Services** → **Library** (or visit https://console.cloud.google.com/apis/library)
2. Search and enable these APIs one by one:
   - **Cloud Run API**
     - Search "Cloud Run" → Click **Cloud Run API** → Click **ENABLE**
   - **Cloud Build API**
     - Search "Cloud Build" → Click **Cloud Build API** → Click **ENABLE**
   - **Artifact Registry API**
     - Search "Artifact Registry" → Click **Artifact Registry API** → Click **ENABLE**

### 4. Set Up Billing (Required)

1. Go to **Billing** (https://console.cloud.google.com/billing)
2. Link your billing account to the project
3. **Optional**: Set up budget alerts:
   - Click **Budgets & alerts**
   - Click **CREATE BUDGET**
   - Set amount: `$10`
   - Set alerts at 50%, 90%, 100%
   - Click **FINISH**

---

## Part 1: Prepare Backend Code for Cloud Run

### Step 1: Create Dockerfile

1. Open your project in VS Code
2. Navigate to `backend/` folder
3. Create a new file named `Dockerfile` (no extension)
4. Copy and paste this content:

```dockerfile
# Use official Node.js LTS image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port (Cloud Run will set PORT env var)
ENV PORT=8080
EXPOSE 8080

# Start server
CMD ["node", "dist/server.js"]
```

### Step 2: Create .dockerignore

1. In `backend/` folder, create `.dockerignore`
2. Add this content:

```
node_modules
npm-debug.log
.env
.env.local
dist
.git
.gitignore
README.md
.vscode
.idea
*.md
coverage
.nyc_output
```

### Step 3: Update Server Port Configuration

1. Open `backend/src/server.ts`
2. Find the line where the port is defined (usually `const PORT = 4000`)
3. Replace it with:

```typescript
const PORT = parseInt(process.env.PORT || '4000', 10);
```

4. Make sure the listen call uses this PORT variable:

```typescript
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

5. Save the file

### Step 4: Build Docker Image Locally (Optional Test)

1. Open Terminal in VS Code
2. Navigate to backend:
   ```bash
   cd backend
   ```
3. Build the image:
   ```bash
   docker build -t backend-test .
   ```
4. If successful, you'll see "Successfully built..." message

---

## Part 2: Deploy Backend to Cloud Run

### Step 1: Create Artifact Registry Repository

1. Go to **Artifact Registry** (https://console.cloud.google.com/artifacts)
2. Click **CREATE REPOSITORY**
3. Configure:
   - **Name**: `backend-images`
   - **Format**: Docker
   - **Location type**: Region
   - **Region**: `asia-southeast1 (Singapore)`
   - **Encryption**: Google-managed encryption key
4. Click **CREATE**

### Step 2: Upload Code to Cloud Storage (for Cloud Build)

1. Go to **Cloud Storage** (https://console.cloud.google.com/storage)
2. Click **CREATE BUCKET**
3. Configure:
   - **Name**: `learncodex-backend-source` (must be globally unique, add random numbers if taken)
   - **Location type**: Region
   - **Region**: `asia-southeast1`
   - Click **CONTINUE** through other steps (use defaults)
4. Click **CREATE**
5. Click on the bucket name
6. Click **UPLOAD FILES**
7. Zip your entire `backend/` folder first:
   - On Mac: Right-click `backend/` → Compress
   - On Windows: Right-click `backend/` → Send to → Compressed folder
8. Upload the `backend.zip` file
9. Note the file path (e.g., `gs://learncodex-backend-source/backend.zip`)

### Step 3: Create Cloud Build Configuration

1. Extract your backend.zip in Cloud Shell:
   - Go to https://console.cloud.google.com/
   - Click the **Activate Cloud Shell** icon (terminal icon at top right)
   - Wait for shell to initialize
   - Run these commands:

```bash
# Create workspace directory
mkdir -p ~/backend-deploy
cd ~/backend-deploy

# Download your code from bucket
gsutil cp gs://learncodex-backend-source/backend.zip .

# Unzip
unzip backend.zip

# Verify files
ls -la
```

### Step 4: Build and Deploy with Cloud Build

Still in Cloud Shell, run:

```bash
# Build and push to Artifact Registry
gcloud builds submit --tag asia-southeast1-docker.pkg.dev/$(gcloud config get-value project)/backend-images/backend:latest

# This will take 3-5 minutes
```

### Step 5: Deploy to Cloud Run via UI

1. Go to **Cloud Run** (https://console.cloud.google.com/run)
2. Click **CREATE SERVICE**
3. Configure deployment:

   **Container image URL**:
   - Click **SELECT** 
   - Navigate to: `backend-images` → `backend` → `latest`
   - Click **SELECT**

   **Service name**: `backend`
   
   **Region**: `asia-southeast1 (Singapore)`
   
   **CPU allocation**: CPU is only allocated during request processing
   
   **Autoscaling**:
   - Minimum instances: `0` (free tier - cold starts OK)
   - Maximum instances: `10`
   
   **Authentication**: Allow unauthenticated invocations (check this box)

4. Click **CONTAINER, VARIABLES & SECRETS, CONNECTIONS, SECURITY** to expand advanced settings

5. Configure **Container** settings:
   - **Container port**: `8080`
   - **Request timeout**: `900` seconds (15 minutes)
   - **Memory**: `512 MiB`
   - **CPU**: `1`

6. Click **VARIABLES & SECRETS** tab

7. Add environment variables (click **+ ADD VARIABLE** for each):
   ```
   NODE_ENV = production
   OPENAI_API_KEY = your-openai-key-here
   FINNHUB_API_KEY = your-finnhub-key-here
   REDDIT_CLIENT_ID = your-reddit-id-here
   REDDIT_CLIENT_SECRET = your-reddit-secret-here
   DATABASE_URL = your-supabase-postgres-url-here
   FRONTEND_URL = https://your-frontend.vercel.app
   GOOGLE_CLIENT_ID = your-google-client-id
   GOOGLE_CLIENT_SECRET = your-google-client-secret
   JWT_SECRET = your-jwt-secret
   SESSION_SECRET = your-session-secret
   ```

8. Click **CREATE**

9. Wait 2-3 minutes for deployment

10. Once deployed, you'll see a **URL** like:
    ```
    https://backend-xxxxx-uc.a.run.app
    ```
    **Copy this URL - you'll need it later!**

### Step 6: Test Your Deployment

1. Click on the service URL from the previous step
2. Or manually visit: `https://backend-xxxxx-uc.a.run.app/health`
3. You should see a health check response

Test API endpoints:
- Open new browser tab
- Visit: `https://backend-xxxxx-uc.a.run.app/api/test` (or your actual endpoints)
- Verify response

---

## Part 3: Update Frontend to Use New Backend

### Step 1: Get Your Cloud Run Backend URL

1. Go to **Cloud Run** (https://console.cloud.google.com/run)
2. Click on `backend` service
3. Copy the **URL** at the top (e.g., `https://backend-xxxxx-uc.a.run.app`)

### Step 2: Update Frontend Environment Variables (Vercel)

1. Go to your Vercel dashboard (https://vercel.com/)
2. Select your frontend project (`equity-insight-react`)
3. Go to **Settings** → **Environment Variables**
4. Add new variable:
   - **Key**: `VITE_API_URL`
   - **Value**: `https://backend-xxxxx-uc.a.run.app` (your Cloud Run URL)
   - **Environment**: Production (check this)
5. Click **Save**
6. Go to **Deployments** tab
7. Find the latest deployment → Click **⋮** → **Redeploy**

### Step 3: Update Local Development Environment

1. In `equity-insight-react/` folder, create or edit `.env.local`:
   ```env
   VITE_API_URL=https://backend-xxxxx-uc.a.run.app
   ```
2. Restart your local dev server:
   ```bash
   npm run dev
   ```

### Step 4: Update Backend CORS Settings

1. Open `backend/src/server.ts`
2. Find the CORS configuration
3. Update it to include your frontend URL:

```typescript
import cors from 'cors';

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://your-frontend.vercel.app',  // Replace with your actual Vercel URL
    process.env.FRONTEND_URL
  ],
  credentials: true
}));
```

4. Save the file
5. Redeploy backend (repeat Part 2, Step 4-5)

### Step 5: Test End-to-End

1. Open your frontend: `https://your-frontend.vercel.app`
2. Test features that call the backend API
3. Open browser DevTools → Network tab
4. Verify API calls go to your Cloud Run URL
5. Check for any CORS errors (should be none)

---

## Part 4: Monitoring & Logs

### View Cloud Run Logs

1. Go to **Cloud Run** (https://console.cloud.google.com/run)
2. Click on `backend` service
3. Click **LOGS** tab
4. Use filters:
   - **Severity**: Select ERROR to see only errors
   - **Time range**: Last 1 hour, Last 24 hours, etc.
   - **Search**: Enter text to find specific logs

### View Metrics

1. In Cloud Run service page, click **METRICS** tab
2. View:
   - Request count
   - Request latency
   - Container instance count
   - CPU utilization
   - Memory utilization

### Set Up Alerts (Optional)

1. Go to **Monitoring** → **Alerting** (https://console.cloud.google.com/monitoring/alerting)
2. Click **CREATE POLICY**
3. Configure alert:
   - **Select a metric**: Cloud Run → Request count
   - **Threshold**: Alert if request count > 1000 per minute
   - **Notification**: Add your email
4. Click **CREATE POLICY**

---

## Part 5: Update Your Deployment

### When You Make Code Changes

1. Zip your updated `backend/` folder
2. Go to **Cloud Storage**
3. Upload new zip to your bucket (overwrite old one)
4. Go to **Cloud Shell**
5. Run:
   ```bash
   cd ~/backend-deploy
   rm -rf *
   gsutil cp gs://learncodex-backend-source/backend.zip .
   unzip backend.zip
   gcloud builds submit --tag asia-southeast1-docker.pkg.dev/$(gcloud config get-value project)/backend-images/backend:latest
   ```
6. Go to **Cloud Run**
7. Click `backend` service
8. Click **EDIT & DEPLOY NEW REVISION**
9. Container image should auto-update to `:latest`
10. Click **DEPLOY**

### Alternative: Deploy from GitHub (Recommended)

**One-time setup**:

1. Go to **Cloud Run**
2. Click `backend` service
3. Click **SET UP CONTINUOUS DEPLOYMENT**
4. Choose **GitHub**
5. Authenticate and select your repository
6. Configure:
   - **Branch**: `main`
   - **Build type**: Dockerfile
   - **Source location**: `/backend/Dockerfile`
7. Click **SAVE**

**After setup**:
- Every push to `main` branch auto-deploys!
- View builds in **Cloud Build** → **History**

---

## Part 6: Cost Management

### Check Current Usage

1. Go to **Billing** (https://console.cloud.google.com/billing)
2. Click **Reports**
3. View costs by:
   - Service
   - Project
   - Time range

### Free Tier Limits

Your estimated usage vs free tier:

| Resource | Your Usage | Free Tier | Status |
|----------|------------|-----------|--------|
| Requests | ~1,720/month | 2M/month | ✅ 0.08% used |
| Compute | ~35K GB-sec | 360K GB-sec | ✅ 10% used |
| Egress | <1GB/day | 1GB/day | ✅ Safe |

**Expected Cost: $0/month** ✅

### Cold Start Optimization (Optional)

If you want faster response times (no cold starts), you can set minimum instances to 1:

1. Go to **Cloud Run** → `backend`
2. Click **EDIT & DEPLOY NEW REVISION**
3. Set **Minimum instances**: `1`
4. Click **DEPLOY**

**Note**: This will cost ~$5/month but eliminates cold starts completely.

---

## Troubleshooting

### Issue: Deployment Fails

**Solution**:
1. Go to **Cloud Build** → **History**
2. Click failed build
3. Check **Build Logs** for errors
4. Common issues:
   - Missing dependencies in `package.json`
   - TypeScript errors → Run `npm run lint` locally
   - Port not set to 8080

### Issue: Service Times Out

**Solution**:
1. Go to **Cloud Run** → `backend`
2. Click **EDIT & DEPLOY NEW REVISION**
3. Increase **Request timeout** to `3600` (1 hour max)
4. Click **DEPLOY**

### Issue: Out of Memory

**Solution**:
1. Go to **Cloud Run** → `backend`
2. Click **EDIT & DEPLOY NEW REVISION**  
3. Increase **Memory** to `1 GiB` or `2 GiB`
4. Click **DEPLOY**

### Issue: CORS Errors

**Solution**:
1. Check `backend/src/server.ts` CORS config includes your frontend URL
2. Redeploy backend
3. Clear browser cache and retry

### Issue: Cold Start Too Slow

**Solution**:
1. Reduce Docker image size (use multi-stage builds)
2. Set minimum instances to 1 (costs ~$5/month)
3. Use Cloud Run's "always allocated CPU" option for faster cold starts

---

## Migration Checklist

- [ ] Create GCP account and project
- [ ] Enable required APIs (Cloud Run, Cloud Build, Artifact Registry)
- [ ] Create Dockerfile in backend/
- [ ] Create .dockerignore
- [ ] Update server.ts port configuration
- [ ] Create Artifact Registry repository
- [ ] Upload code to Cloud Storage
- [ ] Build and push Docker image
- [ ] Deploy to Cloud Run with environment variables
- [ ] Test backend URL endpoints
- [ ] Update frontend environment variables (Vercel)
- [ ] Update frontend .env.local
- [ ] Update backend CORS settings
- [ ] Test end-to-end application flow
- [ ] Set up monitoring and log viewing
- [ ] Set up billing alerts
- [ ] Document service URLs and secrets
- [ ] Optional: Set up continuous deployment from GitHub
- [ ] Celebrate! 🎉

---

## Quick Reference

### Important URLs

- **Cloud Console**: https://console.cloud.google.com/
- **Cloud Run**: https://console.cloud.google.com/run
- **Cloud Build**: https://console.cloud.google.com/cloud-build
- **Logs**: https://console.cloud.google.com/logs
- **Billing**: https://console.cloud.google.com/billing

### Your Service URLs

```
Backend Cloud Run URL: https://backend-xxxxx-uc.a.run.app
Frontend Vercel URL: https://your-frontend.vercel.app
Database: [Your Supabase URL]
```

### Key Secrets to Save

```
JWT_SECRET: [Your JWT secret]  
SESSION_SECRET: [Your session secret]
OPENAI_API_KEY: [Your OpenAI key]
FINNHUB_API_KEY: [Your Finnhub key]
REDDIT_CLIENT_ID: [Your Reddit client ID]
REDDIT_CLIENT_SECRET: [Your Reddit secret]
```

---

## Support Resources

- **GCP Cloud Run Docs**: https://cloud.google.com/run/docs
- **Pricing Calculator**: https://cloud.google.com/products/calculator
- **GCP Free Tier**: https://cloud.google.com/free
- **Support Forum**: https://www.googlecloudcommunity.com/

---

**Last Updated**: 2025-11-16
**Guide Type**: Node.js Backend (Stateless API)
**Cost**: $0/month (free tier)
