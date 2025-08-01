"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockWebhookService = void 0;
const supabase_client_1 = require("./supabase-client");
class MockWebhookService {
    constructor() {
        this.activeSimulations = new Map();
    }
    static getInstance() {
        if (!MockWebhookService.instance) {
            MockWebhookService.instance = new MockWebhookService();
        }
        return MockWebhookService.instance;
    }
    async simulateCallProgression(vapiCallId, organizationId) {
        if (!vapiCallId.startsWith('mock-call-')) {
            console.log('⚠️ Not a mock call, skipping simulation');
            return;
        }
        console.log(`🎭 Starting mock call simulation for: ${vapiCallId}`);
        if (this.activeSimulations.has(vapiCallId)) {
            clearTimeout(this.activeSimulations.get(vapiCallId));
            this.activeSimulations.delete(vapiCallId);
        }
        const stages = [
            {
                delay: 2000,
                status: 'ringing',
                updates: { status: 'ringing', started_at: new Date().toISOString() }
            },
            {
                delay: 8000,
                status: 'answered',
                updates: { status: 'in-progress', answered_at: new Date().toISOString() }
            },
            {
                delay: 45000,
                status: 'completed',
                updates: {
                    status: 'completed',
                    ended_at: new Date().toISOString(),
                    duration: Math.floor(Math.random() * 120) + 30,
                    cost: Math.round((Math.random() * 0.5 + 0.1) * 100) / 100,
                    transcript: this.generateMockTranscript(),
                    summary: this.generateMockSummary(),
                    sentiment: this.getRandomSentiment()
                }
            }
        ];
        stages.forEach((stage, index) => {
            const timeout = setTimeout(async () => {
                try {
                    await this.updateCallStatus(vapiCallId, stage.updates);
                    console.log(`🎭 Mock call ${vapiCallId} progressed to: ${stage.status}`);
                    if (index === stages.length - 1) {
                        this.activeSimulations.delete(vapiCallId);
                        await this.updateCampaignMetrics(vapiCallId);
                        console.log(`✅ Mock call ${vapiCallId} simulation completed`);
                    }
                }
                catch (error) {
                    console.error(`❌ Error in mock call simulation for ${vapiCallId}:`, error);
                    this.activeSimulations.delete(vapiCallId);
                }
            }, stage.delay);
            this.activeSimulations.set(vapiCallId, timeout);
        });
    }
    async updateCallStatus(vapiCallId, updates) {
        const { error } = await supabase_client_1.supabaseService
            .from('calls')
            .update({
            ...updates,
            updated_at: new Date().toISOString()
        })
            .eq('vapi_call_id', vapiCallId);
        if (error) {
            console.error('❌ Error updating mock call status:', error);
            throw error;
        }
        if (updates.status === 'completed') {
            const { data: call } = await supabase_client_1.supabaseService
                .from('calls')
                .select('lead_id')
                .eq('vapi_call_id', vapiCallId)
                .single();
            if (call?.lead_id) {
                await supabase_client_1.supabaseService
                    .from('leads')
                    .update({
                    call_status: 'completed',
                    last_call_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                    .eq('id', call.lead_id);
            }
        }
    }
    async updateCampaignMetrics(vapiCallId) {
        try {
            const { data: call } = await supabase_client_1.supabaseService
                .from('calls')
                .select('campaign_id, duration, cost, status')
                .eq('vapi_call_id', vapiCallId)
                .single();
            if (!call?.campaign_id)
                return;
            const { data: allCalls } = await supabase_client_1.supabaseService
                .from('calls')
                .select('duration, cost, status')
                .eq('campaign_id', call.campaign_id);
            const totalCalls = allCalls?.length || 0;
            const successfulCalls = allCalls?.filter(c => c.status === 'completed' && c.duration > 30).length || 0;
            const totalDuration = allCalls?.reduce((sum, c) => sum + (c.duration || 0), 0) || 0;
            const totalCost = allCalls?.reduce((sum, c) => sum + (c.cost || 0), 0) || 0;
            await supabase_client_1.supabaseService
                .from('campaigns')
                .update({
                total_calls: totalCalls,
                successful_calls: successfulCalls,
                total_duration: totalDuration,
                total_cost: totalCost,
                updated_at: new Date().toISOString()
            })
                .eq('id', call.campaign_id);
            console.log(`✅ Campaign metrics updated for: ${call.campaign_id}`);
        }
        catch (error) {
            console.error('❌ Error updating campaign metrics:', error);
        }
    }
    generateMockTranscript() {
        const transcripts = [
            `Assistant: Hello, this is Alex from Emerald Green Energy. I'm calling about solar energy solutions for your home. Is this a good time to chat?\n\nCustomer: Oh, solar panels? I've been thinking about that actually. Tell me more.\n\nAssistant: Great! We're helping homeowners in your area reduce their energy bills by up to 80% with solar. Can you tell me about your current monthly electric bill?\n\nCustomer: It's around $200 a month, sometimes more in summer.\n\nAssistant: That's perfect for solar! With a system sized for your usage, you could save about $160 per month. Would you like to schedule a free consultation to see your exact savings potential?\n\nCustomer: Yes, that sounds interesting. What's the next step?\n\nAssistant: Excellent! I'll have our local specialist contact you within 24 hours to schedule your free assessment. Thank you for your time!`,
            `Assistant: Hi, this is Sarah from Emerald Green Energy. I'm calling about solar energy options for your property. Do you have a minute?\n\nCustomer: I'm not really interested in solar right now.\n\nAssistant: I understand. Many homeowners feel that way initially. Can I ask what your main concern is about solar?\n\nCustomer: I heard it's really expensive and takes forever to pay back.\n\nAssistant: That's a common misconception! With current incentives, most homeowners see payback in 6-8 years, and systems last 25+ years. Would you be interested in a quick, no-obligation assessment to see your specific numbers?\n\nCustomer: Maybe... but I'd need to talk to my spouse first.\n\nAssistant: Absolutely! I'll send you some information by email, and you can review it together. What's the best email address?\n\nCustomer: It's john.smith@email.com\n\nAssistant: Perfect! You'll receive the information within an hour. Have a great day!`,
            `Assistant: Hello, this is Mike from Emerald Green Energy. We're offering free solar consultations in your area. Is this the homeowner?\n\nCustomer: Yes, but I'm not interested. Please take me off your list.\n\nAssistant: I understand. Before I do that, can I ask if you're aware of the new federal tax credits for solar installations?\n\nCustomer: No, I'm really not interested. Please don't call again.\n\nAssistant: Of course, I respect that. I'll make sure you're removed from our calling list. Have a good day.\n\nCustomer: Thank you.`
        ];
        return transcripts[Math.floor(Math.random() * transcripts.length)];
    }
    generateMockSummary() {
        const summaries = [
            "Customer showed strong interest in solar energy solutions. Currently paying $200/month for electricity. Interested in free consultation to explore potential savings of $160/month. Follow-up scheduled within 24 hours.",
            "Customer initially hesitant about solar due to cost concerns. Provided information about current incentives and payback periods. Customer requested information to review with spouse. Email sent to john.smith@email.com for follow-up.",
            "Customer not interested in solar solutions. Requested to be removed from calling list. Maintained professional interaction and respected customer's wishes. No further contact planned."
        ];
        return summaries[Math.floor(Math.random() * summaries.length)];
    }
    getRandomSentiment() {
        const sentiments = ['positive', 'neutral', 'negative'];
        const weights = [0.3, 0.5, 0.2];
        const random = Math.random();
        let cumulative = 0;
        for (let i = 0; i < sentiments.length; i++) {
            cumulative += weights[i];
            if (random < cumulative) {
                return sentiments[i];
            }
        }
        return 'neutral';
    }
    stopSimulation(vapiCallId) {
        if (this.activeSimulations.has(vapiCallId)) {
            clearTimeout(this.activeSimulations.get(vapiCallId));
            this.activeSimulations.delete(vapiCallId);
            console.log(`🛑 Mock call simulation stopped for: ${vapiCallId}`);
        }
    }
    stopAllSimulations() {
        this.activeSimulations.forEach((timeout, vapiCallId) => {
            clearTimeout(timeout);
            console.log(`🛑 Mock call simulation stopped for: ${vapiCallId}`);
        });
        this.activeSimulations.clear();
    }
    getActiveSimulationCount() {
        return this.activeSimulations.size;
    }
}
exports.MockWebhookService = MockWebhookService;
MockWebhookService.instance = null;
