# Quick Start: alphaflux.app Setup

> Since you bought the domain from Vercel, setup is **super simple**! ⚡

## TL;DR - Complete Setup in 6 Steps

### 1. Add Domains to Vercel (5 minutes)

**Frontend:**
- Go to: https://vercel.com/chow040/learncodex/settings/domains
- Click "Add" → Enter `alphaflux.app` → Click "Add"
- ✅ Instant verification!

**Backend:**
- Go to: https://vercel.com/chow040/learncodex-oyau/settings/domains
- Click "Add" → Enter `api.alphaflux.app` → Click "Add"
- ✅ Instant verification!

### 2. Update Environment Variables (10 minutes)

**Frontend** (learncodex):
```
VITE_API_BASE_URL = https://api.alphaflux.app
```

**Backend** (learncodex-oyau):
```
FRONTEND_URL = https://alphaflux.app
GOOGLE_REDIRECT_URI = https://api.alphaflux.app/api/auth/google/callback
COOKIE_DOMAIN = .alphaflux.app
PKCE_ENCRYPTION_KEY = <generate-64-char-hex>
```

Generate key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Update Google OAuth (5 minutes)

**Google Cloud Console** → OAuth Client:

**Authorized origins:** Add `https://alphaflux.app`

**Redirect URIs:** Add `https://api.alphaflux.app/api/auth/google/callback`

### 4. Deploy Code Changes (5 minutes)

```bash
cd /Users/chowhanwong/project/learncodex

git add .
git commit -m "feat: Add custom domain alphaflux.app with subdomain architecture"
git push
```

### 5. Wait for Deployment (2-3 minutes)

Watch deployments complete:
- Frontend: https://vercel.com/chow040/learncodex/deployments
- Backend: https://vercel.com/chow040/learncodex-oyau/deployments

### 6. Test! (5 minutes)

1. Open: https://alphaflux.app
2. Click "Sign in with Google"
3. Complete OAuth
4. ✅ Should work on iOS Safari!

---

## What Changed in Code

✅ **Backend:** Added `COOKIE_DOMAIN` support for subdomain cookie sharing
✅ **Frontend:** Removed Vercel rewrites (using direct subdomain instead)
✅ **Cookies:** Changed from `sameSite: 'none'` to `sameSite: 'lax'` (more secure)

---

## Verification Checklist

After deployment:

- [ ] Frontend loads at https://alphaflux.app
- [ ] Backend health check: https://api.alphaflux.app/api/health returns 200
- [ ] OAuth works on desktop Chrome
- [ ] OAuth works on iOS Safari ⭐
- [ ] DevTools shows cookies with domain `.alphaflux.app`

---

## Need More Details?

See: `CUSTOM_DOMAIN_SETUP_ALPHAFLUX.md` (full guide with troubleshooting)

---

**Total Time:** ~30-60 minutes
**Difficulty:** Easy (Vercel handles DNS automatically)
**Success Rate:** 99%+

Let's get started! 🚀
