"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const lead_import_service_1 = require("../services/lead-import-service");
const auth_1 = require("../middleware/auth");
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const supabase = supabase_client_1.default;
const router = express_1.default.Router();
const leadImportService = new lead_import_service_1.LeadImportService();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only CSV files are allowed'));
        }
    },
});
const CAMPAIGN_CONFIGS = {
    b2c: {
        requiredFields: ['firstName', 'phone'],
        optionalFields: ['lastName', 'email', 'address', 'age', 'interests'],
        validationRules: {
            phone: { required: true, format: 'any' },
            email: { required: false, format: 'email' },
            age: { min: 18, max: 100 },
            consent: { required: true }
        },
        customFields: ['age', 'interests', 'preferredContact', 'consent'],
        processingRules: {
            skipDuplicates: true,
            updateExisting: false,
            requireConsent: true,
            dncCheck: true
        }
    },
    b2b: {
        requiredFields: ['firstName', 'lastName', 'company', 'phone'],
        optionalFields: ['email', 'title', 'industry', 'companySize', 'budget', 'decisionMaker'],
        validationRules: {
            phone: { required: true, format: 'business' },
            email: { required: true, format: 'email' },
            company: { required: true, minLength: 2 },
            title: { required: false, businessTitles: true }
        },
        customFields: ['industry', 'companySize', 'budget', 'decisionMaker', 'painPoints'],
        processingRules: {
            skipDuplicates: true,
            updateExisting: true,
            requireConsent: false,
            dncCheck: false,
            enrichData: true
        }
    }
};
router.post('/import', auth_1.authenticateUser, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const { campaignId, skipDuplicates, updateExisting } = req.body;
        const accountId = req.user?.organizationId;
        if (!accountId) {
            return res.status(400).json({ error: 'Organization ID is required' });
        }
        const result = await leadImportService.processCSVUpload(req.file.buffer, accountId, campaignId || undefined, {
            skipDuplicates: skipDuplicates === 'true',
            updateExisting: updateExisting === 'true',
        });
        res.json({
            success: result.success,
            importId: result.importId,
            totalRows: result.totalRows,
            importedRows: result.importedRows,
            errors: result.errors,
            warnings: result.warnings,
            message: result.success
                ? `Successfully imported ${result.importedRows} leads`
                : `Import completed with ${result.errors.length} errors`
        });
    }
    catch (error) {
        console.error('Lead import error:', error);
        res.status(500).json({
            error: 'Import failed',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/template', auth_1.authenticateUser, (req, res) => {
    try {
        const csvContent = leadImportService.generateCSVTemplate();
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="leads_template.csv"');
        res.send(csvContent);
    }
    catch (error) {
        console.error('Template generation error:', error);
        res.status(500).json({ error: 'Failed to generate template' });
    }
});
router.get('/export', auth_1.authenticateUser, async (req, res) => {
    try {
        const { data: leads, error } = await supabase
            .from('leads')
            .select('*')
            .eq('organization_id', req.user?.organizationId);
        if (error) {
            throw error;
        }
        const headers = [
            'ID', 'First Name', 'Last Name', 'Email', 'Phone', 'Company',
            'Title', 'Status', 'Priority', 'Source', 'Created At'
        ];
        const csvRows = leads?.map(lead => [
            lead.id,
            lead.first_name,
            lead.last_name,
            lead.email,
            lead.phone,
            lead.company,
            lead.title,
            lead.status,
            lead.priority,
            lead.source,
            lead.created_at
        ]) || [];
        const csvContent = [headers, ...csvRows]
            .map(row => row.map(field => `"${field || ''}"`).join(','))
            .join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="leads-export.csv"');
        res.send(csvContent);
    }
    catch (error) {
        console.error('❌ Error exporting leads:', error);
        res.status(500).json({
            error: 'Failed to export leads',
            message: error.message
        });
    }
});
router.get('/', auth_1.authenticateUser, async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '', status = 'all', campaign = 'all', priority = 'all', source = 'all', sortBy = 'created_at', sortOrder = 'desc' } = req.query;
        const offset = (Number(page) - 1) * Number(limit);
        let query = supabase
            .from('leads')
            .select(`
        *,
        campaigns(name, id),
        users(first_name, last_name)
      `)
            .eq('organization_id', req.user?.organizationId);
        if (search) {
            query = query.or(`
        first_name.ilike.%${search}%,
        last_name.ilike.%${search}%,
        phone.ilike.%${search}%,
        email.ilike.%${search}%,
        company.ilike.%${search}%
      `);
        }
        if (status !== 'all') {
            query = query.eq('status', status);
        }
        if (campaign !== 'all') {
            query = query.eq('campaign_id', campaign);
        }
        if (priority !== 'all') {
            query = query.eq('priority', priority);
        }
        if (source !== 'all') {
            query = query.eq('source', source);
        }
        query = query.order(sortBy, { ascending: sortOrder === 'asc' });
        query = query.range(offset, offset + Number(limit) - 1);
        const { data: leads, error, count } = await query;
        if (error) {
            throw error;
        }
        const transformedLeads = leads?.map(lead => ({
            id: lead.id,
            firstName: lead.first_name,
            lastName: lead.last_name,
            email: lead.email,
            phone: lead.phone,
            company: lead.company,
            title: lead.job_title,
            status: lead.qualification_status || 'new',
            priority: lead.lead_quality || 'medium',
            source: lead.lead_source,
            campaign: lead.campaigns?.name || 'General',
            tags: [],
            lastContacted: lead.last_call_at,
            nextFollowUp: lead.next_call_at,
            notes: '',
            customFields: lead.custom_fields || {},
            campaignType: 'b2b',
            outcome: lead.call_status,
            assignedTo: lead.uploaded_by,
            nextAction: '',
            lastInteraction: lead.last_call_at,
            value: lead.conversion_value,
            interestLevel: lead.score,
            callDuration: 0,
            organizationId: lead.organization_id,
            createdAt: lead.created_at,
            updatedAt: lead.updated_at
        })) || [];
        res.json({
            leads: transformedLeads,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: count || 0,
                totalPages: Math.ceil((count || 0) / Number(limit))
            }
        });
    }
    catch (error) {
        console.error('❌ Error fetching leads:', error);
        res.status(500).json({
            error: 'Failed to fetch leads',
            message: error.message
        });
    }
});
router.get('/:id', auth_1.authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const { data: lead, error } = await supabase
            .from('leads')
            .select(`
        *,
        campaigns(name, id),
        users(first_name, last_name)
      `)
            .eq('id', id)
            .eq('organization_id', req.user?.organizationId)
            .single();
        if (error || !lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }
        const transformedLead = {
            id: lead.id,
            firstName: lead.first_name,
            lastName: lead.last_name,
            email: lead.email,
            phone: lead.phone,
            company: lead.company,
            title: lead.job_title,
            status: lead.qualification_status || 'new',
            priority: lead.lead_quality || 'medium',
            source: lead.lead_source,
            campaign: lead.campaigns?.name || 'General',
            tags: [],
            lastContacted: lead.last_call_at,
            nextFollowUp: lead.next_call_at,
            notes: '',
            customFields: lead.custom_fields || {},
            campaignType: 'b2b',
            outcome: lead.call_status,
            assignedTo: lead.uploaded_by,
            nextAction: '',
            lastInteraction: lead.last_call_at,
            value: lead.conversion_value,
            interestLevel: lead.score,
            callDuration: 0,
            organizationId: lead.organization_id,
            createdAt: lead.created_at,
            updatedAt: lead.updated_at
        };
        res.json(transformedLead);
    }
    catch (error) {
        console.error('❌ Error fetching lead details:', error);
        res.status(500).json({
            error: 'Failed to fetch lead details',
            message: error.message
        });
    }
});
router.post('/', auth_1.authenticateUser, async (req, res) => {
    try {
        const leadData = req.body;
        if (!leadData.firstName || !leadData.lastName || !leadData.phone) {
            return res.status(400).json({
                error: 'First name, last name, and phone are required'
            });
        }
        const { data: lead, error } = await supabase
            .from('leads')
            .insert([{
                organization_id: req.user?.organizationId,
                first_name: leadData.firstName,
                last_name: leadData.lastName,
                email: leadData.email,
                phone: leadData.phone,
                company: leadData.company,
                title: leadData.title,
                status: leadData.status || 'new',
                priority: leadData.priority || 'medium',
                source: leadData.source || 'Manual Entry',
                campaign_id: leadData.campaignId,
                tags: leadData.tags || [],
                custom_fields: leadData.customFields || {},
                notes: leadData.notes,
                assigned_to: leadData.assignedTo,
                created_by: req.user?.id
            }])
            .select()
            .single();
        if (error) {
            throw error;
        }
        res.status(201).json({
            id: lead.id,
            firstName: lead.first_name,
            lastName: lead.last_name,
            email: lead.email,
            phone: lead.phone,
            company: lead.company,
            title: lead.title,
            status: lead.status,
            priority: lead.priority,
            source: lead.source,
            organizationId: lead.organization_id,
            createdAt: lead.created_at,
            updatedAt: lead.updated_at
        });
    }
    catch (error) {
        console.error('❌ Error creating lead:', error);
        res.status(500).json({
            error: 'Failed to create lead',
            message: error.message
        });
    }
});
router.put('/:id', auth_1.authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const leadData = req.body;
        const { data: lead, error } = await supabase
            .from('leads')
            .update({
            first_name: leadData.firstName,
            last_name: leadData.lastName,
            email: leadData.email,
            phone: leadData.phone,
            company: leadData.company,
            title: leadData.title,
            status: leadData.status,
            priority: leadData.priority,
            source: leadData.source,
            campaign_id: leadData.campaignId,
            tags: leadData.tags,
            custom_fields: leadData.customFields,
            notes: leadData.notes,
            assigned_to: leadData.assignedTo,
            updated_at: new Date().toISOString()
        })
            .eq('id', id)
            .eq('organization_id', req.user?.organizationId)
            .select()
            .single();
        if (error) {
            throw error;
        }
        if (!lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }
        res.json({
            id: lead.id,
            firstName: lead.first_name,
            lastName: lead.last_name,
            email: lead.email,
            phone: lead.phone,
            company: lead.company,
            title: lead.title,
            status: lead.status,
            priority: lead.priority,
            source: lead.source,
            organizationId: lead.organization_id,
            createdAt: lead.created_at,
            updatedAt: lead.updated_at
        });
    }
    catch (error) {
        console.error('❌ Error updating lead:', error);
        res.status(500).json({
            error: 'Failed to update lead',
            message: error.message
        });
    }
});
router.delete('/:id', auth_1.authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('leads')
            .delete()
            .eq('id', id)
            .eq('organization_id', req.user?.organizationId);
        if (error) {
            throw error;
        }
        res.json({ message: 'Lead deleted successfully' });
    }
    catch (error) {
        console.error('❌ Error deleting lead:', error);
        res.status(500).json({
            error: 'Failed to delete lead',
            message: error.message
        });
    }
});
router.get('/imports/history', auth_1.authenticateUser, async (req, res) => {
    try {
        const accountId = req.user?.organizationId;
        const { limit = 10 } = req.query;
        const imports = await leadImportService.getImportHistory(accountId, Number(limit));
        res.json({ imports });
    }
    catch (error) {
        console.error('Get import history error:', error);
        res.status(500).json({ error: 'Failed to fetch import history' });
    }
});
router.get('/stats/overview', auth_1.authenticateUser, async (req, res) => {
    try {
        const { count: totalLeads } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', req.user?.organizationId);
        const { data: statusStats } = await supabase
            .from('leads')
            .select('status')
            .eq('organization_id', req.user?.organizationId);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const { count: recentLeads } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', req.user?.organizationId)
            .gte('created_at', thirtyDaysAgo.toISOString());
        const statusDistribution = statusStats?.reduce((acc, lead) => {
            acc[lead.status] = (acc[lead.status] || 0) + 1;
            return acc;
        }, {}) || {};
        res.json({
            totalLeads: totalLeads || 0,
            recentLeads: recentLeads || 0,
            statusDistribution,
            conversionRate: 0,
            averageValue: 0
        });
    }
    catch (error) {
        console.error('❌ Error fetching lead stats:', error);
        res.status(500).json({
            error: 'Failed to fetch lead statistics',
            message: error.message
        });
    }
});
router.post('/upload-preview', auth_1.authenticateUser, upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'No CSV file provided' });
        }
        console.log('📁 Processing CSV preview for file:', file.originalname);
        const csvContent = file.buffer.toString('utf-8');
        const lines = csvContent.split('\n').filter(line => line.trim());
        if (lines.length === 0) {
            return res.status(400).json({ error: 'CSV file is empty' });
        }
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        console.log('📋 CSV Headers:', headers);
        const dataRows = lines.slice(1);
        const preview = [];
        let validLeads = 0;
        let invalidLeads = 0;
        let duplicates = 0;
        const previewLimit = Math.min(10, dataRows.length);
        for (let i = 0; i < previewLimit; i++) {
            const row = dataRows[i];
            if (!row.trim())
                continue;
            const values = row.split(',').map(v => v.trim().replace(/"/g, ''));
            const lead = {};
            headers.forEach((header, index) => {
                const value = values[index] || '';
                switch (header.toLowerCase()) {
                    case 'first name':
                    case 'firstname':
                    case 'first_name':
                        lead.firstName = value;
                        break;
                    case 'last name':
                    case 'lastname':
                    case 'last_name':
                        lead.lastName = value;
                        break;
                    case 'phone':
                    case 'phone number':
                    case 'phone_number':
                        lead.phoneNumber = value;
                        break;
                    case 'email':
                    case 'email address':
                    case 'email_address':
                        lead.email = value;
                        break;
                    case 'company':
                    case 'company name':
                    case 'company_name':
                        lead.company = value;
                        break;
                    case 'timezone':
                    case 'time zone':
                    case 'time_zone':
                        lead.timezone = value || 'EST';
                        break;
                    default:
                        lead.customFields = lead.customFields || {};
                        lead.customFields[header] = value;
                        break;
                }
            });
            if (lead.firstName && lead.phoneNumber) {
                lead.status = 'valid';
                validLeads++;
            }
            else {
                lead.status = 'invalid';
                invalidLeads++;
            }
            preview.push(lead);
        }
        const totalLeads = dataRows.length;
        console.log('✅ CSV Preview processed:', {
            totalLeads,
            validLeads,
            invalidLeads,
            previewCount: preview.length
        });
        res.json({
            totalLeads,
            validLeads,
            invalidLeads,
            duplicates,
            preview,
            fileName: file.originalname,
            headers
        });
    }
    catch (error) {
        console.error('❌ CSV preview error:', error);
        res.status(500).json({
            error: 'Failed to preview CSV file',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.post('/upload', auth_1.authenticateUser, upload.single('csvFile'), async (req, res) => {
    try {
        const { campaignId, campaignType = 'b2b', options = {} } = req.body;
        const file = req.file;
        const accountId = req.user?.organizationId;
        if (!file) {
            return res.status(400).json({ error: 'No CSV file provided' });
        }
        const config = CAMPAIGN_CONFIGS[campaignType];
        if (!config) {
            return res.status(400).json({ error: 'Invalid campaign type. Must be "b2c" or "b2b"' });
        }
        const importOptions = {
            ...config.processingRules,
            ...options,
            customFieldMapping: config.customFields,
            validationRules: config.validationRules
        };
        const result = await leadImportService.processCSVUpload(file.buffer, accountId, campaignId, importOptions);
        res.json({
            success: result.success,
            importId: result.importId,
            stats: {
                totalRows: result.totalRows,
                importedRows: result.importedRows,
                errorCount: result.errors.length,
                warningCount: result.warnings.length
            },
            errors: result.errors.slice(0, 10),
            warnings: result.warnings.slice(0, 10),
            campaignType,
            processingTime: 0
        });
    }
    catch (error) {
        console.error('Lead import error:', error);
        res.status(500).json({
            error: 'Import failed',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/template/:campaignType', auth_1.authenticateUser, (req, res) => {
    const { campaignType } = req.params;
    const config = CAMPAIGN_CONFIGS[campaignType];
    if (!config) {
        return res.status(400).json({ error: 'Invalid campaign type. Must be "b2c" or "b2b"' });
    }
    const headers = [...config.requiredFields, ...config.optionalFields];
    const sampleData = generateSampleData(campaignType, headers);
    const csvContent = [headers.join(','), sampleData.join(',')].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${campaignType}_leads_template.csv"`);
    res.send(csvContent);
});
router.get('/imports', auth_1.authenticateUser, async (req, res) => {
    try {
        const { limit = 20, offset = 0, status } = req.query;
        const accountId = req.user?.organizationId;
        const history = await leadImportService.getImportHistory(accountId, parseInt(limit));
        res.json({
            imports: history,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                total: history.length
            }
        });
    }
    catch (error) {
        console.error('Error fetching import history:', error);
        res.status(500).json({ error: 'Failed to fetch import history' });
    }
});
router.get('/stats', auth_1.authenticateUser, async (req, res) => {
    try {
        const { campaignId, dateRange, campaignType } = req.query;
        const accountId = req.user?.organizationId;
        const stats = await leadImportService.getLeadStats(accountId, {
            campaignId: campaignId,
            dateRange: dateRange,
            campaignType: campaignType
        });
        res.json(stats);
    }
    catch (error) {
        console.error('Error fetching lead stats:', error);
        res.status(500).json({ error: 'Failed to fetch lead statistics' });
    }
});
function generateSampleData(campaignType, headers) {
    const samples = {
        b2c: {
            firstName: 'John',
            lastName: 'Doe',
            phone: '+1 (555) 123-4567',
            email: 'john.doe@example.com',
            age: '35',
            interests: 'Technology,Sports',
            preferredContact: 'phone',
            consent: 'yes'
        },
        b2b: {
            firstName: 'Sarah',
            lastName: 'Johnson',
            company: 'TechCorp Solutions',
            title: 'VP of Sales',
            phone: '+1 (555) 987-6543',
            email: 'sarah.johnson@techcorp.com',
            industry: 'Technology',
            companySize: '500-1000',
            budget: '$50k-$100k',
            decisionMaker: 'yes',
            painPoints: 'Lead Generation,Process Automation'
        }
    };
    const sample = samples[campaignType] || samples.b2b;
    return headers.map(header => sample[header] || '');
}
exports.default = router;
