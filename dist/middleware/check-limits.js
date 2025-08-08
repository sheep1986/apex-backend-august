"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetMonthlyUsage = exports.requireFeature = exports.checkSubscriptionLimit = void 0;
const supabase_client_1 = require("../services/supabase-client");
const checkSubscriptionLimit = (options) => {
    return async (req, res, next) => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            const { data: user } = await supabase_client_1.supabase
                .from('users')
                .select('organization_id')
                .eq('id', userId)
                .single();
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            const { data: limitCheck } = await supabase_client_1.supabase
                .rpc('check_usage_limit', {
                p_organization_id: user.organization_id,
                p_resource_type: options.resource
            })
                .single();
            if (!limitCheck) {
                return res.status(500).json({ error: 'Failed to check limits' });
            }
            if (!limitCheck.is_within_limit) {
                return res.status(403).json({
                    error: 'Subscription limit reached',
                    message: `You have reached your ${options.resource} limit`,
                    usage: {
                        current: limitCheck.current_usage,
                        limit: limitCheck.limit_amount,
                        percentage: limitCheck.percentage_used
                    },
                    upgrade_url: '/billing'
                });
            }
            if (options.increment && options.resource === 'calls') {
                await supabase_client_1.supabase
                    .from('user_subscriptions')
                    .update({
                    current_month_calls: limitCheck.current_usage + options.increment
                })
                    .eq('organization_id', user.organization_id);
                await supabase_client_1.supabase
                    .from('usage_records')
                    .insert({
                    organization_id: user.organization_id,
                    resource_type: 'calls',
                    quantity: options.increment,
                    billing_period: new Date().toISOString().slice(0, 7)
                });
            }
            req.usageInfo = {
                current: limitCheck.current_usage,
                limit: limitCheck.limit_amount,
                percentage: limitCheck.percentage_used
            };
            next();
        }
        catch (error) {
            console.error('Error checking limits:', error);
            res.status(500).json({ error: 'Failed to check subscription limits' });
        }
    };
};
exports.checkSubscriptionLimit = checkSubscriptionLimit;
const requireFeature = (featureName) => {
    return async (req, res, next) => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            const { data: hasAccess } = await supabase_client_1.supabase
                .rpc('has_feature_access', {
                p_user_id: userId,
                p_feature_name: featureName
            })
                .single();
            if (!hasAccess) {
                return res.status(403).json({
                    error: 'Feature not available',
                    message: `Your subscription plan does not include ${featureName.replace(/_/g, ' ')}`,
                    upgrade_url: '/billing'
                });
            }
            next();
        }
        catch (error) {
            console.error('Error checking feature access:', error);
            res.status(500).json({ error: 'Failed to check feature access' });
        }
    };
};
exports.requireFeature = requireFeature;
const resetMonthlyUsage = async () => {
    try {
        const { error } = await supabase_client_1.supabase
            .from('user_subscriptions')
            .update({ current_month_calls: 0 })
            .eq('status', 'active');
        if (error)
            throw error;
        console.log('Monthly usage reset completed');
    }
    catch (error) {
        console.error('Error resetting monthly usage:', error);
    }
};
exports.resetMonthlyUsage = resetMonthlyUsage;
