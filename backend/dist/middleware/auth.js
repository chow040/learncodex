import { getUserBySessionId } from '../services/authService.js';
// Middleware to check authentication
export async function requireAuth(req, res, next) {
    try {
        const sessionId = req.cookies?.sessionId;
        if (!sessionId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        const user = await getUserBySessionId(sessionId);
        if (!user) {
            // Clear invalid session cookie
            res.clearCookie('sessionId');
            return res.status(401).json({ error: 'Invalid session' });
        }
        req.user = user;
        next();
    }
    catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ error: 'Authentication error' });
    }
}
// Optional auth - adds user to request if authenticated, but doesn't require it
export async function optionalAuth(req, res, next) {
    try {
        const sessionId = req.cookies?.sessionId;
        if (sessionId) {
            const user = await getUserBySessionId(sessionId);
            if (user) {
                req.user = user;
            }
        }
        next();
    }
    catch (error) {
        console.error('Optional auth middleware error:', error);
        // Continue without authentication on error
        next();
    }
}
//# sourceMappingURL=auth.js.map