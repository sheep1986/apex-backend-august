#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://twigokrtbvigiqnaybfy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExMzUyNjksImV4cCI6MjA2NjcxMTI2OX0.AcRI1NYcCYpRqvHZvux15kMbGPocFbvT6uLf5DD6v24';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Main sync service
class VapiSyncService {
  constructor() {
    this.apiKey = null;
    this.organizationId = '2566d8c5-2245-4a3c-b539-4cea21a07d9b';
  }

  async initialize() {
    // Get organization VAPI credentials
    const { data: org } = await supabase
      .from('organizations')
      .select('vapi_private_key')
      .eq('id', this.organizationId)
      .single();
    
    this.apiKey = org?.vapi_private_key || process.env.VAPI_API_KEY;
    
    if (!this.apiKey) {
      throw new Error('No VAPI API key found!');
    }
  }

  async syncAllCalls() {
    console.log('🔄 Starting VAPI sync service...\n');
    
    try {
      await this.initialize();
      
      // 1. Sync recent VAPI calls
      const vapiCalls = await this.fetchRecentVapiCalls();
      console.log(`📡 Found ${vapiCalls.length} VAPI calls to process\n`);
      
      // 2. Process each call
      for (const vapiCall of vapiCalls) {
        await this.processVapiCall(vapiCall);
      }
      
      // 3. Create leads from qualified calls
      await this.createLeadsFromQualifiedCalls();
      
      // 4. Update campaign statistics
      await this.updateCampaignStats();
      
      console.log('\n✅ Sync complete!');
      
    } catch (error) {
      console.error('❌ Sync error:', error.message);
    }
  }

  async fetchRecentVapiCalls() {
    try {
      const response = await axios.get(
        'https://api.vapi.ai/call',
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          params: {
            limit: 100,
            createdAtGt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Last 24 hours
          }
        }
      );
      
      return response.data.filter(call => call.status === 'ended');
    } catch (error) {
      console.error('Error fetching VAPI calls:', error.response?.data || error.message);
      return [];
    }
  }

  async processVapiCall(vapiCall) {
    console.log(`📞 Processing VAPI call ${vapiCall.id}...`);
    
    // Check if we already have this call
    const { data: existingCall } = await supabase
      .from('calls')
      .select('*')
      .eq('vapi_call_id', vapiCall.id)
      .single();
    
    if (existingCall && existingCall.status === 'completed') {
      console.log('  ✓ Already processed');
      return;
    }
    
    const duration = vapiCall.startedAt && vapiCall.endedAt
      ? Math.round((new Date(vapiCall.endedAt) - new Date(vapiCall.startedAt)) / 1000)
      : 0;
    
    if (existingCall) {
      // Update existing call
      const { error } = await supabase
        .from('calls')
        .update({
          status: 'completed',
          to_number: vapiCall.customer?.number,
          duration,
          transcript: vapiCall.transcript || null,
          summary: vapiCall.summary || null,
          recording_url: vapiCall.recordingUrl || vapiCall.stereoRecordingUrl || null,
          cost: vapiCall.cost || 0,
          started_at: vapiCall.startedAt,
          ended_at: vapiCall.endedAt,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingCall.id);
      
      if (error) {
        console.error('  ❌ Update error:', error.message);
      } else {
        console.log('  ✅ Updated existing call');
      }
    } else {
      // Try to match with an initiated call by phone number
      const phoneNumber = vapiCall.customer?.number;
      const { data: initiatedCall } = await supabase
        .from('calls')
        .select('*')
        .eq('status', 'initiated')
        .or(`to_number.eq.${phoneNumber},phone_number.eq.${phoneNumber}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (initiatedCall) {
        const { error } = await supabase
          .from('calls')
          .update({
            vapi_call_id: vapiCall.id,
            status: 'completed',
            to_number: phoneNumber,
            duration,
            transcript: vapiCall.transcript || null,
            summary: vapiCall.summary || null,
            recording_url: vapiCall.recordingUrl || vapiCall.stereoRecordingUrl || null,
            cost: vapiCall.cost || 0,
            started_at: vapiCall.startedAt,
            ended_at: vapiCall.endedAt,
            updated_at: new Date().toISOString()
          })
          .eq('id', initiatedCall.id);
        
        if (error) {
          console.error('  ❌ Update error:', error.message);
        } else {
          console.log('  ✅ Matched and updated initiated call');
        }
      } else {
        console.log('  ⚠️ No matching call found in database');
      }
    }
  }

  async createLeadsFromQualifiedCalls() {
    console.log('\n📋 Creating leads from qualified calls...');
    
    // Get completed calls that don't have leads yet
    const { data: qualifiedCalls } = await supabase
      .from('calls')
      .select('*')
      .eq('status', 'completed')
      .gt('duration', 30) // Calls longer than 30 seconds
      .is('lead_id', null)
      .not('transcript', 'is', null);
    
    if (!qualifiedCalls || qualifiedCalls.length === 0) {
      console.log('  No new qualified calls to process');
      return;
    }
    
    console.log(`  Found ${qualifiedCalls.length} qualified calls without leads`);
    
    for (const call of qualifiedCalls) {
      // Get contact info
      const { data: contact } = await supabase
        .from('campaign_contacts')
        .select('*')
        .eq('campaign_id', call.campaign_id)
        .eq('phone', call.to_number?.replace('+', ''))
        .single();
      
      if (!contact) {
        console.log(`  ⚠️ No contact found for ${call.to_number}`);
        continue;
      }
      
      // Create lead
      const { data: newLead, error } = await supabase
        .from('leads')
        .insert({
          organization_id: call.organization_id,
          campaign_id: call.campaign_id,
          contact_id: contact.id,
          name: `${contact.first_name} ${contact.last_name}`.trim(),
          email: contact.email,
          phone: contact.phone,
          company: contact.company,
          status: 'new',
          last_call_outcome: call.duration > 60 ? 'interested' : 'not_interested',
          last_call_date: call.ended_at,
          call_attempts: 1,
          source: 'vapi_call',
          notes: `Call duration: ${call.duration}s. ${call.summary || ''}`,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (error) {
        console.error(`  ❌ Error creating lead:`, error.message);
      } else {
        console.log(`  ✅ Created lead: ${newLead.name}`);
        
        // Update call with lead_id
        await supabase
          .from('calls')
          .update({ lead_id: newLead.id })
          .eq('id', call.id);
      }
    }
  }

  async updateCampaignStats() {
    console.log('\n📊 Updating campaign statistics...');
    
    // Get active campaigns
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('*')
      .eq('status', 'active');
    
    if (!campaigns || campaigns.length === 0) {
      console.log('  No active campaigns');
      return;
    }
    
    for (const campaign of campaigns) {
      const { data: stats } = await supabase
        .from('calls')
        .select('status, duration')
        .eq('campaign_id', campaign.id);
      
      if (stats && stats.length > 0) {
        const totalCalls = stats.length;
        const completedCalls = stats.filter(c => c.status === 'completed').length;
        const totalDuration = stats.reduce((sum, c) => sum + (c.duration || 0), 0);
        const avgDuration = totalDuration / completedCalls || 0;
        
        console.log(`  ${campaign.name}:`);
        console.log(`    Total: ${totalCalls}, Completed: ${completedCalls}`);
        console.log(`    Avg Duration: ${Math.round(avgDuration)}s`);
      }
    }
  }
}

// Run the service
async function main() {
  const service = new VapiSyncService();
  
  // Run once
  await service.syncAllCalls();
  
  // If --watch flag is provided, run every 5 minutes
  if (process.argv.includes('--watch')) {
    console.log('\n👁️ Running in watch mode - syncing every 5 minutes...');
    setInterval(() => {
      console.log('\n' + '='.repeat(50) + '\n');
      service.syncAllCalls();
    }, 5 * 60 * 1000);
  }
}

main().catch(console.error);