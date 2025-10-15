#!/bin/bash

echo "🚀 Starting LearnCodex Development Environment..."
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the learncodex root directory"
    exit 1
fi

echo "📋 Available testing options:"
echo ""
echo "1. Quick Test (Mock Authentication)"
echo "   - No Google OAuth setup needed"
echo "   - Uses mock login for immediate testing"
echo "   - Good for UI/UX testing"
echo ""
echo "2. Full OAuth Test (Real Google Authentication)"
echo "   - Requires Google OAuth setup (see docs/google-oauth-setup.md)"
echo "   - Tests complete authentication flow"
echo "   - Production-ready implementation"
echo ""

read -p "Choose option (1 or 2): " choice

if [ "$choice" = "1" ]; then
    echo ""
    echo "🔧 Setting up Mock Authentication..."
    echo "✅ Mock authentication is already configured!"
    echo ""
    echo "📖 How to test:"
    echo "1. Start backend: cd backend && npm run dev"
    echo "2. Start frontend: cd equity-insight-react && npm run dev" 
    echo "3. Visit http://localhost:5173"
    echo "4. Click 'Mock Login (Dev Only)' button"
    echo "5. You should be logged in as Test User"
    echo ""
elif [ "$choice" = "2" ]; then
    echo ""
    echo "🔧 Setting up Google OAuth..."
    echo ""
    echo "📋 Required steps:"
    echo "1. Set up Google OAuth app (see docs/google-oauth-setup.md)"
    echo "2. Update backend/.env with your credentials:"
    echo "   GOOGLE_CLIENT_ID=your_client_id"
    echo "   GOOGLE_CLIENT_SECRET=your_client_secret"
    echo "3. Start both servers"
    echo "4. Test the full OAuth flow"
    echo ""
    echo "📖 Opening setup documentation..."
    
    # Try to open the documentation
    if command -v code &> /dev/null; then
        code docs/google-oauth-setup.md
    elif command -v gedit &> /dev/null; then
        gedit docs/google-oauth-setup.md &
    else
        echo "Please manually open: docs/google-oauth-setup.md"
    fi
else
    echo "❌ Invalid choice. Please run the script again."
    exit 1
fi

echo ""
echo "🎯 Ready to start development!"
echo "Remember to run both servers in separate terminals:"
echo "- Backend: cd backend && npm run dev"
echo "- Frontend: cd equity-insight-react && npm run dev"