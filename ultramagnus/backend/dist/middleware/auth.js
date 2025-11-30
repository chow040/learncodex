import { verifyToken } from '../utils/tokens.js';
export const requireAuth = (req, res, next) => {
    const accessToken = req.cookies?.access_token;
    if (!accessToken) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const decoded = verifyToken(accessToken);
        if (decoded.type !== 'access')
            throw new Error('Invalid token type');
        req.userId = decoded.sub;
        req.email = decoded.email;
        if (req.log && req.userId) {
            req.log = req.log.child({ userId: req.userId });
        }
        return next();
    }
    catch (err) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
};
