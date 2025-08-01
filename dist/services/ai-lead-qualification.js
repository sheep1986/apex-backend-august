"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AILeadQualificationService = void 0;
const supabase_client_1 = __importDefault(require("./supabase-client"));
class AILeadQualificationService {
    static async processCallQualification(call) {
        let aiConfidenceScore = call.ai_confidence_score;
        if (!aiConfidenceScore) {
            aiConfidenceScore = this.calculateConfidenceScore(call);
        }
        const aiRecommendation = this.determineRecommendation(aiConfidenceScore, call);
        let qualificationStatus = 'pending';
        if (aiConfidenceScore >= 0.9 && aiRecommendation === 'accept') {
            qualificationStatus = 'auto_accepted';
        }
        else if (aiConfidenceScore < 0.3 && aiRecommendation === 'decline') {
            qualificationStatus = 'auto_declined';
        }
        else {
            qualificationStatus = 'pending';
        }
        const { error } = await supabase_client_1.default
            .from('calls')
            .update({
            ai_confidence_score: aiConfidenceScore,
            ai_recommendation: aiRecommendation,
            qualification_status: qualificationStatus,
            updated_at: new Date().toISOString()
        })
            .eq('id', call.id);
        if (error) {
            console.error('❌ Error updating call qualification:', error);
            throw error;
        }
        console.log(`✅ Call ${call.id} qualified: ${qualificationStatus} (${Math.round(aiConfidenceScore * 100)}% confidence)`);
        if (qualificationStatus === 'auto_accepted') {
            await this.createCRMContact(call);
        }
        return {
            aiConfidenceScore,
            aiRecommendation,
            qualificationStatus
        };
    }
    static calculateConfidenceScore(call) {
        let score = 0.5;
        if (call.duration) {
            if (call.duration > 180)
                score += 0.2;
            else if (call.duration > 120)
                score += 0.15;
            else if (call.duration > 60)
                score += 0.1;
            else if (call.duration < 30)
                score -= 0.2;
        }
        if (call.outcome === 'answered' || call.outcome === 'completed') {
            score += 0.1;
        }
        else if (call.outcome === 'voicemail' || call.outcome === 'no_answer') {
            score -= 0.3;
        }
        if (call.sentiment) {
            const sentimentLower = call.sentiment.toLowerCase();
            if (sentimentLower.includes('positive') || sentimentLower.includes('interested')) {
                score += 0.2;
            }
            else if (sentimentLower.includes('negative') || sentimentLower.includes('not interested')) {
                score -= 0.3;
            }
        }
        if (call.summary) {
            const summaryLower = call.summary.toLowerCase();
            if (summaryLower.includes('interested'))
                score += 0.15;
            if (summaryLower.includes('budget'))
                score += 0.1;
            if (summaryLower.includes('timeline'))
                score += 0.1;
            if (summaryLower.includes('decision maker'))
                score += 0.15;
            if (summaryLower.includes('follow up') || summaryLower.includes('callback'))
                score += 0.1;
            if (summaryLower.includes('not interested'))
                score -= 0.3;
            if (summaryLower.includes('no budget'))
                score -= 0.2;
            if (summaryLower.includes('already has'))
                score -= 0.15;
            if (summaryLower.includes('do not call'))
                score -= 0.5;
        }
        if (call.buying_signals && call.buying_signals.length > 10) {
            score += 0.2;
        }
        return Math.max(0, Math.min(1, score));
    }
    static determineRecommendation(score, call) {
        if (score >= 0.8) {
            return 'accept';
        }
        if (score < 0.4) {
            if (call.buying_signals && call.buying_signals.length > 0) {
                return 'review';
            }
            return 'decline';
        }
        return 'review';
    }
    static async createCRMContact(call) {
        try {
            const { data: existingContact } = await supabase_client_1.default
                .from('leads')
                .select('id')
                .eq('phone', call.phone_number)
                .eq('organization_id', call.organization_id)
                .single();
            if (existingContact) {
                await supabase_client_1.default
                    .from('leads')
                    .update({
                    qualification_status: 'qualified',
                    call_status: call.outcome || 'completed',
                    last_call_at: call.started_at,
                    score: Math.round((call.ai_confidence_score || 0) * 100),
                    custom_fields: {
                        auto_qualified: true,
                        ai_confidence_score: call.ai_confidence_score,
                        qualification_date: new Date().toISOString()
                    }
                })
                    .eq('id', existingContact.id);
            }
            else {
                const nameParts = call.customer_name?.split(' ') || ['Unknown'];
                await supabase_client_1.default
                    .from('leads')
                    .insert({
                    organization_id: call.organization_id,
                    campaign_id: call.campaign_id,
                    first_name: nameParts[0] || 'Unknown',
                    last_name: nameParts.slice(1).join(' ') || '',
                    phone: call.phone_number,
                    qualification_status: 'qualified',
                    lead_source: 'ai_call_auto',
                    lead_quality: 'high',
                    score: Math.round((call.ai_confidence_score || 0) * 100),
                    custom_fields: {
                        auto_qualified: true,
                        ai_confidence_score: call.ai_confidence_score,
                        qualification_date: new Date().toISOString()
                    }
                });
            }
            await supabase_client_1.default
                .from('calls')
                .update({ created_crm_contact: true })
                .eq('id', call.id);
            console.log(`✅ Auto-created CRM contact for high-confidence lead: ${call.phone_number}`);
        }
        catch (error) {
            console.error('❌ Error creating CRM contact:', error);
        }
    }
    static async processUnqualifiedCalls(organizationId) {
        let query = supabase_client_1.default
            .from('calls')
            .select('*')
            .is('qualification_status', null)
            .order('started_at', { ascending: false })
            .limit(100);
        if (organizationId) {
            query = query.eq('organization_id', organizationId);
        }
        const { data: calls, error } = await query;
        if (error) {
            console.error('❌ Error fetching unqualified calls:', error);
            return;
        }
        console.log(`🔄 Processing ${calls?.length || 0} unqualified calls...`);
        for (const call of calls || []) {
            try {
                await this.processCallQualification(call);
            }
            catch (error) {
                console.error(`❌ Error processing call ${call.id}:`, error);
            }
        }
    }
}
exports.AILeadQualificationService = AILeadQualificationService;
exports.default = AILeadQualificationService;
