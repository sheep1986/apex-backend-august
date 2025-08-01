const supabase = require('@supabase/supabase-js');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

class AILeadProcessor {
  constructor() {
    this.systemPrompt = null;
  }

  async initialize() {
    // Load the system prompt
    const promptPath = path.join(__dirname, 'openai-lead-qualification-prompt.md');
    this.systemPrompt = await fs.readFile(promptPath, 'utf8');
  }

  async processCall(callData, campaignWinningCriteria = '') {
    if (!this.systemPrompt) {
      await this.initialize();
    }

    // Replace campaign criteria in prompt
    const finalPrompt = this.systemPrompt.replace(
      '{{CAMPAIGN_WINNING_CRITERIA}}',
      campaignWinningCriteria || 'No specific criteria set'
    );

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: finalPrompt
            },
            {
              role: 'user',
              content: `Analyze this call and extract ONLY information explicitly mentioned in the transcript:

Call Duration: ${callData.duration} seconds
Customer Phone: ${callData.phone_number}
Transcript:
${callData.transcript}

Remember: ONLY extract information that was actually said. Leave fields null if not mentioned.`
            }
          ],
          temperature: 0.3,
          max_tokens: 1000
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const analysis = JSON.parse(response.data.choices[0].message.content);
      return analysis;
    } catch (error) {
      console.error('OpenAI API error:', error.response?.data || error.message);
      throw error;
    }
  }

  async createLead(callData, analysis) {
    // Only use data that was actually captured
    const leadData = {
      organization_id: callData.organization_id,
      campaign_id: callData.campaign_id,
      call_id: callData.id,
      
      // Contact info - ONLY from transcript
      first_name: analysis.contact_info.first_name || 'Unknown',
      last_name: analysis.contact_info.last_name || '',
      company: analysis.contact_info.company || null,
      title: analysis.contact_info.title || null,
      email: analysis.contact_info.email || null,
      phone: callData.phone_number, // This we have from the call
      
      // Qualification data
      status: this.determineLeadStatus(analysis.qualification),
      score: Math.round(analysis.qualification.confidence_score * 100),
      lead_source: 'ai_voice_call',
      lead_quality: this.determineLeadQuality(analysis.qualification.confidence_score),
      
      // Analysis results
      notes: analysis.summary.brief || '',
      custom_fields: {
        ai_analysis: {
          confidence_score: analysis.qualification.confidence_score,
          recommendation: analysis.qualification.recommendation,
          sentiment: analysis.qualification.sentiment,
          buying_signals: analysis.qualification.buying_signals,
          pain_points: analysis.qualification.pain_points,
          objections: analysis.qualification.objections,
          next_steps: analysis.qualification.next_steps,
          timeline: analysis.qualification.timeline,
          budget: analysis.qualification.budget,
          decision_maker: analysis.qualification.decision_maker,
          competing_solutions: analysis.qualification.competing_solutions
        },
        call_details: {
          duration: callData.duration,
          call_id: callData.id,
          vapi_call_id: callData.vapi_call_id,
          recorded_at: callData.started_at
        },
        key_points: analysis.summary.key_points,
        prospect_needs: analysis.summary.prospect_needs,
        fit_assessment: analysis.summary.fit_assessment
      },
      
      created_at: new Date().toISOString()
    };

    // Check if lead already exists
    const { data: existingLead } = await client
      .from('leads')
      .select('id')
      .eq('phone', callData.phone_number)
      .eq('organization_id', callData.organization_id)
      .single();

    if (existingLead) {
      // Update existing lead
      const { data, error } = await client
        .from('leads')
        .update({
          ...leadData,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingLead.id)
        .select()
        .single();

      return { data, error, updated: true };
    } else {
      // Create new lead
      const { data, error } = await client
        .from('leads')
        .insert(leadData)
        .select()
        .single();

      return { data, error, updated: false };
    }
  }

  determineLeadStatus(qualification) {
    switch (qualification.recommendation) {
      case 'accept':
        return 'qualified';
      case 'review':
        return 'interested';
      case 'decline':
        return 'unqualified';
      default:
        return 'new';
    }
  }

  determineLeadQuality(confidenceScore) {
    if (confidenceScore >= 0.8) return 'hot';
    if (confidenceScore >= 0.6) return 'warm';
    return 'cold';
  }

  async updateCallWithAnalysis(callId, analysis) {
    const { error } = await client
      .from('calls')
      .update({
        ai_confidence_score: analysis.qualification.confidence_score,
        ai_recommendation: analysis.qualification.recommendation,
        sentiment: analysis.qualification.sentiment,
        summary: analysis.summary.brief,
        buying_signals: analysis.qualification.buying_signals.join(', '),
        qualification_status: 
          analysis.qualification.confidence_score >= 0.8 ? 'auto_accepted' :
          analysis.qualification.confidence_score < 0.3 ? 'auto_declined' : 'pending',
        updated_at: new Date().toISOString()
      })
      .eq('id', callId);

    return !error;
  }
}

// Export for use in other modules
module.exports = { AILeadProcessor };

// If run directly, process recent calls
if (require.main === module) {
  async function processCalls() {
    const processor = new AILeadProcessor();
    await processor.initialize();

    // Get recent calls with transcripts
    const { data: calls } = await client
      .from('calls')
      .select('*')
      .not('transcript', 'is', null)
      .is('ai_confidence_score', null)
      .order('created_at', { ascending: false })
      .limit(5);

    console.log(`Processing ${calls?.length || 0} calls...\n`);

    for (const call of calls || []) {
      try {
        console.log(`Processing ${call.customer_name || 'Unknown'}...`);
        
        // Get campaign winning criteria if available
        const { data: campaign } = await client
          .from('campaigns')
          .select('winning_criteria')
          .eq('id', call.campaign_id)
          .single();

        const analysis = await processor.processCall(
          call, 
          campaign?.winning_criteria || ''
        );

        // Update call with analysis
        await processor.updateCallWithAnalysis(call.id, analysis);

        // Create lead if recommended
        if (analysis.qualification.recommendation === 'accept' && 
            analysis.qualification.confidence_score >= 0.7) {
          const { data: lead, error, updated } = await processor.createLead(call, analysis);
          
          if (error) {
            console.error('Error creating lead:', error);
          } else {
            console.log(`✅ Lead ${updated ? 'updated' : 'created'}: ${lead.first_name} ${lead.last_name}`);
          }

          // Mark call as processed
          await client
            .from('calls')
            .update({ created_crm_contact: true })
            .eq('id', call.id);
        } else {
          console.log(`❌ Not qualified: ${analysis.qualification.recommendation} (${(analysis.qualification.confidence_score * 100).toFixed(0)}%)`);
        }
      } catch (error) {
        console.error(`Error processing call ${call.id}:`, error.message);
      }
    }
  }

  processCalls();
}