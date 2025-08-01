"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VAPIOutboundService = void 0;
const vapi_integration_service_1 = require("./vapi-integration-service");
const supabase_client_1 = require("./supabase-client");
const mock_webhook_service_1 = require("./mock-webhook-service");
const csv_parser_1 = __importDefault(require("csv-parser"));
const stream_1 = require("stream");
async function generateApexCampaignId(organizationId) {
    const maxAttempts = 10;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const numbers = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
        const apexId = `apex${numbers}`;
        const { data: existingCampaign, error } = await supabase_client_1.supabaseService
            .from('campaigns')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('apex_id', apexId)
            .single();
        if (error && error.code === 'PGRST116') {
            return apexId;
        }
        if (error) {
            console.error('Error checking apex ID uniqueness:', error);
            throw new Error('Failed to generate unique campaign ID');
        }
        console.log(`📝 Apex ID ${apexId} already exists, generating new one...`);
    }
    throw new Error('Failed to generate unique Apex campaign ID after maximum attempts');
}
class VAPIOutboundService {
    constructor(organizationId, vapiService) {
        this.organizationId = organizationId;
        this.vapiService = vapiService;
    }
    static async forOrganization(organizationId) {
        try {
            const vapiService = await vapi_integration_service_1.VAPIIntegrationService.forOrganization(organizationId);
            if (!vapiService) {
                console.log('⚠️ No VAPI credentials found for organization');
                return null;
            }
            return new VAPIOutboundService(organizationId, vapiService);
        }
        catch (error) {
            console.error('❌ Error creating VAPI outbound service:', error);
            return null;
        }
    }
    async createCampaign(campaignData) {
        try {
            console.log('🚀 Creating VAPI outbound campaign:', campaignData.name);
            if (!campaignData.name) {
                throw new Error('Campaign name is required');
            }
            const hasVAPICredentials = this.vapiService !== null;
            const hasRealVAPIData = campaignData.assistantId && (campaignData.phoneNumberId || campaignData.phoneNumber);
            if (hasVAPICredentials && hasRealVAPIData) {
                console.log('✅ Using real VAPI integration');
                try {
                    if (campaignData.assistantId && this.vapiService) {
                        await this.vapiService.listAssistants();
                    }
                }
                catch (error) {
                    console.warn('⚠️ VAPI API validation failed, proceeding with database-only campaign');
                }
            }
            else {
                console.log('📝 Creating development campaign (no VAPI credentials)');
            }
            let schedule = campaignData.schedule;
            if (campaignData.sendTiming === 'schedule' && campaignData.scheduleDate && campaignData.scheduleTime) {
                schedule = {
                    startTime: `${campaignData.scheduleDate}T${campaignData.scheduleTime}:00`,
                    timezone: 'UTC',
                    ...schedule
                };
            }
            const apexId = await generateApexCampaignId(this.organizationId);
            console.log(`🆔 Generated unique Apex ID: ${apexId}`);
            const maxConcurrentCalls = campaignData.max_concurrent_calls ||
                campaignData.callBehavior?.customConcurrency ||
                10;
            const workingHours = campaignData.workingHours?.schedule || {
                monday: { enabled: true, start: '09:00', end: '17:00' },
                tuesday: { enabled: true, start: '09:00', end: '17:00' },
                wednesday: { enabled: true, start: '09:00', end: '17:00' },
                thursday: { enabled: true, start: '09:00', end: '17:00' },
                friday: { enabled: true, start: '09:00', end: '17:00' },
                saturday: { enabled: false, start: '09:00', end: '17:00' },
                sunday: { enabled: false, start: '09:00', end: '17:00' }
            };
            const workingDays = Object.keys(workingHours)
                .map((day, index) => workingHours[day].enabled ? index + 1 : null)
                .filter(day => day !== null);
            const campaignRecord = {
                organization_id: this.organizationId,
                apex_id: apexId,
                name: campaignData.name,
                description: campaignData.description,
                type: 'outbound',
                status: campaignData.status || 'draft',
                assistant_id: campaignData.assistantId || 'dev-assistant-001',
                phone_number_id: campaignData.phoneNumberId || 'dev-phone-001',
                max_concurrent_calls: maxConcurrentCalls,
                working_hours: JSON.stringify(workingHours),
                working_days: workingDays,
                timezone: campaignData.workingHours?.defaultTimezone || 'America/New_York',
                calls_per_hour: campaignData.callBehavior?.callsPerHour || 20,
                calls_per_day: campaignData.callBehavior?.callsPerHour ? campaignData.callBehavior.callsPerHour * 8 : 160,
                max_retry_attempts: campaignData.retryLogic?.maxRetries || 3,
                retry_delay_hours: campaignData.retryLogic?.retryDelay || 24,
                retry_outcomes: ['no_answer', 'busy', 'failed'],
                settings: {
                    schedule,
                    phoneNumber: campaignData.phoneNumber,
                    assignedTeam: campaignData.assignedTeam || [],
                    sendTiming: campaignData.sendTiming || 'now',
                    hasVAPICredentials,
                    realVAPIData: hasRealVAPIData,
                    callBehavior: campaignData.callBehavior,
                    workingHoursConfig: campaignData.workingHours,
                    retryLogic: campaignData.retryLogic,
                    teamManagement: campaignData.teamManagement
                },
                total_calls: 0,
                successful_calls: 0,
                total_duration: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            if (campaignData.createdBy) {
                campaignRecord.created_by = campaignData.createdBy;
            }
            const { data: campaign, error } = await supabase_client_1.supabaseService
                .from('campaigns')
                .insert([campaignRecord])
                .select()
                .single();
            if (error) {
                throw new Error(`Failed to create campaign: ${error.message}`);
            }
            console.log('✅ Campaign created successfully:', campaign.id);
            if (campaignData.csvData) {
                try {
                    const result = await this.uploadLeadsFromCSV(campaign.id, campaignData.csvData);
                    console.log(`📤 Uploaded ${result.success} leads from CSV`);
                }
                catch (csvError) {
                    console.warn('⚠️ Failed to process CSV data:', csvError);
                }
            }
            if (campaignData.sendTiming === 'now' && hasVAPICredentials && hasRealVAPIData) {
                try {
                    console.log('🚀 Auto-starting campaign with sendTiming=now...');
                    await this.startCampaign(campaign.id);
                }
                catch (startError) {
                    console.warn('⚠️ Failed to auto-start campaign:', startError);
                }
            }
            const metrics = {
                totalLeads: 0,
                callsAttempted: 0,
                callsConnected: 0,
                callsCompleted: 0,
                connectionRate: 0,
                completionRate: 0,
                averageDuration: 0,
                totalCost: 0,
                positiveOutcomes: 0,
                conversionRate: 0,
                activeCalls: 0,
                callsToday: 0,
                leadsRemaining: 0
            };
            return {
                id: campaign.id,
                organizationId: this.organizationId,
                name: campaign.name,
                description: campaign.description,
                status: campaign.status,
                assistantId: campaign.assistant_id,
                phoneNumberId: campaign.phone_number_id,
                leads: [],
                schedule: campaign.settings?.schedule,
                maxRetries: campaign.settings?.maxRetries || 3,
                retryDelay: campaign.settings?.retryDelay || 24,
                metrics
            };
        }
        catch (error) {
            console.error('❌ Error creating VAPI campaign:', error);
            throw error;
        }
    }
    async uploadLeadsFromCSV(campaignId, csvData) {
        try {
            console.log('📤 Uploading leads from CSV to campaign:', campaignId);
            const leads = [];
            const errors = [];
            let lineNumber = 0;
            return new Promise((resolve, reject) => {
                const stream = stream_1.Readable.from([csvData]);
                stream
                    .pipe((0, csv_parser_1.default)())
                    .on('data', (row) => {
                    lineNumber++;
                    try {
                        const phoneField = row.phone || row.number || row.telephone || row.phoneNumber || row.Phone || row.Number;
                        const nameField = row.name || row.Name;
                        const firstNameField = row.firstName || row.first_name || row.FirstName || row.firstname;
                        const lastNameField = row.lastName || row.last_name || row.LastName || row.lastname;
                        let firstName = firstNameField;
                        let lastName = lastNameField;
                        if (!firstName && !lastName && nameField) {
                            const nameParts = nameField.trim().split(' ');
                            firstName = nameParts[0];
                            lastName = nameParts.slice(1).join(' ') || '';
                        }
                        if (!firstName || !phoneField) {
                            errors.push(`Line ${lineNumber}: Missing required fields (name and phone)`);
                            return;
                        }
                        const phoneRegex = /^\+?[1-9]\d{1,14}$/;
                        const cleanPhone = phoneField.replace(/[\s\-\(\)]/g, '');
                        if (!phoneRegex.test(cleanPhone)) {
                            errors.push(`Line ${lineNumber}: Invalid phone number format`);
                            return;
                        }
                        const lead = {
                            firstName: firstName.trim(),
                            lastName: lastName.trim(),
                            phone: this.formatPhoneNumber(cleanPhone),
                            email: (row.email || row.Email)?.trim(),
                            company: (row.company || row.Company)?.trim(),
                            title: (row.title || row.Title || row.job_title || row.JobTitle)?.trim(),
                            status: 'pending',
                            callAttempts: 0,
                            customFields: {}
                        };
                        Object.keys(row).forEach(key => {
                            const lowerKey = key.toLowerCase();
                            if (!['firstname', 'lastname', 'phone', 'number', 'name', 'email', 'company', 'title', 'first_name', 'last_name', 'telephone', 'phonenumber', 'job_title'].includes(lowerKey)) {
                                lead.customFields[key] = row[key];
                            }
                        });
                        leads.push(lead);
                        console.log(`📝 Parsed lead ${lineNumber}: ${firstName} ${lastName} - ${cleanPhone}`);
                    }
                    catch (error) {
                        errors.push(`Line ${lineNumber}: ${error.message}`);
                    }
                })
                    .on('end', async () => {
                    try {
                        console.log(`📊 Processing ${leads.length} leads for campaign ${campaignId}`);
                        const { data: insertedLeads, error: insertError } = await supabase_client_1.supabaseService
                            .from('leads')
                            .upsert(leads.map(lead => ({
                            organization_id: this.organizationId,
                            campaign_id: campaignId,
                            first_name: lead.firstName,
                            last_name: lead.lastName,
                            phone: lead.phone,
                            email: lead.email,
                            company: lead.company,
                            job_title: lead.title,
                            status: 'pending',
                            call_status: 'pending',
                            call_attempts: 0,
                            custom_fields: lead.customFields || {},
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        })), {
                            onConflict: 'organization_id,phone',
                            ignoreDuplicates: false
                        })
                            .select();
                        if (insertError) {
                            console.error('❌ Error inserting leads:', insertError);
                            throw new Error(`Failed to insert leads: ${insertError.message}`);
                        }
                        await this.updateCampaignMetrics(campaignId);
                        console.log(`✅ Successfully uploaded ${insertedLeads?.length || 0} leads`);
                        resolve({
                            success: insertedLeads?.length || 0,
                            failed: errors.length,
                            errors
                        });
                    }
                    catch (error) {
                        reject(error);
                    }
                })
                    .on('error', (error) => {
                    reject(error);
                });
            });
        }
        catch (error) {
            console.error('❌ Error uploading leads from CSV:', error);
            throw error;
        }
    }
    async startCampaign(campaignId) {
        try {
            console.log('▶️ Starting VAPI campaign:', campaignId);
            const { data: campaign, error: campaignError } = await supabase_client_1.supabaseService
                .from('campaigns')
                .select('*')
                .eq('id', campaignId)
                .eq('organization_id', this.organizationId)
                .single();
            if (campaignError || !campaign) {
                throw new Error('Campaign not found');
            }
            const { data: campaignContacts, error: contactsError } = await supabase_client_1.supabaseService
                .from('campaign_contacts')
                .select('*')
                .eq('campaign_id', campaignId);
            if (!contactsError && campaignContacts && campaignContacts.length > 0) {
                console.log(`📋 Found ${campaignContacts.length} contacts in campaign_contacts, copying to leads table...`);
                const leadsToInsert = campaignContacts.map(contact => ({
                    organization_id: this.organizationId,
                    campaign_id: campaignId,
                    first_name: contact.first_name || '',
                    last_name: contact.last_name || '',
                    phone: contact.phone,
                    email: contact.email,
                    company: contact.company,
                    job_title: contact.title,
                    status: 'pending',
                    call_status: 'pending',
                    call_attempts: 0,
                    custom_fields: contact.custom_fields || {},
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }));
                const { error: insertError } = await supabase_client_1.supabaseService
                    .from('leads')
                    .insert(leadsToInsert, {
                    onConflict: 'organization_id,phone',
                    ignoreDuplicates: false
                });
                if (insertError) {
                    console.error('❌ Error copying contacts to leads:', insertError);
                }
                else {
                    console.log(`✅ Successfully copied ${campaignContacts.length} contacts to leads table`);
                }
            }
            const { data: leads, error: leadsError } = await supabase_client_1.supabaseService
                .from('leads')
                .select('*')
                .eq('campaign_id', campaignId)
                .eq('call_status', 'pending')
                .order('created_at', { ascending: true });
            if (leadsError) {
                throw new Error(`Failed to fetch leads: ${leadsError.message}`);
            }
            if (!leads || leads.length === 0) {
                console.log('⚠️ No pending leads found, checking for any campaign leads...');
                const { data: allCampaignLeads, error: allLeadsError } = await supabase_client_1.supabaseService
                    .from('leads')
                    .select('*')
                    .eq('campaign_id', campaignId)
                    .order('created_at', { ascending: true });
                if (allLeadsError) {
                    throw new Error(`Failed to fetch campaign leads: ${allLeadsError.message}`);
                }
                if (allCampaignLeads && allCampaignLeads.length > 0) {
                    console.log(`📊 Found ${allCampaignLeads.length} total leads for campaign, but none are pending`);
                    console.log('📊 Lead statuses:', allCampaignLeads.map(l => l.call_status));
                    const resetableStatuses = ['failed', 'no_answer', 'busy'];
                    const leadsToReset = allCampaignLeads.filter(l => resetableStatuses.includes(l.call_status));
                    if (leadsToReset.length > 0) {
                        console.log(`🔄 Resetting ${leadsToReset.length} leads to pending status`);
                        const { error: resetError } = await supabase_client_1.supabaseService
                            .from('leads')
                            .update({ call_status: 'pending', updated_at: new Date().toISOString() })
                            .in('id', leadsToReset.map(l => l.id));
                        if (resetError) {
                            console.error('❌ Error resetting leads:', resetError);
                        }
                        else {
                            const { data: resetLeads } = await supabase_client_1.supabaseService
                                .from('leads')
                                .select('*')
                                .eq('campaign_id', campaignId)
                                .eq('call_status', 'pending')
                                .order('created_at', { ascending: true });
                            if (resetLeads && resetLeads.length > 0) {
                                console.log(`✅ Reset ${resetLeads.length} leads to pending status`);
                                const finalLeads = resetLeads;
                                await supabase_client_1.supabaseService
                                    .from('campaigns')
                                    .update({
                                    status: 'active',
                                    updated_at: new Date().toISOString()
                                })
                                    .eq('id', campaignId);
                                console.log(`✅ Campaign started with ${finalLeads.length} leads`);
                                this.processCampaignCalls(campaignId);
                                return;
                            }
                        }
                    }
                }
                console.log('⚠️ No leads found for campaign, checking for existing leads in organization...');
                const { data: orgLeads, error: orgLeadsError } = await supabase_client_1.supabaseService
                    .from('leads')
                    .select('*')
                    .eq('organization_id', this.organizationId)
                    .eq('call_status', 'pending')
                    .is('campaign_id', null)
                    .limit(10);
                if (orgLeadsError) {
                    console.error('❌ Error fetching organization leads:', orgLeadsError);
                }
                else if (orgLeads && orgLeads.length > 0) {
                    console.log(`📞 Found ${orgLeads.length} unassigned leads in organization, assigning to campaign`);
                    const { error: assignError } = await supabase_client_1.supabaseService
                        .from('leads')
                        .update({
                        campaign_id: campaignId,
                        updated_at: new Date().toISOString()
                    })
                        .in('id', orgLeads.map(l => l.id));
                    if (assignError) {
                        console.error('❌ Error assigning leads to campaign:', assignError);
                    }
                    else {
                        console.log(`✅ Assigned ${orgLeads.length} leads to campaign`);
                        await supabase_client_1.supabaseService
                            .from('campaigns')
                            .update({
                            status: 'active',
                            updated_at: new Date().toISOString()
                        })
                            .eq('id', campaignId);
                        console.log(`✅ Campaign started with ${orgLeads.length} assigned leads`);
                        this.processCampaignCalls(campaignId);
                        return;
                    }
                }
                else {
                    console.log('⚠️ No unassigned leads found, looking for leads from other campaigns to reassign...');
                    const { data: otherCampaignLeads, error: otherLeadsError } = await supabase_client_1.supabaseService
                        .from('leads')
                        .select('*')
                        .eq('organization_id', this.organizationId)
                        .in('call_status', ['pending', 'failed', 'no_answer', 'busy'])
                        .not('campaign_id', 'is', null)
                        .limit(5);
                    if (otherLeadsError) {
                        console.error('❌ Error fetching leads from other campaigns:', otherLeadsError);
                    }
                    else if (otherCampaignLeads && otherCampaignLeads.length > 0) {
                        console.log(`🔄 Found ${otherCampaignLeads.length} leads from other campaigns, reassigning to current campaign`);
                        const { error: reassignError } = await supabase_client_1.supabaseService
                            .from('leads')
                            .update({
                            campaign_id: campaignId,
                            call_status: 'pending',
                            updated_at: new Date().toISOString()
                        })
                            .in('id', otherCampaignLeads.map(l => l.id));
                        if (reassignError) {
                            console.error('❌ Error reassigning leads to campaign:', reassignError);
                        }
                        else {
                            console.log(`✅ Reassigned ${otherCampaignLeads.length} leads to campaign`);
                            await supabase_client_1.supabaseService
                                .from('campaigns')
                                .update({
                                status: 'active',
                                updated_at: new Date().toISOString()
                            })
                                .eq('id', campaignId);
                            console.log(`✅ Campaign started with ${otherCampaignLeads.length} reassigned leads`);
                            this.processCampaignCalls(campaignId);
                            return;
                        }
                    }
                }
                throw new Error('No leads found for campaign. Please upload leads first.');
            }
            await supabase_client_1.supabaseService
                .from('campaigns')
                .update({
                status: 'active',
                updated_at: new Date().toISOString()
            })
                .eq('id', campaignId);
            console.log(`✅ Campaign started with ${leads.length} leads`);
            this.processCampaignCalls(campaignId);
        }
        catch (error) {
            console.error('❌ Error starting campaign:', error);
            throw error;
        }
    }
    async processCampaignCalls(campaignId) {
        try {
            console.log(`🔄 Starting to process campaign calls for: ${campaignId}`);
            const { data: campaign } = await supabase_client_1.supabaseService
                .from('campaigns')
                .select('*, organization:organizations(settings)')
                .eq('id', campaignId)
                .single();
            if (!campaign) {
                throw new Error('Campaign not found');
            }
            console.log(`📋 Campaign config:`, {
                assistant_id: campaign.assistant_id,
                phone_number_id: campaign.phone_number_id
            });
            const maxConcurrentCalls = campaign.max_concurrent_calls ||
                campaign.organization?.settings?.max_concurrent_calls ||
                5;
            const { data: activeCalls } = await supabase_client_1.supabaseService
                .from('calls')
                .select('id')
                .eq('campaign_id', campaignId)
                .in('status', ['initiated', 'ringing', 'in-progress']);
            const currentActiveCalls = activeCalls?.length || 0;
            const availableSlots = Math.max(0, maxConcurrentCalls - currentActiveCalls);
            console.log(`📊 Concurrency: ${currentActiveCalls}/${maxConcurrentCalls} active calls, ${availableSlots} slots available`);
            if (availableSlots === 0) {
                console.log('⚠️ Max concurrent calls reached, waiting for slots to free up');
                return;
            }
            const { data: leads } = await supabase_client_1.supabaseService
                .from('leads')
                .select('*')
                .eq('campaign_id', campaignId)
                .eq('call_status', 'pending')
                .limit(availableSlots);
            console.log(`📊 Found ${leads?.length || 0} pending leads for campaign ${campaignId}`);
            if (!leads || leads.length === 0) {
                console.log('⚠️ No pending leads found for processing');
                return;
            }
            console.log(`🚀 Processing ${leads.length} leads with max ${maxConcurrentCalls} concurrent calls...`);
            const callPromises = leads.map(async (lead, index) => {
                try {
                    await new Promise(resolve => setTimeout(resolve, index * 500));
                    console.log(`📞 Processing lead: ${lead.first_name} ${lead.last_name} - ${lead.phone}`);
                    return await this.makeCall(campaignId, lead, campaign.assistant_id, campaign.phone_number_id);
                }
                catch (error) {
                    console.error(`❌ Failed to call lead ${lead.id}:`, error);
                    return { success: false, error: error.message };
                }
            });
            const results = await Promise.all(callPromises);
            const successfulCalls = results.filter(r => r.success !== false).length;
            console.log(`✅ Finished processing batch: ${successfulCalls}/${leads.length} calls initiated successfully`);
        }
        catch (error) {
            console.error('❌ Error processing campaign calls:', error);
        }
    }
    formatPhoneNumber(phone) {
        if (!phone)
            return '';
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length >= 10) {
            if (cleaned.startsWith('1') && cleaned.length === 11) {
                return `+${cleaned}`;
            }
            else if (cleaned.startsWith('44') && cleaned.length >= 11) {
                return `+${cleaned}`;
            }
            else if (cleaned.startsWith('356') && cleaned.length === 11) {
                return `+${cleaned}`;
            }
            else if (cleaned.startsWith('39') && cleaned.length >= 10) {
                return `+${cleaned}`;
            }
            else if (cleaned.startsWith('33') && cleaned.length >= 10) {
                return `+${cleaned}`;
            }
            else if (cleaned.startsWith('49') && cleaned.length >= 11) {
                return `+${cleaned}`;
            }
            else if (cleaned.length >= 10) {
                return `+${cleaned}`;
            }
        }
        if (cleaned.length === 8) {
            if (cleaned.startsWith('9') || cleaned.startsWith('7')) {
                return `+356${cleaned}`;
            }
        }
        if (cleaned.length === 10) {
            return `+44${cleaned}`;
        }
        else if (cleaned.length === 11 && cleaned.startsWith('0')) {
            return `+44${cleaned.substring(1)}`;
        }
        return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
    }
    async makeCall(campaignId, lead, assistantId, phoneNumberId) {
        try {
            console.log(`📞 Making call to ${lead.first_name} ${lead.last_name} at ${lead.phone}`);
            const { data: existingCalls, error: checkError } = await supabase_client_1.supabaseService
                .from('calls')
                .select('id, status, created_at')
                .eq('campaign_id', campaignId)
                .eq('lead_id', lead.id)
                .in('status', ['initiated', 'ringing', 'in-progress', 'completed']);
            if (checkError) {
                console.error('❌ Error checking existing calls:', checkError);
            }
            if (existingCalls && existingCalls.length > 0) {
                const recentCall = existingCalls.find(call => {
                    const callTime = new Date(call.created_at).getTime();
                    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
                    return callTime > fiveMinutesAgo;
                });
                if (recentCall) {
                    console.log(`⏭️ Skipping duplicate call for lead ${lead.id} - recent call exists (${recentCall.id})`);
                    return {
                        success: false,
                        callId: recentCall.id,
                        message: 'Recent call already exists for this lead'
                    };
                }
            }
            const formattedPhone = this.formatPhoneNumber(lead.phone);
            console.log(`📱 Formatted phone number: "${lead.phone}" → "${formattedPhone}"`);
            const vapiPhoneNumber = formattedPhone.startsWith('+') ? formattedPhone : `+${formattedPhone}`;
            console.log(`🚀 VAPI phone number: "${vapiPhoneNumber}"`);
            const callRequest = {
                assistantId,
                phoneNumberId,
                customer: {
                    number: vapiPhoneNumber,
                    name: `${lead.first_name} ${lead.last_name}`.trim(),
                    email: lead.email || undefined
                }
            };
            console.log(`🚀 VAPI call request:`, JSON.stringify(callRequest, null, 2));
            let vapiCall;
            if (this.vapiService) {
                try {
                    vapiCall = await this.vapiService.createCall(callRequest);
                    console.log('✅ VAPI call created successfully:', vapiCall?.id || 'No ID returned');
                    console.log('📞 VAPI response:', JSON.stringify(vapiCall, null, 2));
                }
                catch (vapiError) {
                    console.error('❌ VAPI call creation failed:', vapiError);
                    console.error('Error details:', vapiError.response?.data || vapiError.message);
                    throw new Error(`VAPI call failed: ${vapiError.message}`);
                }
            }
            else {
                vapiCall = {
                    id: `mock-call-${Date.now()}`,
                    status: 'queued',
                    assistantId,
                    customer: callRequest.customer
                };
                console.log('📞 Created mock call for development:', vapiCall.id);
            }
            if (!vapiCall || !vapiCall.id) {
                throw new Error('VAPI did not return a valid call ID');
            }
            const { data: callRecord, error: callError } = await supabase_client_1.supabaseService
                .from('calls')
                .insert({
                organization_id: this.organizationId,
                campaign_id: campaignId,
                lead_id: lead.id,
                vapi_call_id: vapiCall.id,
                direction: 'outbound',
                phone_number: formattedPhone,
                status: 'initiated',
                started_at: new Date().toISOString(),
                cost: 0
            })
                .select()
                .single();
            if (callError) {
                console.error('❌ Error recording call:', callError);
                throw new Error(`Failed to record call: ${callError.message}`);
            }
            await supabase_client_1.supabaseService
                .from('leads')
                .update({
                call_status: 'calling',
                updated_at: new Date().toISOString()
            })
                .eq('id', lead.id);
            console.log(`✅ Call initiated: ${vapiCall.id}`);
            if (!this.vapiService && vapiCall.id.startsWith('mock-call-')) {
                console.log('🎭 Starting mock call simulation...');
                const mockWebhookService = mock_webhook_service_1.MockWebhookService.getInstance();
                await mockWebhookService.simulateCallProgression(vapiCall.id, this.organizationId);
            }
            return {
                leadId: lead.id,
                vapiCallId: vapiCall.id,
                status: 'pending',
                startedAt: new Date().toISOString()
            };
        }
        catch (error) {
            console.error('❌ Error making call:', error);
            await supabase_client_1.supabaseService
                .from('leads')
                .update({
                call_status: 'failed',
                updated_at: new Date().toISOString()
            })
                .eq('id', lead.id);
            throw error;
        }
    }
    async getCampaignDashboard(campaignId) {
        try {
            const { data: campaign, error: campaignError } = await supabase_client_1.supabaseService
                .from('campaigns')
                .select('*')
                .eq('id', campaignId)
                .eq('organization_id', this.organizationId)
                .single();
            if (campaignError || !campaign) {
                throw new Error('Campaign not found');
            }
            const { data: leads, error: leadsError } = await supabase_client_1.supabaseService
                .from('leads')
                .select('*')
                .eq('campaign_id', campaignId);
            if (leadsError) {
                throw new Error(`Failed to fetch leads: ${leadsError.message}`);
            }
            const { data: calls, error: callsError } = await supabase_client_1.supabaseService
                .from('calls')
                .select('*')
                .eq('campaign_id', campaignId);
            if (callsError) {
                throw new Error(`Failed to fetch calls: ${callsError.message}`);
            }
            const metrics = this.calculateCampaignMetrics(leads || [], calls || []);
            const transformedLeads = (leads || []).map(lead => ({
                id: lead.id,
                firstName: lead.first_name,
                lastName: lead.last_name,
                phone: lead.phone,
                email: lead.email,
                company: lead.company,
                title: lead.job_title,
                customFields: lead.custom_fields || {},
                status: lead.call_status,
                callAttempts: lead.call_attempts || 0,
                lastCallAt: lead.last_call_at,
                nextCallAt: lead.next_call_at
            }));
            let phoneNumbers = [];
            let phoneNumberDetails = [];
            if (this.vapiClient && campaign.phone_number_id) {
                try {
                    const response = await this.vapiClient.get('/phone-number');
                    const allNumbers = response.data;
                    const campaignNumber = allNumbers.find((n) => n.id === campaign.phone_number_id);
                    if (campaignNumber) {
                        phoneNumbers = [campaignNumber.number];
                        phoneNumberDetails = [{
                                id: campaignNumber.id,
                                number: campaignNumber.number,
                                name: campaignNumber.name || 'Primary',
                                provider: campaignNumber.provider
                            }];
                    }
                }
                catch (error) {
                    console.warn('⚠️ Could not fetch VAPI phone numbers:', error);
                }
            }
            let assistantName = 'AI Assistant';
            let assistantDetails = null;
            if (this.vapiClient && campaign.assistant_id) {
                try {
                    const response = await this.vapiClient.get('/assistant');
                    const allAssistants = response.data;
                    const assistant = allAssistants.find((a) => a.id === campaign.assistant_id);
                    if (assistant) {
                        assistantName = assistant.name || 'AI Assistant';
                        assistantDetails = assistant;
                    }
                }
                catch (error) {
                    console.warn('⚠️ Could not fetch VAPI assistants:', error);
                }
            }
            return {
                id: campaign.id,
                organizationId: this.organizationId,
                name: campaign.name,
                description: campaign.description,
                status: campaign.status,
                assistantId: campaign.assistant_id,
                assistantName,
                assistantDetails,
                phoneNumberId: campaign.phone_number_id,
                phoneNumbers,
                phoneNumberDetails,
                leads: transformedLeads,
                schedule: campaign.settings?.schedule,
                maxRetries: campaign.settings?.maxRetries || 3,
                retryDelay: campaign.settings?.retryDelay || 24,
                metrics
            };
        }
        catch (error) {
            console.error('❌ Error getting campaign dashboard:', error);
            throw error;
        }
    }
    async getCampaignMetrics(campaignId) {
        try {
            const { data: leads } = await supabase_client_1.supabaseService
                .from('leads')
                .select('*')
                .eq('campaign_id', campaignId);
            const { data: calls } = await supabase_client_1.supabaseService
                .from('calls')
                .select('*')
                .eq('campaign_id', campaignId);
            return this.calculateCampaignMetrics(leads || [], calls || []);
        }
        catch (error) {
            console.error('❌ Error getting campaign metrics:', error);
            throw error;
        }
    }
    async updateCampaignMetrics(campaignId) {
        try {
            const metrics = await this.getCampaignMetrics(campaignId);
            await supabase_client_1.supabaseService
                .from('campaigns')
                .update({
                total_leads: metrics.totalLeads,
                calls_completed: metrics.callsCompleted,
                total_calls: metrics.callsAttempted,
                successful_calls: metrics.positiveOutcomes,
                total_cost: metrics.totalCost,
                total_duration: metrics.averageDuration * metrics.callsConnected,
                updated_at: new Date().toISOString()
            })
                .eq('id', campaignId);
        }
        catch (error) {
            console.error('❌ Error updating campaign metrics:', error);
        }
    }
    calculateCampaignMetrics(leads, calls) {
        const totalLeads = leads.length;
        const callsAttempted = calls.length;
        const callsConnected = calls.filter(call => ['completed', 'connected'].includes(call.status)).length;
        const callsCompleted = calls.filter(call => call.status === 'completed').length;
        const connectionRate = callsAttempted > 0 ? (callsConnected / callsAttempted) * 100 : 0;
        const completionRate = totalLeads > 0 ? (callsCompleted / totalLeads) * 100 : 0;
        const totalDuration = calls.reduce((sum, call) => sum + (call.duration || 0), 0);
        const averageDuration = callsConnected > 0 ? totalDuration / callsConnected : 0;
        const totalCost = calls.reduce((sum, call) => sum + (call.cost || 0), 0);
        const positiveOutcomes = calls.filter(call => ['interested', 'converted', 'callback'].includes(call.outcome)).length;
        const conversionRate = callsAttempted > 0 ? (positiveOutcomes / callsAttempted) * 100 : 0;
        const activeCalls = calls.filter(call => ['queued', 'ringing', 'in-progress'].includes(call.status)).length;
        const today = new Date().toISOString().split('T')[0];
        const callsToday = calls.filter(call => call.started_at?.startsWith(today)).length;
        const leadsRemaining = leads.filter(lead => ['pending', 'no_answer', 'busy'].includes(lead.call_status)).length;
        return {
            totalLeads,
            callsAttempted,
            callsConnected,
            callsCompleted,
            connectionRate: Math.round(connectionRate * 100) / 100,
            completionRate: Math.round(completionRate * 100) / 100,
            averageDuration: Math.round(averageDuration),
            totalCost: Math.round(totalCost * 100) / 100,
            positiveOutcomes,
            conversionRate: Math.round(conversionRate * 100) / 100,
            activeCalls,
            callsToday,
            leadsRemaining
        };
    }
    async pauseCampaign(campaignId) {
        try {
            await supabase_client_1.supabaseService
                .from('campaigns')
                .update({
                status: 'paused',
                updated_at: new Date().toISOString()
            })
                .eq('id', campaignId)
                .eq('organization_id', this.organizationId);
            console.log('⏸️ Campaign paused:', campaignId);
        }
        catch (error) {
            console.error('❌ Error pausing campaign:', error);
            throw error;
        }
    }
    async resumeCampaign(campaignId) {
        try {
            await supabase_client_1.supabaseService
                .from('campaigns')
                .update({
                status: 'active',
                updated_at: new Date().toISOString()
            })
                .eq('id', campaignId)
                .eq('organization_id', this.organizationId);
            console.log('▶️ Campaign resumed:', campaignId);
            this.processCampaignCalls(campaignId);
        }
        catch (error) {
            console.error('❌ Error resuming campaign:', error);
            throw error;
        }
    }
    async getLiveCampaignData(campaignId) {
        try {
            const { data: activeCalls } = await supabase_client_1.supabaseService
                .from('calls')
                .select(`
          *,
          leads(first_name, last_name, phone, company)
        `)
                .eq('campaign_id', campaignId)
                .in('status', ['pending', 'queued', 'ringing', 'in-progress'])
                .order('started_at', { ascending: false });
            const { data: recentCalls } = await supabase_client_1.supabaseService
                .from('calls')
                .select(`
          *,
          leads(first_name, last_name, phone, company)
        `)
                .eq('campaign_id', campaignId)
                .eq('status', 'completed')
                .order('ended_at', { ascending: false })
                .limit(10);
            const metrics = await this.getCampaignMetrics(campaignId);
            return {
                activeCalls: activeCalls || [],
                recentCalls: recentCalls || [],
                metrics
            };
        }
        catch (error) {
            console.error('❌ Error getting live campaign data:', error);
            throw error;
        }
    }
    async getVAPICallData(vapiCallId) {
        try {
            if (!this.vapiService) {
                return null;
            }
            return await this.vapiService.getCall(vapiCallId);
        }
        catch (error) {
            console.error('❌ Error getting VAPI call data:', error);
            return null;
        }
    }
}
exports.VAPIOutboundService = VAPIOutboundService;
