# Google OAuth Setup for Local Development

## Step 1: Create Google OAuth Application

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API or Google Identity API
4. Go to "Credentials" in the left sidebar
5. Click "Create Credentials" → "OAuth 2.0 Client IDs"
6. Choose "Web application" as the application type
7. Set the following:
   - **Name**: LearnCodex Local Dev
   - **Authorized JavaScript origins**: `http://localhost:5173`
   - **Authorized redirect URIs**: `http://localhost:4000/api/auth/google/callback`

## Step 2: Update Environment Variables

Copy the Client ID and Client Secret from Google Cloud Console and update your `.env` file:

```bash
# Replace these with your actual Google OAuth credentials
GOOGLE_CLIENT_ID=your_actual_google_client_id_here
GOOGLE_CLIENT_SECRET=your_actual_google_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
FRONTEND_URL=http://localhost:5173
```

## Step 3: Test the Flow

1. Start the backend: `npm run dev` (in backend directory)
2. Start the frontend: `npm run dev` (in equity-insight-react directory)  
3. Visit `http://localhost:5173`
4. Click "Continue with Google"
5. Complete the OAuth flow

## Troubleshooting

- Make sure both frontend and backend are running
- Check that the redirect URI in Google Cloud Console exactly matches `http://localhost:4000/api/auth/google/callback`
- Ensure CORS is configured properly (already done in server.ts)
- Check browser console for any CORS or network errors