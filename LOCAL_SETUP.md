# Local Development Setup Guide

## 🚀 Quick Start for Testing

You have **2 options** for testing the authentication system locally:

### Option 1: Mock Authentication (Fastest) ⚡

Perfect for immediate testing without any external setup:

1. **Start the backend:**
   ```bash
   cd backend
   npm run dev
   ```

2. **Start the frontend:**
   ```bash
   cd equity-insight-react
   npm run dev
   ```

3. **Test the application:**
   - Visit `http://localhost:5173`
   - Click the **"Mock Login (Dev Only)"** button
   - You'll be logged in as a test user immediately
   - Test the authenticated dashboard with Equity Insight and Chart Analysis cards

### Option 2: Real Google OAuth (Production-Ready) 🔐

For testing the actual OAuth flow:

1. **Set up Google OAuth credentials:**
   - Follow instructions in `docs/google-oauth-setup.md`
   - Update `backend/.env` with your Google credentials

2. **Start both servers** (same as Option 1)

3. **Test OAuth flow:**
   - Visit `http://localhost:5173` 
   - Click **"Continue with Google"**
   - Complete the Google OAuth flow
   - You'll be redirected back and logged in

## 🔧 What's Already Configured

✅ **Database schema** - Users, sessions, and auth tables created  
✅ **Backend endpoints** - OAuth flow, session management, user profile  
✅ **Frontend components** - Auth-aware homepage, protected routes  
✅ **CORS configuration** - Frontend can communicate with backend  
✅ **Cookie-based sessions** - Secure session management  
✅ **Route protection** - Unauthenticated users redirected appropriately  

## 🎯 Testing Checklist

- [ ] Homepage loads with unauthenticated state
- [ ] Login button triggers auth flow
- [ ] Successful authentication shows dashboard
- [ ] User avatar and profile info display correctly
- [ ] Protected routes (like /equity-insight) require authentication
- [ ] Logout clears session and returns to homepage
- [ ] Page refresh maintains authenticated state

## 🐛 Common Issues

**"Access blocked: Authorization Error"**
- This happens with Google OAuth if credentials aren't set up
- Use Mock Authentication (Option 1) for immediate testing
- Or follow the Google OAuth setup guide for real authentication

**CORS errors:**
- Make sure backend is running on port 4000
- Check that FRONTEND_URL is set to http://localhost:5173

**Database connection issues:**
- Verify DATABASE_URL in backend/.env
- Auth tables should be automatically created

## 📝 Next Steps

Once authentication is working:
1. Test the Equity Insight page with authentication
2. Implement additional protected features  
3. Add user-specific data and preferences
4. Set up production OAuth credentials for deployment