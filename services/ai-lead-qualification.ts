import supabase from './supabase-client';

interface CallData {
  id: string;
  duration?: number;
  outcome?: string;
  sentiment?: string;
  summary?: string;
  key_points?: string;
  buying_signals?: string;
  ai_confidence_score?: number;
}

/**
 * AI Lead Qualification Service
 * Analyzes calls and determines qualification status with AI recommendations
 */
export class AILeadQualificationService {
  
  /**
   * Process a call and determine qualification status
   * @param call - Call data from database
   * @returns Updated qualification data
   */
  static async processCallQualification(call: CallData) {
    // Calculate AI confidence score if not already present
    let aiConfidenceScore = call.ai_confidence_score;
    
    if (!aiConfidenceScore) {
      aiConfidenceScore = this.calculateConfidenceScore(call);
    }

    // Determine AI recommendation based on score and other factors
    const aiRecommendation = this.determineRecommendation(aiConfidenceScore, call);
    
    // Determine qualification status
    let qualificationStatus = 'pending';
    
    // Auto-accept high confidence leads
    if (aiConfidenceScore >= 0.9 && aiRecommendation === 'accept') {
      qualificationStatus = 'auto_accepted';
    }
    // Auto-decline very low confidence
    else if (aiConfidenceScore < 0.3 && aiRecommendation === 'decline') {
      qualificationStatus = 'auto_declined';
    }
    // Everything else goes to review
    else {
      qualificationStatus = 'pending';
    }

    // Update the call record
    const { error } = await supabase
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

    // If auto-accepted, create CRM contact immediately
    if (qualificationStatus === 'auto_accepted') {
      await this.createCRMContact(call);
    }

    return {
      aiConfidenceScore,
      aiRecommendation,
      qualificationStatus
    };
  }

  /**
   * Calculate confidence score based on call attributes
   */
  private static calculateConfidenceScore(call: CallData): number {
    let score = 0.5; // Base score

    // Duration factor (longer calls generally better)
    if (call.duration) {
      if (call.duration > 180) score += 0.2; // 3+ minutes
      else if (call.duration > 120) score += 0.15; // 2+ minutes
      else if (call.duration > 60) score += 0.1; // 1+ minute
      else if (call.duration < 30) score -= 0.2; // Very short call
    }

    // Outcome factor
    if (call.outcome === 'answered' || call.outcome === 'completed') {
      score += 0.1;
    } else if (call.outcome === 'voicemail' || call.outcome === 'no_answer') {
      score -= 0.3;
    }

    // Sentiment factor
    if (call.sentiment) {
      const sentimentLower = call.sentiment.toLowerCase();
      if (sentimentLower.includes('positive') || sentimentLower.includes('interested')) {
        score += 0.2;
      } else if (sentimentLower.includes('negative') || sentimentLower.includes('not interested')) {
        score -= 0.3;
      }
    }

    // Key indicators in summary
    if (call.summary) {
      const summaryLower = call.summary.toLowerCase();
      // Positive indicators
      if (summaryLower.includes('interested')) score += 0.15;
      if (summaryLower.includes('budget')) score += 0.1;
      if (summaryLower.includes('timeline')) score += 0.1;
      if (summaryLower.includes('decision maker')) score += 0.15;
      if (summaryLower.includes('follow up') || summaryLower.includes('callback')) score += 0.1;
      
      // Negative indicators
      if (summaryLower.includes('not interested')) score -= 0.3;
      if (summaryLower.includes('no budget')) score -= 0.2;
      if (summaryLower.includes('already has')) score -= 0.15;
      if (summaryLower.includes('do not call')) score -= 0.5;
    }

    // Buying signals boost
    if (call.buying_signals && call.buying_signals.length > 10) {
      score += 0.2;
    }

    // Ensure score is between 0 and 1
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Determine AI recommendation based on score and context
   */
  private static determineRecommendation(score: number, call: CallData): 'accept' | 'decline' | 'review' {
    // High confidence accept
    if (score >= 0.8) {
      return 'accept';
    }
    
    // Low confidence decline
    if (score < 0.4) {
      // Check for any redeeming qualities before declining
      if (call.buying_signals && call.buying_signals.length > 0) {
        return 'review'; // Has buying signals, worth reviewing
      }
      return 'decline';
    }
    
    // Medium confidence - human review needed
    return 'review';
  }

  /**
   * Create CRM contact for auto-accepted leads
   */
  private static async createCRMContact(call: any) {
    try {
      // Check if contact already exists
      const { data: existingContact } = await supabase
        .from('leads')
        .select('id')
        .eq('phone', call.phone_number)
        .eq('organization_id', call.organization_id)
        .single();

      if (existingContact) {
        // Update existing
        await supabase
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
      } else {
        // Create new
        const nameParts = call.customer_name?.split(' ') || ['Unknown'];
        await supabase
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

      // Mark call as having created CRM contact
      await supabase
        .from('calls')
        .update({ created_crm_contact: true })
        .eq('id', call.id);

      console.log(`✅ Auto-created CRM contact for high-confidence lead: ${call.phone_number}`);
    } catch (error) {
      console.error('❌ Error creating CRM contact:', error);
    }
  }

  /**
   * Process all unqualified calls in batch
   */
  static async processUnqualifiedCalls(organizationId?: string) {
    let query = supabase
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
      } catch (error) {
        console.error(`❌ Error processing call ${call.id}:`, error);
      }
    }
  }
}

export default AILeadQualificationService;