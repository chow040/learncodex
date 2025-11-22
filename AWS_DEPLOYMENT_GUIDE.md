# AWS Deployment Guide

This document explains how to deploy the entire LearnCodex stack (frontend, backend, and Python auto-trade service) onto AWS using services that stay within or close to the free tier. Adjust sizing as traffic grows.

## Architecture Overview

- **Frontend (Vite React)** → build locally, host static assets in S3, serve through CloudFront, domain `alphaflux.app`
- **Backend (Express API)** → Docker image on ECS Fargate (or EC2-based ECS for true free tier), exposed via Application Load Balancer with domain `api.alphaflux.app`
- **Python Auto-Trade Service** → Docker image on ECS Fargate, its own ALB, domain `autotrade.alphaflux.app`
- **Secrets/Config** → AWS Secrets Manager or Systems Manager Parameter Store
- **Scheduler** → EventBridge Scheduler hitting `/internal/autotrade/v1/scheduler/cron-trigger`
- **External services** → reuse Upstash Redis/Supabase/Postgres unless migrating to RDS/Elasticache

## Prerequisites

1. AWS account (free tier) with billing info.
2. AWS CLI configured locally (`aws configure`).
3. Domain `alphaflux.app` managed via Route 53 or an external registrar (you'll need ability to set ALIAS/CNAME records).
4. Docker installed for building container images.
5. GitHub repository access to set up CI/CD pipelines.

## Step 1: Create Container Registries (ECR)

We'll build and push two images.

```bash
aws ecr create-repository --repository-name backend-app
aws ecr create-repository --repository-name autotrade-service
```

Note the repository URIs (`<account>.dkr.ecr.<region>.amazonaws.com/backend-app`).

## Step 2: Build and Push Backend Image

```bash
cd backend
docker build -t backend-app:latest .
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
docker tag backend-app:latest <account>.dkr.ecr.<region>.amazonaws.com/backend-app:latest
docker push <account>.dkr.ecr.<region>.amazonaws.com/backend-app:latest
```

## Step 3: Build and Push Python Auto-Trade Image

```bash
cd python-auto-trade
docker build -t autotrade-service:latest .
docker tag autotrade-service:latest <account>.dkr.ecr.<region>.amazonaws.com/autotrade-service:latest
docker push <account>.dkr.ecr.<region>.amazonaws.com/autotrade-service:latest
```

## Step 4: Networking & Certificates

1. Create a VPC (or reuse default) with at least two public and private subnets.
2. Create security groups:
   - ALB SG: allow inbound 80/443 from the internet.
   - Service SGs: allow inbound only from ALB SG on their respective ports (4000 for backend, 8085 for Python).
3. In ACM (us-east-1 if using CloudFront), issue certificates for:
   - `alphaflux.app` + `www.alphaflux.app`
   - `api.alphaflux.app`
   - `autotrade.alphaflux.app`

## Step 5: ECS Cluster

Create an ECS cluster (Fargate). Attach the VPC and subnets. Enable CloudWatch Container Insights if desired.

## Step 6: Backend ECS Service

1. **Task Definition** (`backend-app`):
   - Launch type: Fargate
   - CPU: 0.5 vCPU, Memory: 1 GB
   - Container image: backend-app ECR URI
   - Port mapping 4000
   - Environment variables: use Secrets Manager/SSM for OpenAI keys, DB URLs, etc. `AUTOTRADE_SERVICE_URL` should point to `https://autotrade.alphaflux.app` once Python service is live.
   - Logging: awslogs driver `/ecs/backend-app`
2. **Service**:
   - Desired tasks: 1
   - Subnets: private
   - Security group: backend SG
   - Load balancer: create an Application Load Balancer (public subnets). Add target group `backend-tg` (port 4000, health check `/health`). Attach the service.
3. **ALB Listener**:
   - Listener 80 → redirect to 443
   - Listener 443 → SSL cert for `api.alphaflux.app`, forward to `backend-tg`
4. **Route 53**: ALIAS record `api.alphaflux.app` → ALB DNS name.

## Step 7: Python Auto-Trade ECS Service

1. **Task Definition** (`autotrade-service`):
   - CPU: 1 vCPU, Memory: 2 GB (scale up as needed)
   - Container image: autotrade-service ECR URI
   - Port mapping 8085
   - Env vars: all `AUTOTRADE_*` values (DeepSeek, Redis, OKX, etc.) plus `AUTOTRADE_CRON_TRIGGER_TOKEN`. Reference secrets via SSM/Secrets Manager.
   - Logging: awslogs `/ecs/autotrade-service`
2. **Service**:
   - Desired tasks: 1
   - Subnets: private
   - Security group: autotrade SG (allow inbound 8085 from the Python ALB SG and the backend SG if needed).
   - Load balancer: new ALB (`autotrade-alb`). Target group port 8085, health check `/healthz`.
3. **ALB Listener**:
   - 80 → redirect to 443
   - 443 → cert for `autotrade.alphaflux.app`, forward to autotrade target group
4. **Route 53**: ALIAS `autotrade.alphaflux.app` → Python ALB.

## Step 8: Frontend Deployment (S3 + CloudFront)

1. Build: `cd equity-insight-react && npm install && npm run build`.
2. Create S3 bucket (e.g., `alphaflux-frontend`), disable public access block, enable static hosting.
3. Upload build: `aws s3 sync dist/ s3://alphaflux-frontend`.
4. Create CloudFront distribution:
   - Origin: S3 bucket
   - Default behavior: GET/HEAD
   - Enable HTTP → HTTPS redirect
   - Attach ACM cert for `alphaflux.app`/`www`
   - Default root: `index.html`
5. Route 53: ALIAS `alphaflux.app` and `www.alphaflux.app` → CloudFront distribution.
6. (Optional) Automate deploy with GitHub Actions: build → `aws s3 sync` → `aws cloudfront create-invalidation --paths "/*"`.

## Step 9: Scheduler via EventBridge

1. EventBridge Scheduler → Create schedule `autotrade-cron`.
   - Expression: `rate(3 minutes)` (match `AUTOTRADE_DECISION_INTERVAL_MINUTES`).
2. Target: API Destination
   - Endpoint: `https://autotrade.alphaflux.app/internal/autotrade/v1/scheduler/cron-trigger`
   - HTTP method: POST
   - Headers: `Content-Type: application/json`, `X-Cron-Token: <token>`
   - Body: `{}`
3. Create an API Destination connection (no auth needed besides headers). Grant EventBridge permission to invoke.
4. Monitor schedule invocations via CloudWatch Metrics.

## Step 10: Secrets & Config Management

- Use **AWS Secrets Manager** for API keys (OpenAI, DeepSeek, OKX, etc.). Each ECS task references the ARN via `ValueFrom`.
- Use **Systems Manager Parameter Store** for non-secret configs (intervals, base URLs, feature flags).
- When values change, `aws ecs update-service --force-new-deployment` redeploys tasks with new env vars.

## Step 11: CI/CD Pipelines (Optional)

- **Backend/Python**: GitHub Actions pipeline to build Docker image, push to ECR, run `aws ecs update-service`.
- **Frontend**: pipeline to run `npm run build`, `aws s3 sync`, CloudFront invalidation.

## Step 12: Verification Checklist

1. `curl https://alphaflux.app` → returns HTML from CloudFront.
2. `curl https://api.alphaflux.app/health` → `{ "status": "ok" }`.
3. `curl https://autotrade.alphaflux.app/healthz` → scheduler + redis info.
4. Backend proxy: `curl https://api.alphaflux.app/api/autotrade/v1/scheduler/status`.
5. Scheduler trigger:
   ```bash
   curl -X POST \
     -H "Content-Type: application/json" \
     -H "X-Cron-Token: $AUTOTRADE_CRON_TRIGGER_TOKEN" \
     https://autotrade.alphaflux.app/internal/autotrade/v1/scheduler/cron-trigger
   ```
6. EventBridge schedule metrics show successful invocations.

## Cost Monitoring

- CloudWatch Metrics and Billing dashboard for ECS, ALBs, CloudFront, S3.
- Free tier covers: first 12 months of `t2.micro` equivalents, 5GB S3, 1M Lambda/EventBridge requests, etc. Fargate itself isn’t fully free, so consider ECS on EC2 (t2.micro) if you must stay within free limits.

## Troubleshooting Tips

- **ALB 502/503**: check ECS task health and security groups.
- **Docker push errors**: ensure ECR login session is valid (`aws ecr get-login-password`).
- **Cron trigger failures**: inspect EventBridge logs; confirm `X-Cron-Token` matches `AUTOTRADE_CRON_TRIGGER_TOKEN`.
- **CORS issues**: update `AUTOTRADE_CORS_ALLOW_ORIGINS` in Python settings to include new domain(s).
- **Large dependency updates**: since Fargate uses containers, image size is no longer a blocker (the Vercel 250MB limit is gone).

---

With this setup the entire stack runs on AWS-managed infrastructure with room to scale, and the services retain their custom domains: `alphaflux.app`, `api.alphaflux.app`, `autotrade.alphaflux.app`.
