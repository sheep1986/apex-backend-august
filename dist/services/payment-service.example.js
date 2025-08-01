"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentService = void 0;
const api_config_manager_1 = require("./api-config-manager");
const supabase_client_1 = __importDefault(require("./supabase-client"));
class PaymentService {
    async processPayment(userId, amount, currency = 'usd') {
        try {
            const apiManager = await (0, api_config_manager_1.getAPIConfigManager)(userId);
            const stripe = apiManager.getStripe();
            if (!stripe) {
                throw new Error('Stripe not configured. Please configure Stripe API in Settings.');
            }
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount * 100,
                currency,
                metadata: {
                    userId,
                    platform: 'apex-ai'
                }
            });
            const { data, error } = await supabase_client_1.default
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
            if (error)
                throw error;
            return {
                clientSecret: paymentIntent.client_secret,
                paymentId: data.id
            };
        }
        catch (error) {
            console.error('Payment processing error:', error);
            throw error;
        }
    }
    async getPaymentHistory(userId) {
        const { data, error } = await supabase_client_1.default
            .from('payments')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        return data;
    }
    async syncToClientDatabase(userId, paymentData) {
        const apiManager = await (0, api_config_manager_1.getAPIConfigManager)(userId);
        const clientSupabase = apiManager.getExternalSupabase();
        if (clientSupabase) {
            await clientSupabase
                .from('external_payments')
                .insert(paymentData);
        }
    }
}
exports.PaymentService = PaymentService;
