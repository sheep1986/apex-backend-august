"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const stripe_1 = __importDefault(require("stripe"));
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const auth_1 = require("../middleware/auth");
const check_limits_1 = require("../middleware/check-limits");
const router = express_1.default.Router();
let stripe = null;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (stripeSecretKey && stripeSecretKey !== 'dummy') {
    try {
        stripe = new stripe_1.default(stripeSecretKey, {
            apiVersion: '2024-10-28.acacia',
        });
        console.log('✅ Stripe initialized successfully');
    }
    catch (error) {
        console.error('❌ Error initializing Stripe:', error);
    }
}
else {
    console.log('⚠️ Stripe not initialized - missing or dummy API key (development mode)');
}
const requireStripe = (req, res, next) => {
    if (!stripe) {
        return res.status(503).json({
            error: 'Billing service unavailable',
            message: 'Stripe is not configured. Please contact support.'
        });
    }
    next();
};
const getMockSubscription = (userId) => ({
    id: 'mock_sub_' + userId,
    plan_id: 'starter',
    plan_name: 'Starter',
    status: 'active',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    cancel_at_period_end: false,
    usage: {
        calls: 250,
        team_members: 2,
        ai_assistants: 1,
        phone_numbers: 1,
        api_calls: 2500
    },
    limits: {
        monthly_calls: 1000,
        team_members: 3,
        ai_assistants: 2,
        phone_numbers: 1,
        api_calls: 10000
    }
});
router.get('/plans', async (req, res) => {
    try {
        const { data: plans, error } = await supabase_client_1.default
            .from('subscription_plans')
            .select('*')
            .eq('is_active', true)
            .order('sort_order');
        if (error)
            throw error;
        res.json({
            success: true,
            plans
        });
    }
    catch (error) {
        console.error('Error fetching plans:', error);
        res.status(500).json({
            error: 'Failed to fetch subscription plans'
        });
    }
});
router.get('/subscription', auth_1.authenticateUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!stripe) {
            return res.json(getMockSubscription(userId));
        }
        const { data: subscription, error } = await supabase_client_1.default
            .from('user_subscriptions')
            .select(`
        *,
        subscription_plans (
          name,
          monthly_calls,
          team_members,
          ai_assistants,
          phone_numbers,
          api_calls
        )
      `)
            .eq('user_id', userId)
            .single();
        if (error || !subscription) {
            return res.json({
                id: null,
                plan_id: 'free',
                plan_name: 'Free',
                status: 'active',
                current_period_start: new Date().toISOString(),
                current_period_end: null,
                cancel_at_period_end: false,
                usage: {
                    calls: 0,
                    team_members: 1,
                    ai_assistants: 0,
                    phone_numbers: 0,
                    api_calls: 0
                },
                limits: {
                    monthly_calls: 100,
                    team_members: 1,
                    ai_assistants: 1,
                    phone_numbers: 0,
                    api_calls: 1000
                }
            });
        }
        const { data: usage } = await supabase_client_1.default
            .from('usage_tracking')
            .select('*')
            .eq('subscription_id', subscription.id)
            .single();
        res.json({
            id: subscription.id,
            plan_id: subscription.plan_id,
            plan_name: subscription.subscription_plans.name,
            status: subscription.status,
            current_period_start: subscription.current_period_start,
            current_period_end: subscription.current_period_end,
            cancel_at_period_end: subscription.cancel_at_period_end,
            usage: {
                calls: usage?.calls_count || 0,
                team_members: usage?.team_members_count || 0,
                ai_assistants: usage?.ai_assistants_count || 0,
                phone_numbers: usage?.phone_numbers_count || 0,
                api_calls: usage?.api_calls_count || 0
            },
            limits: {
                monthly_calls: subscription.subscription_plans.monthly_calls,
                team_members: subscription.subscription_plans.team_members,
                ai_assistants: subscription.subscription_plans.ai_assistants,
                phone_numbers: subscription.subscription_plans.phone_numbers,
                api_calls: subscription.subscription_plans.api_calls
            }
        });
    }
    catch (error) {
        console.error('Error fetching subscription:', error);
        res.status(500).json({ error: 'Failed to fetch subscription' });
    }
});
router.post('/create-checkout-session', auth_1.authenticateUser, async (req, res) => {
    try {
        const { priceId, billingCycle } = req.body;
        const userId = req.user.id;
        const { data: userSub } = await supabase_client_1.default
            .from('user_subscriptions')
            .select('stripe_customer_id')
            .eq('user_id', userId)
            .single();
        let customerId = userSub?.stripe_customer_id;
        if (!customerId) {
            const { data: user } = await supabase_client_1.default
                .from('users')
                .select('email, first_name, last_name, organization_id')
                .eq('id', userId)
                .single();
            if (user) {
                const customer = await stripe?.customers.create({
                    email: user.email,
                    name: `${user.first_name} ${user.last_name}`,
                    organizationId: user.organization_id,
                    userId
                });
                customerId = customer.id;
            }
        }
        const session = await stripe?.checkout.sessions.create({
            customerId,
            priceId,
            successUrl: `${process.env.FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
            cancelUrl: `${process.env.FRONTEND_URL}/billing`
        });
        res.json({
            success: true,
            checkoutUrl: session.url
        });
    }
    catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({
            error: 'Failed to create checkout session'
        });
    }
});
router.post('/create-portal-session', auth_1.authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        const { data: userSub } = await supabase_client_1.default
            .from('user_subscriptions')
            .select('stripe_customer_id')
            .eq('user_id', userId)
            .single();
        if (!userSub?.stripe_customer_id) {
            return res.status(400).json({
                error: 'No billing account found'
            });
        }
        const session = await stripe?.billingPortal.sessions.create({
            customerId: userSub.stripe_customer_id,
            returnUrl: `${process.env.FRONTEND_URL}/billing`
        });
        res.json({
            success: true,
            portalUrl: session.url
        });
    }
    catch (error) {
        console.error('Error creating portal session:', error);
        res.status(500).json({
            error: 'Failed to create billing portal session'
        });
    }
});
router.post('/update-subscription', auth_1.authenticateUser, async (req, res) => {
    try {
        const { planId } = req.body;
        const userId = req.user.id;
        const { data: userSub } = await supabase_client_1.default
            .from('user_subscriptions')
            .select('stripe_subscription_id')
            .eq('user_id', userId)
            .single();
        if (!userSub?.stripe_subscription_id) {
            return res.status(400).json({
                error: 'No active subscription found'
            });
        }
        const { data: plan } = await supabase_client_1.default
            .from('subscription_plans')
            .select('stripe_price_id_monthly, stripe_price_id_yearly')
            .eq('id', planId)
            .single();
        if (!plan) {
            return res.status(400).json({
                error: 'Invalid plan selected'
            });
        }
        const updatedSubscription = await stripe?.subscriptions.update(userSub.stripe_subscription_id, {
            items: [{ price: plan.stripe_price_id_monthly }],
        });
        res.json({
            success: true,
            subscription: updatedSubscription
        });
    }
    catch (error) {
        console.error('Error updating subscription:', error);
        res.status(500).json({
            error: 'Failed to update subscription'
        });
    }
});
router.post('/cancel-subscription', auth_1.authenticateUser, async (req, res) => {
    try {
        const { immediately = false } = req.body;
        const userId = req.user.id;
        const { data: userSub } = await supabase_client_1.default
            .from('user_subscriptions')
            .select('stripe_subscription_id')
            .eq('user_id', userId)
            .single();
        if (!userSub?.stripe_subscription_id) {
            return res.status(400).json({
                error: 'No active subscription found'
            });
        }
        const canceledSubscription = await stripe?.subscriptions.del(userSub.stripe_subscription_id);
        res.json({
            success: true,
            subscription: canceledSubscription,
            message: immediately
                ? 'Subscription canceled immediately'
                : 'Subscription will be canceled at the end of the billing period'
        });
    }
    catch (error) {
        console.error('Error canceling subscription:', error);
        res.status(500).json({
            error: 'Failed to cancel subscription'
        });
    }
});
router.get('/usage', auth_1.authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        const { data: user } = await supabase_client_1.default
            .from('users')
            .select('organization_id')
            .eq('id', userId)
            .single();
        if (!user) {
            return res.status(404).json({
                error: 'User not found'
            });
        }
        const currentMonth = new Date().toISOString().slice(0, 7);
        const { data: usage } = await supabase_client_1.default
            .from('usage_records')
            .select('resource_type, quantity, total_cost')
            .eq('organization_id', user.organization_id)
            .eq('billing_period', currentMonth);
        const { data: subscription } = await supabase_client_1.default
            .from('user_subscriptions')
            .select(`
        current_month_calls,
        subscription_plans (
          max_calls_per_month,
          max_users,
          max_campaigns,
          max_ai_assistants,
          max_phone_numbers
        )
      `)
            .eq('user_id', userId)
            .single();
        res.json({
            success: true,
            usage: {
                calls: {
                    used: subscription?.current_month_calls || 0,
                    limit: subscription?.subscription_plans?.max_calls_per_month || 0,
                    percentage: subscription?.subscription_plans?.max_calls_per_month
                        ? Math.round((subscription.current_month_calls / subscription.subscription_plans.max_calls_per_month) * 100)
                        : 0
                },
            },
            details: usage || []
        });
    }
    catch (error) {
        console.error('Error fetching usage:', error);
        res.status(500).json({
            error: 'Failed to fetch usage statistics'
        });
    }
});
router.post('/upgrade', auth_1.authenticateUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        const userEmail = req.user?.email;
        const { plan_id } = req.body;
        if (!userId || !userEmail) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!stripe) {
            return res.status(503).json({
                error: 'Billing system is not configured',
                message: 'Please contact support to upgrade your subscription'
            });
        }
        const session = await stripe.checkout.sessions.create({
            customerId: userId,
            line_items: [{ price: plan_id, quantity: 1 }],
            mode: 'payment',
            success_url: `${process.env.FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/billing`,
            customerEmail: userEmail
        });
        res.json({ checkout_url: session.url });
    }
    catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});
router.post('/cancel', auth_1.authenticateUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!stripe) {
            return res.status(503).json({
                error: 'Billing system is not configured',
                message: 'Please contact support to cancel your subscription'
            });
        }
        const { data: subscription, error } = await supabase_client_1.default
            .from('user_subscriptions')
            .select('stripe_subscription_id')
            .eq('user_id', userId)
            .single();
        if (error || !subscription?.stripe_subscription_id) {
            return res.status(404).json({ error: 'No active subscription found' });
        }
        await stripe.subscriptions.del(subscription.stripe_subscription_id);
        res.json({ message: 'Subscription cancelled successfully' });
    }
    catch (error) {
        console.error('Error cancelling subscription:', error);
        res.status(500).json({ error: 'Failed to cancel subscription' });
    }
});
router.get('/payment-methods', auth_1.authenticateUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!stripe) {
            return res.json([]);
        }
        const { data: subscription, error } = await supabase_client_1.default
            .from('user_subscriptions')
            .select('stripe_customer_id')
            .eq('user_id', userId)
            .single();
        if (error || !subscription?.stripe_customer_id) {
            return res.json([]);
        }
        const paymentMethods = await stripe.customers.listPaymentMethods(subscription.stripe_customer_id);
        res.json(paymentMethods.data.map(pm => ({
            id: pm.id,
            type: pm.type,
            last4: pm.card?.last4,
            brand: pm.card?.brand,
            exp_month: pm.card?.exp_month,
            exp_year: pm.card?.exp_year,
            is_default: pm.id === pm.metadata?.default
        })));
    }
    catch (error) {
        console.error('Error fetching payment methods:', error);
        res.status(500).json({ error: 'Failed to fetch payment methods' });
    }
});
router.post('/payment-method/setup', auth_1.authenticateUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!stripe) {
            return res.status(503).json({
                error: 'Billing system is not configured',
                message: 'Please contact support to add a payment method'
            });
        }
        const { data: subscription } = await supabase_client_1.default
            .from('user_subscriptions')
            .select('stripe_customer_id')
            .eq('user_id', userId)
            .single();
        if (!subscription?.stripe_customer_id) {
            return res.status(404).json({ error: 'No customer found' });
        }
        const setupIntent = await stripe.setupIntents.create({
            customer: subscription.stripe_customer_id,
            usage: 'off_session',
        });
        res.json({
            client_secret: setupIntent.client_secret,
            setup_url: `${process.env.FRONTEND_URL}/billing/setup?setup_intent=${setupIntent.client_secret}`
        });
    }
    catch (error) {
        console.error('Error creating setup intent:', error);
        res.status(500).json({ error: 'Failed to create setup intent' });
    }
});
router.delete('/payment-method/:id', auth_1.authenticateUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        const { id: paymentMethodId } = req.params;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!stripe) {
            return res.status(503).json({
                error: 'Billing system is not configured'
            });
        }
        await stripe.paymentMethods.detach(paymentMethodId);
        res.json({ message: 'Payment method removed' });
    }
    catch (error) {
        console.error('Error removing payment method:', error);
        res.status(500).json({ error: 'Failed to remove payment method' });
    }
});
router.post('/payment-method/:id/default', auth_1.authenticateUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        const { id: paymentMethodId } = req.params;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!stripe) {
            return res.status(503).json({
                error: 'Billing system is not configured'
            });
        }
        const { data: subscription } = await supabase_client_1.default
            .from('user_subscriptions')
            .select('stripe_customer_id')
            .eq('user_id', userId)
            .single();
        if (!subscription?.stripe_customer_id) {
            return res.status(404).json({ error: 'No customer found' });
        }
        await stripe.customers.update(subscription.stripe_customer_id, {
            invoice_settings: {
                default_payment_method: paymentMethodId,
            },
        });
        res.json({ message: 'Default payment method updated' });
    }
    catch (error) {
        console.error('Error setting default payment method:', error);
        res.status(500).json({ error: 'Failed to set default payment method' });
    }
});
router.get('/history', auth_1.authenticateUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!stripe) {
            return res.json([
                {
                    id: 'mock_inv_1',
                    date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                    amount: 99,
                    status: 'paid',
                    description: 'Starter Plan - Monthly',
                    invoice_url: null
                }
            ]);
        }
        const { data: history, error } = await supabase_client_1.default
            .from('billing_history')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) {
            throw error;
        }
        res.json(history || []);
    }
    catch (error) {
        console.error('Error fetching billing history:', error);
        res.status(500).json({ error: 'Failed to fetch billing history' });
    }
});
router.post('/portal', auth_1.authenticateUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!stripe) {
            return res.status(503).json({
                error: 'Billing system is not configured',
                message: 'Please contact support for billing assistance'
            });
        }
        const { data: subscription } = await supabase_client_1.default
            .from('user_subscriptions')
            .select('stripe_customer_id')
            .eq('user_id', userId)
            .single();
        if (!subscription?.stripe_customer_id) {
            return res.status(404).json({ error: 'No customer found' });
        }
        const session = await stripe.billingPortal.sessions.create({
            customerId: subscription.stripe_customer_id,
            returnUrl: `${process.env.FRONTEND_URL}/billing`
        });
        res.json({ portal_url: session.url });
    }
    catch (error) {
        console.error('Error creating billing portal session:', error);
        res.status(500).json({ error: 'Failed to create billing portal session' });
    }
});
router.post('/check-limits', check_limits_1.checkSubscriptionLimit, (req, res) => {
    res.json({ allowed: true });
});
exports.default = router;
