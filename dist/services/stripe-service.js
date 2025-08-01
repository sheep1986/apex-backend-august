"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPaymentMethods = exports.getInvoices = exports.cancelSubscription = exports.getSubscription = exports.createPortalSession = exports.createCheckoutSession = exports.createCustomer = exports.mockPlans = exports.handleWebhook = exports.stripe = exports.isStripeConfigured = void 0;
const stripe_1 = __importDefault(require("stripe"));
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)();
let stripe = null;
exports.stripe = stripe;
let isConfigured = false;
try {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (apiKey && apiKey !== 'dummy' && apiKey.length > 10) {
        exports.stripe = stripe = new stripe_1.default(apiKey, {
            apiVersion: '2024-12-18.acacia',
        });
        isConfigured = true;
        console.log('✅ Stripe initialized successfully');
    }
    else {
        console.log('⚠️  Stripe not configured - using mock mode for development');
        isConfigured = false;
    }
}
catch (error) {
    console.error('❌ Failed to initialize Stripe:', error);
    isConfigured = false;
}
const isStripeConfigured = () => {
    return isConfigured && stripe !== null;
};
exports.isStripeConfigured = isStripeConfigured;
const handleWebhook = async (body, signature) => {
    if (!stripe) {
        throw new Error('Stripe is not configured');
    }
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    if (!endpointSecret) {
        throw new Error('Stripe webhook secret not configured');
    }
    try {
        return stripe.webhooks.constructEvent(body, signature, endpointSecret);
    }
    catch (err) {
        throw new Error(`Webhook Error: ${err.message}`);
    }
};
exports.handleWebhook = handleWebhook;
exports.mockPlans = [
    {
        id: 'starter',
        name: 'Starter',
        description: 'Perfect for small teams getting started',
        price: 29,
        currency: 'usd',
        interval: 'month',
        features: [
            '1,000 monthly calls',
            '3 team members',
            '2 AI assistants',
            '1 phone number',
            '10,000 API calls'
        ]
    },
    {
        id: 'growth',
        name: 'Growth',
        description: 'For growing businesses with higher volume',
        price: 99,
        currency: 'usd',
        interval: 'month',
        features: [
            '5,000 monthly calls',
            '10 team members',
            '5 AI assistants',
            '3 phone numbers',
            '50,000 API calls'
        ]
    },
    {
        id: 'enterprise',
        name: 'Enterprise',
        description: 'For large organizations with custom needs',
        price: 299,
        currency: 'usd',
        interval: 'month',
        features: [
            'Unlimited calls',
            'Unlimited team members',
            'Unlimited AI assistants',
            '10 phone numbers',
            'Unlimited API calls'
        ]
    }
];
const createCustomer = async (customerData) => {
    if (!isConfigured || !stripe) {
        throw new Error('Stripe is not configured');
    }
    return stripe.customers.create({
        email: customerData.email,
        name: customerData.name,
        metadata: {
            organization_id: customerData.organizationId,
            user_id: customerData.userId
        }
    });
};
exports.createCustomer = createCustomer;
const createCheckoutSession = async (sessionData) => {
    if (!isConfigured || !stripe) {
        throw new Error('Stripe is not configured');
    }
    return stripe.checkout.sessions.create({
        customer: sessionData.customerId,
        payment_method_types: ['card'],
        line_items: [
            {
                price: sessionData.priceId,
                quantity: 1,
            },
        ],
        mode: 'subscription',
        success_url: sessionData.successUrl,
        cancel_url: sessionData.cancelUrl,
    });
};
exports.createCheckoutSession = createCheckoutSession;
const createPortalSession = async (customerId, returnUrl) => {
    if (!isConfigured || !stripe) {
        throw new Error('Stripe is not configured');
    }
    return stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
    });
};
exports.createPortalSession = createPortalSession;
const getSubscription = async (subscriptionId) => {
    if (!isConfigured || !stripe) {
        throw new Error('Stripe is not configured');
    }
    return stripe.subscriptions.retrieve(subscriptionId);
};
exports.getSubscription = getSubscription;
const cancelSubscription = async (subscriptionId) => {
    if (!isConfigured || !stripe) {
        throw new Error('Stripe is not configured');
    }
    return stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
    });
};
exports.cancelSubscription = cancelSubscription;
const getInvoices = async (customerId, limit = 10) => {
    if (!isConfigured || !stripe) {
        throw new Error('Stripe is not configured');
    }
    const invoices = await stripe.invoices.list({
        customer: customerId,
        limit,
    });
    return invoices.data;
};
exports.getInvoices = getInvoices;
const getPaymentMethods = async (customerId) => {
    if (!isConfigured || !stripe) {
        throw new Error('Stripe is not configured');
    }
    const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
    });
    return paymentMethods.data;
};
exports.getPaymentMethods = getPaymentMethods;
