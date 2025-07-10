import { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/supabase-client';

export interface LimitCheckOptions {
  resource: 'calls' | 'users' | 'campaigns' | 'ai_assistants' | 'phone_numbers';
  increment?: number;
}

// Middleware to check subscription limits
export const checkSubscriptionLimit = (options: LimitCheckOptions) => {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Get user's organization
      const { data: user } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', userId)
        .single();

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check usage limits
      const { data: limitCheck } = await supabase
        .rpc('check_usage_limit', {
          p_organization_id: user.organization_id,
          p_resource_type: options.resource
        })
        .single();

      if (!limitCheck) {
        return res.status(500).json({ error: 'Failed to check limits' });
      }

      // Check if within limits
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

      // If increment specified, update usage
      if (options.increment && options.resource === 'calls') {
        await supabase
          .from('user_subscriptions')
          .update({ 
            current_month_calls: limitCheck.current_usage + options.increment 
          })
          .eq('organization_id', user.organization_id);

        // Also record in usage_records
        await supabase
          .from('usage_records')
          .insert({
            organization_id: user.organization_id,
            resource_type: 'calls',
            quantity: options.increment,
            billing_period: new Date().toISOString().slice(0, 7)
          });
      }

      // Add usage info to request
      req.usageInfo = {
        current: limitCheck.current_usage,
        limit: limitCheck.limit_amount,
        percentage: limitCheck.percentage_used
      };

      next();
    } catch (error) {
      console.error('Error checking limits:', error);
      res.status(500).json({ error: 'Failed to check subscription limits' });
    }
  };
};

// Middleware to check feature access
export const requireFeature = (featureName: string) => {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Check feature access
      const { data: hasAccess } = await supabase
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
    } catch (error) {
      console.error('Error checking feature access:', error);
      res.status(500).json({ error: 'Failed to check feature access' });
    }
  };
};

// Reset monthly usage (run via cron job)
export const resetMonthlyUsage = async () => {
  try {
    const { error } = await supabase
      .from('user_subscriptions')
      .update({ current_month_calls: 0 })
      .eq('status', 'active');

    if (error) throw error;

    console.log('Monthly usage reset completed');
  } catch (error) {
    console.error('Error resetting monthly usage:', error);
  }
}; 