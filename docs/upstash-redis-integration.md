# Upstash Redis Integration Guide

This guide explains how to integrate Upstash Redis with your auto-trading service.

## Why Upstash?

- ✅ **Free Tier**: 10,000 commands/day, 256 MB storage
- ✅ **Serverless-Ready**: REST API perfect for Vercel functions
- ✅ **Low Latency**: Global edge network
- ✅ **No Connection Pooling Needed**: HTTP-based, not TCP
- ✅ **Automatic Scaling**: Handles traffic spikes

## Setup Instructions

### 1. Create Upstash Account

1. Go to [upstash.com](https://upstash.com)
2. Sign up with GitHub
3. Click **"Create Database"**

### 2. Configure Database

- **Name**: `learncodex-redis`
- **Type**: Regional (or Global for multi-region)
- **Region**: Choose closest to your Vercel region
  - `us-east-1` → US East (Virginia)
  - `eu-west-1` → EU West (Ireland)
  - `ap-southeast-1` → Asia Pacific (Singapore)
- **TLS**: Enabled (recommended)

### 3. Get Credentials

After creating the database:

1. Go to **Details** tab
2. Copy:
   - **REST URL**: `UPSTASH_REDIS_REST_URL`
   - **REST Token**: `UPSTASH_REDIS_REST_TOKEN`

### 4. Add to Vercel

In your Vercel project (auto-trading service):

1. Go to **Settings** → **Environment Variables**
2. Add:
   ```
   UPSTASH_REDIS_REST_URL = https://your-db-xxxxx.upstash.io
   UPSTASH_REDIS_REST_TOKEN = AXXXAxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

## Code Integration

### Install Upstash Redis Python Client

```bash
pip install upstash-redis
```

### Update requirements.txt

```txt
upstash-redis>=0.15.0
```

### Update Redis Client Code

Replace the existing Redis client with Upstash REST client:

```python
# autotrade_service/infrastructure/redis_client.py

from upstash_redis import Redis
from typing import Optional
import json
import os

class UpstashRedisClient:
    """Redis client using Upstash REST API for serverless compatibility"""
    
    def __init__(self):
        self.url = os.getenv("UPSTASH_REDIS_REST_URL")
        self.token = os.getenv("UPSTASH_REDIS_REST_TOKEN")
        
        if not self.url or not self.token:
            raise ValueError("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set")
        
        self.client = Redis(url=self.url, token=self.token)
    
    async def get(self, key: str) -> Optional[str]:
        """Get value from Redis"""
        try:
            result = self.client.get(key)
            return result if result else None
        except Exception as e:
            print(f"Redis GET error: {e}")
            return None
    
    async def set(self, key: str, value: str, ttl: Optional[int] = None) -> bool:
        """Set value in Redis with optional TTL"""
        try:
            if ttl:
                self.client.setex(key, ttl, value)
            else:
                self.client.set(key, value)
            return True
        except Exception as e:
            print(f"Redis SET error: {e}")
            return False
    
    async def get_json(self, key: str) -> Optional[dict]:
        """Get JSON value from Redis"""
        value = await self.get(key)
        if value:
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return None
        return None
    
    async def set_json(self, key: str, value: dict, ttl: Optional[int] = None) -> bool:
        """Set JSON value in Redis"""
        try:
            json_str = json.dumps(value)
            return await self.set(key, json_str, ttl)
        except Exception as e:
            print(f"Redis SET JSON error: {e}")
            return False
    
    async def delete(self, key: str) -> bool:
        """Delete key from Redis"""
        try:
            self.client.delete(key)
            return True
        except Exception as e:
            print(f"Redis DELETE error: {e}")
            return False
    
    async def exists(self, key: str) -> bool:
        """Check if key exists"""
        try:
            return bool(self.client.exists(key))
        except Exception as e:
            print(f"Redis EXISTS error: {e}")
            return False
    
    async def close(self):
        """Close connection (no-op for REST API)"""
        pass
```

### Update Configuration

```python
# autotrade_service/config.py

from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # ... existing settings ...
    
    # Upstash Redis
    upstash_redis_rest_url: str
    upstash_redis_rest_token: str
    
    class Config:
        env_file = ".env"
```

## Benefits Over TCP Redis

| Feature | TCP Redis | Upstash REST |
|---------|-----------|--------------|
| Connection Type | TCP (persistent) | HTTP (stateless) |
| Serverless Support | ❌ Limited | ✅ Perfect |
| Connection Pooling | Required | Not needed |
| Cold Starts | Slow | Fast |
| Edge Compatibility | Limited | Global |
| Cost (Free Tier) | Usually none | 10K commands/day |

## Monitoring

### Upstash Dashboard

1. Go to [console.upstash.com](https://console.upstash.com)
2. Select your database
3. View:
   - **Commands**: Executed per day
   - **Storage**: Used storage
   - **Latency**: P50, P95, P99
   - **Throughput**: Requests per second

### Set Alerts

1. Go to database **Settings**
2. Enable notifications for:
   - High command usage (approaching limit)
   - Storage usage
   - Error rate spikes

## Free Tier Limits

- **Commands**: 10,000 per day
- **Storage**: 256 MB
- **Bandwidth**: 200 MB per day
- **Concurrent Connections**: 100

### Estimating Usage

For your trading system:

**Market Data Updates** (every 5 minutes):
- 6 symbols × 6 data types = 36 keys
- 36 SET commands × 12 times/hour × 24 hours = ~10,368 commands/day
- **Just within free tier!**

**Decision Logs** (every 30 minutes):
- ~48 writes/day
- Minimal impact

**Position Syncs** (every 5 minutes):
- ~288 writes/day
- Minimal impact

**Total**: ~10,700 commands/day

💡 **Tip**: Increase update intervals slightly if approaching limits:
- Market data: 6 minutes instead of 5 → 8,640 commands/day
- Stays comfortably within free tier

## Migration Checklist

- [ ] Create Upstash account
- [ ] Create Redis database
- [ ] Copy REST URL and token
- [ ] Add to Vercel environment variables
- [ ] Install `upstash-redis` package
- [ ] Update Redis client code
- [ ] Test locally with Upstash
- [ ] Deploy to Vercel
- [ ] Monitor usage in Upstash dashboard
- [ ] Set up usage alerts

## Troubleshooting

### Connection Errors

```bash
# Verify credentials
curl -H "Authorization: Bearer YOUR_TOKEN" YOUR_REST_URL/get/test-key
```

### Rate Limiting

If you exceed the free tier:

1. **Option 1**: Upgrade to pay-as-you-go (~$0.2 per 100K commands)
2. **Option 2**: Increase cache TTL to reduce writes
3. **Option 3**: Reduce update frequency

### High Latency

- Choose Upstash region closest to Vercel deployment
- Use Global database for multi-region (premium feature)
- Enable caching at application level

## Next Steps

After setting up Upstash:

1. Update all Redis client code
2. Test with staging environment
3. Monitor usage for 24-48 hours
4. Optimize cache TTL based on patterns
5. Consider upgrading if needed

---

**Resources**:
- Upstash Docs: https://docs.upstash.com
- Python SDK: https://github.com/upstash/upstash-redis-python
- Pricing: https://upstash.com/pricing
