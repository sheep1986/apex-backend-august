"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateDevUser = void 0;
const authenticateDevUser = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.substring(7);
    req.user = {
        id: 'dev-user-1',
        email: 'dev@apex.ai',
        role: 'platform_owner',
        organizationId: '550e8400-e29b-41d4-a716-446655440000',
        clerkUserId: 'dev-clerk-id'
    };
    console.log('🔐 Dev auth: Authenticated as', req.user.email);
    next();
};
exports.authenticateDevUser = authenticateDevUser;
