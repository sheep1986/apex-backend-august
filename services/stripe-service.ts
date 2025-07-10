import Stripe from 'stripe';
import { supabase } from './supabase-client';
import { config } from 'dotenv';

config();

// Initialize Stripe only if API key is available
let stripe: Stripe | null = null;
let isConfigured = false;

try {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (apiKey && apiKey !== 'dummy' && apiKey.length > 10) {
    stripe = new Stripe(apiKey, {
      apiVersion: '2024-12-18.acacia',
    });
    isConfigured = true;
    console.log('✅ Stripe initialized successfully');
  } else {
    console.log('⚠️  Stripe not configured - using mock mode for development');
    isConfigured = false;
  }
} catch (error) {
  console.error('❌ Failed to initialize Stripe:', error);
  isConfigured = false;
}

export const isStripeConfigured = (): boolean => {
  return isConfigured && stripe !== null;
};

// Export stripe instance for direct access when needed
export { stripe };

// Handle webhook verification
export const handleWebhook = async (body: any, signature: string): Promise<Stripe.Event> => {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!endpointSecret) {
    throw new Error('Stripe webhook secret not configured');
  }

  try {
    return stripe.webhooks.constructEvent(body, signature, endpointSecret);
  } catch (err: any) {
    throw new Error(`Webhook Error: ${err.message}`);
  }
};

// Mock data for development when Stripe is not configured
export const mockPlans = [
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

export const createCustomer = async (customerData: {
  email: string;
  name: string;
  organizationId: string;
  userId: string;
}): Promise<Stripe.Customer> => {
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

export const createCheckoutSession = async (sessionData: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> => {
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

export const createPortalSession = async (customerId: string, returnUrl: string): Promise<Stripe.BillingPortal.Session> => {
  if (!isConfigured || !stripe) {
    throw new Error('Stripe is not configured');
  }

  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
};

export const getSubscription = async (subscriptionId: string): Promise<Stripe.Subscription> => {
  if (!isConfigured || !stripe) {
    throw new Error('Stripe is not configured');
  }

  return stripe.subscriptions.retrieve(subscriptionId);
};

export const cancelSubscription = async (subscriptionId: string): Promise<Stripe.Subscription> => {
  if (!isConfigured || !stripe) {
    throw new Error('Stripe is not configured');
  }

  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
};

export const getInvoices = async (customerId: string, limit: number = 10): Promise<Stripe.Invoice[]> => {
  if (!isConfigured || !stripe) {
    throw new Error('Stripe is not configured');
  }

  const invoices = await stripe.invoices.list({
    customer: customerId,
    limit,
  });

  return invoices.data;
};

export const getPaymentMethods = async (customerId: string): Promise<Stripe.PaymentMethod[]> => {
  if (!isConfigured || !stripe) {
    throw new Error('Stripe is not configured');
  }

  const paymentMethods = await stripe.paymentMethods.list({
    customer: customerId,
    type: 'card',
  });

  return paymentMethods.data;
}; 