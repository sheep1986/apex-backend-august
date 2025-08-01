"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SheetSyncService = void 0;
const googleapis_1 = require("googleapis");
const supabase_client_1 = require("./supabase-client");
class SheetSyncService {
    constructor() {
        this.auth = new googleapis_1.google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        this.sheets = googleapis_1.google.sheets({ version: 'v4', auth: this.auth });
    }
    async createClientTemplate(organizationId, clientName) {
        const spreadsheet = await this.sheets.spreadsheets.create({
            requestBody: {
                properties: {
                    title: `${clientName} - AI Calling Data`,
                },
                sheets: [
                    {
                        properties: { title: 'Overview' },
                        data: [{
                                rowData: [
                                    { values: [{ userEnteredValue: { stringValue: 'AI Calling Platform Data' } }] },
                                    { values: [{ userEnteredValue: { stringValue: `Client: ${clientName}` } }] },
                                    { values: [{ userEnteredValue: { stringValue: `Last Updated: ${new Date().toISOString()}` } }] },
                                ],
                            }],
                    },
                    {
                        properties: { title: 'Interested Leads' },
                        data: [{
                                rowData: [{
                                        values: [
                                            { userEnteredValue: { stringValue: 'Lead ID' } },
                                            { userEnteredValue: { stringValue: 'Name' } },
                                            { userEnteredValue: { stringValue: 'Phone' } },
                                            { userEnteredValue: { stringValue: 'Email' } },
                                            { userEnteredValue: { stringValue: 'Interest Level' } },
                                            { userEnteredValue: { stringValue: 'Call Date' } },
                                            { userEnteredValue: { stringValue: 'Recording URL' } },
                                            { userEnteredValue: { stringValue: 'Notes' } },
                                            { userEnteredValue: { stringValue: 'Next Action' } },
                                        ],
                                    }],
                            }],
                    },
                    {
                        properties: { title: 'Daily Summary' },
                        data: [{
                                rowData: [{
                                        values: [
                                            { userEnteredValue: { stringValue: 'Date' } },
                                            { userEnteredValue: { stringValue: 'Total Calls' } },
                                            { userEnteredValue: { stringValue: 'Interested' } },
                                            { userEnteredValue: { stringValue: 'Not Interested' } },
                                            { userEnteredValue: { stringValue: 'No Answer' } },
                                            { userEnteredValue: { stringValue: 'Conversion Rate' } },
                                            { userEnteredValue: { stringValue: 'Avg Call Duration' } },
                                        ],
                                    }],
                            }],
                    },
                    {
                        properties: { title: 'Analytics' },
                    },
                ],
            },
        });
        await supabase_client_1.supabase.from('sheet_templates').insert({
            organization_id: organizationId,
            spreadsheet_id: spreadsheet.data.spreadsheetId,
            spreadsheet_url: spreadsheet.data.spreadsheetUrl,
            created_at: new Date().toISOString(),
        });
        return spreadsheet.data;
    }
    async syncInterestedLeads(organizationId) {
        const { data: template } = await supabase_client_1.supabase
            .from('sheet_templates')
            .select('*')
            .eq('organization_id', organizationId)
            .single();
        if (!template)
            return;
        const { data: leads } = await supabase_client_1.supabase
            .from('calls')
            .select('*')
            .eq('organization_id', organizationId)
            .in('disposition', ['interested', 'very_interested', 'callback_requested'])
            .gte('created_at', template.last_sync || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .order('created_at', { ascending: false });
        if (!leads || leads.length === 0)
            return;
        const values = leads.map(lead => [
            lead.id,
            lead.contact_name,
            lead.phone_number,
            lead.email || '',
            lead.disposition,
            new Date(lead.created_at).toLocaleString(),
            lead.recording_url || '',
            lead.ai_summary || '',
            lead.next_action || '',
        ]);
        await this.sheets.spreadsheets.values.append({
            spreadsheetId: template.spreadsheet_id,
            range: 'Interested Leads!A2:I',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values },
        });
        await supabase_client_1.supabase
            .from('sheet_templates')
            .update({ last_sync: new Date().toISOString() })
            .eq('id', template.id);
    }
    async generateDailySummary(organizationId, date) {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        const { data: summary } = await supabase_client_1.supabase
            .from('calls')
            .select('disposition, duration')
            .eq('organization_id', organizationId)
            .gte('created_at', startOfDay.toISOString())
            .lte('created_at', endOfDay.toISOString());
        const stats = {
            total: summary?.length || 0,
            interested: summary?.filter(c => c.disposition === 'interested').length || 0,
            notInterested: summary?.filter(c => c.disposition === 'not_interested').length || 0,
            noAnswer: summary?.filter(c => c.disposition === 'no_answer').length || 0,
            avgDuration: summary?.reduce((acc, c) => acc + (c.duration || 0), 0) / (summary?.length || 1),
        };
        const conversionRate = stats.total > 0 ? (stats.interested / stats.total * 100).toFixed(2) : '0';
        const { data: template } = await supabase_client_1.supabase
            .from('sheet_templates')
            .select('spreadsheet_id')
            .eq('organization_id', organizationId)
            .single();
        if (template) {
            await this.sheets.spreadsheets.values.append({
                spreadsheetId: template.spreadsheet_id,
                range: 'Daily Summary!A2:G',
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [[
                            date.toLocaleDateString(),
                            stats.total,
                            stats.interested,
                            stats.notInterested,
                            stats.noAnswer,
                            `${conversionRate}%`,
                            `${Math.round(stats.avgDuration / 60)} min`,
                        ]],
                },
            });
        }
    }
    async archiveOldCalls(daysToKeep = 7) {
        const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
        const { data: callsToArchive } = await supabase_client_1.supabase
            .from('calls')
            .select('*')
            .lt('created_at', cutoffDate.toISOString())
            .limit(1000);
        if (!callsToArchive || callsToArchive.length === 0)
            return;
        for (const call of callsToArchive) {
            await this.uploadToArchive(call);
            await supabase_client_1.supabase
                .from('calls')
                .delete()
                .eq('id', call.id);
        }
    }
    async uploadToArchive(call) {
    }
}
exports.SheetSyncService = SheetSyncService;
