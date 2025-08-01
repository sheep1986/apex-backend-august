import { getAPIConfigManager } from './api-config-manager';
import supabase from './supabase-client'; // Core database - uses env vars

// Example service showing proper API configuration usage
export class PaymentService {
  // Process a payment using stored Stripe configuration
  async processPayment(userId: string, amount: number, currency: string = 'usd') {
    try {
      // Get the API manager for this user
      const apiManager = await getAPIConfigManager(userId);
      
      // Get Stripe instance (uses stored encrypted config)
      const stripe = apiManager.getStripe();
      
      if (!stripe) {
        throw new Error('Stripe not configured. Please configure Stripe API in Settings.');
      }

      // Create payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100, // Convert to cents
        currency,
        metadata: {
          userId,
          platform: 'apex-ai'
        }
      });

      // Store payment record in main database (uses env var connection)
      const { data, error } = await supabase
        .from('payments')
        .insert({
          user_id: userId,
          stripe_payment_intent_id: paymentIntent.id,
          amount,
          currency,
          status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;

      return {
        clientSecret: paymentIntent.client_secret,
        paymentId: data.id
      };

    } catch (error) {
      console.error('Payment processing error:', error);
      throw error;
    }
  }

  // Get payment history from database
  async getPaymentHistory(userId: string) {
    // This uses the core database connection (env vars)
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  // Example: Multi-tenant scenario where client has their own Supabase
  async syncToClientDatabase(userId: string, paymentData: any) {
    const apiManager = await getAPIConfigManager(userId);
    
    // Get external Supabase instance (client's database)
    const clientSupabase = apiManager.getExternalSupabase();
    
    if (clientSupabase) {
      // This writes to the CLIENT's Supabase, not ours
      await clientSupabase
        .from('external_payments')
        .insert(paymentData);
    }
  }
}

// Usage example:
/*
const paymentService = new PaymentService();

// Process payment (uses stored Stripe config)
const result = await paymentService.processPayment(
  'user-123',
  99.99
);

// Get history (uses core database)
const history = await paymentService.getPaymentHistory('user-123');

// Sync to client's database (uses stored external Supabase config)
await paymentService.syncToClientDatabase('user-123', paymentData);
*/