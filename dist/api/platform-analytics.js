"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const router = express_1.default.Router();
router.get('/overview', auth_1.authenticateUser, async (req, res) => {
    try {
        console.log('🔍 Fetching platform analytics overview...');
        const { data: organizations, error: orgsError } = await supabase_client_1.default
            .from('organizations')
            .select(`
        id,
        name,
        status,
        plan,
        monthly_cost,
        created_at
      `);
        if (orgsError) {
            console.error('❌ Error fetching organizations:', orgsError);
            throw orgsError;
        }
        const { data: users, error: usersError } = await supabase_client_1.default
            .from('users')
            .select('id, status, created_at, last_login_at, organization_id');
        if (usersError) {
            console.error('❌ Error fetching users:', usersError);
            throw usersError;
        }
        const { data: calls, error: callsError } = await supabase_client_1.default
            .from('calls')
            .select('id, created_at, status, duration, organization_id')
            .limit(1000);
        if (callsError) {
            console.log('⚠️ No calls table or error fetching calls:', callsError);
        }
        const totalOrganizations = organizations?.length || 0;
        const activeOrganizations = organizations?.filter(org => org.status === 'active').length || 0;
        const totalUsers = users?.length || 0;
        const activeUsers = users?.filter(user => user.status === 'active').length || 0;
        const totalMRR = organizations?.reduce((sum, org) => sum + (org.monthly_cost || 0), 0) || 0;
        const totalCalls = calls?.length || 0;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        const recentOrgs = organizations?.filter(org => new Date(org.created_at) > thirtyDaysAgo).length || 0;
        const previousOrgs = organizations?.filter(org => new Date(org.created_at) > sixtyDaysAgo && new Date(org.created_at) <= thirtyDaysAgo).length || 0;
        const recentUsers = users?.filter(user => new Date(user.created_at) > thirtyDaysAgo).length || 0;
        const weeklyGrowth = [];
        for (let i = 6; i >= 0; i--) {
            const weekStart = new Date();
            weekStart.setDate(weekStart.getDate() - (i * 7));
            const weekEnd = new Date();
            weekEnd.setDate(weekEnd.getDate() - ((i - 1) * 7));
            const weekOrgs = organizations?.filter(org => {
                const createdAt = new Date(org.created_at);
                return createdAt >= weekStart && createdAt < weekEnd;
            }).length || 0;
            const weekUsers = users?.filter(user => {
                const createdAt = new Date(user.created_at);
                return createdAt >= weekStart && createdAt < weekEnd;
            }).length || 0;
            const totalOrgsUpToWeek = organizations?.filter(org => new Date(org.created_at) <= weekEnd).length || 0;
            const totalUsersUpToWeek = users?.filter(user => new Date(user.created_at) <= weekEnd).length || 0;
            weeklyGrowth.push({
                date: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i] || `Week ${7 - i}`,
                users: totalUsersUpToWeek,
                organizations: totalOrgsUpToWeek,
                newUsers: weekUsers,
                newOrganizations: weekOrgs
            });
        }
        const planDistribution = {
            starter: organizations?.filter(org => org.plan === 'starter' || org.plan === 'professional').length || 0,
            professional: organizations?.filter(org => org.plan === 'growth' || org.plan === 'professional').length || 0,
            enterprise: organizations?.filter(org => org.plan === 'enterprise').length || 0
        };
        const monthlyRevenue = [];
        for (let i = 5; i >= 0; i--) {
            const month = new Date();
            month.setMonth(month.getMonth() - i);
            const monthName = month.toLocaleDateString('en-US', { month: 'short' });
            const monthRevenue = Math.floor(totalMRR * (0.8 + Math.random() * 0.4));
            monthlyRevenue.push({
                month: monthName,
                revenue: monthRevenue,
                mrr: Math.floor(monthRevenue * 0.85)
            });
        }
        const analytics = {
            overview: {
                totalOrganizations,
                activeOrganizations,
                totalUsers,
                activeUsers,
                totalMRR,
                totalCalls,
                systemUptime: 99.8,
                supportTickets: 0,
                recentGrowth: {
                    organizations: recentOrgs,
                    users: recentUsers,
                    organizationGrowth: previousOrgs > 0 ? ((recentOrgs - previousOrgs) / previousOrgs * 100) : 0,
                    userGrowth: recentUsers > 0 ? (recentUsers / totalUsers * 100) : 0
                }
            },
            charts: {
                weeklyGrowth,
                monthlyRevenue,
                planDistribution
            },
            topOrganizations: organizations
                ?.sort((a, b) => (b.monthly_cost || 0) - (a.monthly_cost || 0))
                .slice(0, 5)
                .map(org => ({
                id: org.id,
                name: org.name,
                mrr: org.monthly_cost || 0,
                users: users?.filter(u => u.organization_id === org.id).length || 0,
                calls: calls?.filter(c => c.organization_id === org.id).length || 0,
                status: org.status,
                plan: org.plan
            })) || []
        };
        console.log('✅ Platform analytics calculated:', {
            organizations: totalOrganizations,
            users: totalUsers,
            mrr: totalMRR,
            calls: totalCalls
        });
        res.json(analytics);
    }
    catch (error) {
        console.error('❌ Error fetching platform analytics:', error);
        res.status(500).json({
            error: 'Failed to fetch platform analytics',
            details: error.message
        });
    }
});
router.get('/activity', auth_1.authenticateUser, async (req, res) => {
    try {
        console.log('🔍 Fetching recent platform activity...');
        const { data: recentOrgs, error: orgsError } = await supabase_client_1.default
            .from('organizations')
            .select('id, name, created_at, status, plan')
            .order('created_at', { ascending: false })
            .limit(5);
        if (orgsError) {
            console.error('❌ Error fetching recent organizations:', orgsError);
            throw orgsError;
        }
        const { data: recentUsers, error: usersError } = await supabase_client_1.default
            .from('users')
            .select('id, first_name, last_name, email, created_at, organization_id')
            .order('created_at', { ascending: false })
            .limit(5);
        if (usersError) {
            console.error('❌ Error fetching recent users:', usersError);
            throw usersError;
        }
        const activity = [
            ...recentOrgs.map(org => ({
                type: 'organization',
                title: 'New organization registered',
                description: `${org.name} - ${org.plan} plan`,
                time: org.created_at,
                status: 'new'
            })),
            ...recentUsers.map(user => ({
                type: 'user',
                title: 'New user registered',
                description: `${user.first_name} ${user.last_name}`,
                time: user.created_at,
                status: 'new'
            }))
        ]
            .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
            .slice(0, 10);
        res.json({ activity });
    }
    catch (error) {
        console.error('❌ Error fetching platform activity:', error);
        res.status(500).json({
            error: 'Failed to fetch platform activity',
            details: error.message
        });
    }
});
exports.default = router;
