"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const clerk_auth_1 = require("../middleware/clerk-auth");
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const router = express_1.default.Router();
router.get('/', clerk_auth_1.authenticateUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        console.log('🔍 Fetching user profile for User ID:', userId);
        if (req.user && req.user.role && req.user.email) {
            console.log('✅ User profile from middleware:', req.user);
            const userProfile = {
                id: req.user.id,
                email: req.user.email,
                first_name: req.user.firstName || '',
                last_name: req.user.lastName || '',
                role: req.user.role,
                status: 'active',
                organization_id: req.user.organizationId,
                organization_name: 'User Organization'
            };
            return res.json(userProfile);
        }
        const { data: user, error } = await supabase_client_1.default
            .from('users')
            .select(`
        id,
        email,
        first_name,
        last_name,
        role,
        status,
        organization_id,
        organizations!inner(name)
      `)
            .eq('id', userId)
            .single();
        if (error || !user) {
            console.error('❌ User not found in database:', error);
            return res.status(404).json({
                error: 'User not found',
                message: 'Please contact support if this issue persists'
            });
        }
        console.log('✅ User profile found:', user);
        const userProfile = {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role,
            status: user.status,
            organization_id: user.organization_id,
            organization_name: user.organizations?.name || ''
        };
        res.json(userProfile);
    }
    catch (error) {
        console.error('❌ Error fetching user profile:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch user profile'
        });
    }
});
exports.default = router;
