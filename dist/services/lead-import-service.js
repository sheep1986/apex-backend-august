"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeadImportService = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const csv = __importStar(require("csv-parser"));
const stream_1 = require("stream");
const uuid_1 = require("uuid");
const supabase_client_1 = __importDefault(require("./supabase-client"));
const csv_parse_1 = require("csv-parse");
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
class LeadImportService {
    constructor() {
        const supabaseUrl = process.env.SUPABASE_URL || 'https://mock-development.supabase.co';
        const supabaseKey = process.env.SUPABASE_ANON_KEY || 'mock-development-key';
        try {
            this.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
        }
        catch (error) {
            console.warn('Supabase client initialization failed - using mock mode for development');
            this.supabase = null;
        }
    }
    async processCSVUpload(fileBuffer, accountId, campaignId, options = {}) {
        const importId = (0, uuid_1.v4)();
        const errors = [];
        const warnings = [];
        let totalRows = 0;
        let importedRows = 0;
        try {
            const leads = await this.parseCSV(fileBuffer);
            totalRows = leads.length;
            const campaignType = options.campaignType || 'b2b';
            const config = CAMPAIGN_CONFIGS[campaignType];
            const validationErrors = this.validateLeadsWithConfig(leads, config);
            if (validationErrors.length > 0) {
                errors.push(`Validation failed: ${validationErrors.length} errors found`);
                validationErrors.forEach(error => {
                    errors.push(`Row ${error.row}: ${error.field} - ${error.message}`);
                });
            }
            if (options.skipDuplicates) {
                const duplicateCheck = await this.checkForDuplicates(leads, accountId);
                if (duplicateCheck.length > 0) {
                    warnings.push(`Found ${duplicateCheck.length} potential duplicates`);
                }
            }
            if (errors.length === 0) {
                const importResult = await this.importLeadsToDatabase(leads, accountId, campaignId, importId, options, campaignType);
                importedRows = importResult.importedRows;
                errors.push(...importResult.errors);
                warnings.push(...importResult.warnings);
            }
            await this.storeImportRecord({
                importId,
                accountId,
                campaignId,
                totalRows,
                importedRows,
                errors: errors.length,
                warnings: warnings.length,
                status: errors.length > 0 ? 'failed' : 'completed',
                campaignType
            });
        }
        catch (error) {
            errors.push(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        return {
            success: errors.length === 0,
            totalRows,
            importedRows,
            errors,
            warnings,
            importId
        };
    }
    async validateCSVOnly(fileBuffer, validationRules, requiredFields) {
        const leads = await this.parseCSV(fileBuffer);
        const errors = [];
        const warnings = [];
        let validRows = 0;
        leads.forEach((lead, index) => {
            const row = index + 2;
            let rowValid = true;
            requiredFields.forEach(field => {
                if (!lead[field]?.trim()) {
                    errors.push({
                        row,
                        field,
                        message: `${field} is required`,
                        value: lead[field] || ''
                    });
                    rowValid = false;
                }
            });
            if (validationRules) {
                Object.entries(validationRules).forEach(([field, rule]) => {
                    const value = lead[field];
                    if (rule.required && !value?.trim()) {
                        errors.push({
                            row,
                            field,
                            message: `${field} is required`,
                            value: value || ''
                        });
                        rowValid = false;
                    }
                    if (value && rule.format === 'email' && !this.isValidEmail(value)) {
                        errors.push({
                            row,
                            field,
                            message: 'Invalid email format',
                            value
                        });
                        rowValid = false;
                    }
                    if (value && rule.format === 'business' && !this.isValidBusinessPhone(value)) {
                        errors.push({
                            row,
                            field,
                            message: 'Invalid business phone format',
                            value
                        });
                        rowValid = false;
                    }
                });
            }
            if (rowValid) {
                validRows++;
            }
        });
        return {
            totalRows: leads.length,
            validRows,
            errors,
            warnings,
            preview: leads.slice(0, 5)
        };
    }
    async getLeadStats(accountId, filters = {}) {
        let query = this.supabase
            .from('leads')
            .select('*')
            .eq('account_id', accountId);
        if (filters.campaignId) {
            query = query.eq('campaign_id', filters.campaignId);
        }
        if (filters.dateRange) {
            const [start, end] = filters.dateRange.split(' to ');
            query = query
                .gte('created_at', start)
                .lte('created_at', end);
        }
        const { data: leads, error } = await query;
        if (error) {
            throw new Error(`Failed to fetch lead stats: ${error.message}`);
        }
        const total = leads?.length || 0;
        const byStatus = {};
        const byCampaign = {};
        const byType = { b2c: 0, b2b: 0 };
        let convertedCount = 0;
        let totalValue = 0;
        leads?.forEach(lead => {
            byStatus[lead.status] = (byStatus[lead.status] || 0) + 1;
            if (lead.campaign_id) {
                byCampaign[lead.campaign_id] = (byCampaign[lead.campaign_id] || 0) + 1;
            }
            if (lead.company) {
                byType.b2b++;
            }
            else {
                byType.b2c++;
            }
            if (lead.status === 'converted') {
                convertedCount++;
                totalValue += lead.conversion_value || 0;
            }
        });
        const { data: recentActivity } = await this.supabase
            .from('leads')
            .select('*')
            .eq('account_id', accountId)
            .order('updated_at', { ascending: false })
            .limit(10);
        return {
            total,
            byStatus,
            byCampaign,
            byType,
            conversionRate: total > 0 ? (convertedCount / total) * 100 : 0,
            averageValue: convertedCount > 0 ? totalValue / convertedCount : 0,
            recentActivity: recentActivity || []
        };
    }
    validateLeadsWithConfig(leads, config) {
        const errors = [];
        leads.forEach((lead, index) => {
            const row = index + 2;
            config.requiredFields.forEach((field) => {
                if (!lead[field]?.trim()) {
                    errors.push({
                        row,
                        field,
                        message: `${field} is required`,
                        value: lead[field] || ''
                    });
                }
            });
            Object.entries(config.validationRules).forEach(([field, rule]) => {
                const value = lead[field];
                if (rule.required && !value?.trim()) {
                    errors.push({
                        row,
                        field,
                        message: `${field} is required`,
                        value: value || ''
                    });
                }
                if (value && rule.format === 'email' && !this.isValidEmail(value)) {
                    errors.push({
                        row,
                        field,
                        message: 'Invalid email format',
                        value
                    });
                }
                if (value && rule.format === 'business' && !this.isValidBusinessPhone(value)) {
                    errors.push({
                        row,
                        field,
                        message: 'Invalid business phone format',
                        value
                    });
                }
                if (value && rule.minLength && value.length < rule.minLength) {
                    errors.push({
                        row,
                        field,
                        message: `${field} must be at least ${rule.minLength} characters`,
                        value
                    });
                }
                if (value && rule.min && parseInt(value) < rule.min) {
                    errors.push({
                        row,
                        field,
                        message: `${field} must be at least ${rule.min}`,
                        value
                    });
                }
                if (value && rule.max && parseInt(value) > rule.max) {
                    errors.push({
                        row,
                        field,
                        message: `${field} must be at most ${rule.max}`,
                        value
                    });
                }
            });
        });
        return errors;
    }
    isValidBusinessPhone(phone) {
        const businessPhoneRegex = /^\+?1?\s*\(?[0-9]{3}\)?[\s.-]?[0-9]{3}[\s.-]?[0-9]{4}$/;
        return businessPhoneRegex.test(phone);
    }
    async parseCSV(fileBuffer) {
        return new Promise((resolve, reject) => {
            const results = [];
            const stream = stream_1.Readable.from(fileBuffer);
            stream
                .pipe(csv())
                .on('data', (data) => {
                const normalizedData = {
                    firstName: data['First Name'] || data['firstName'] || data['first_name'] || '',
                    lastName: data['Last Name'] || data['lastName'] || data['last_name'] || '',
                    email: data['Email'] || data['email'] || '',
                    phone: data['Phone'] || data['phone'] || data['Phone Number'] || '',
                    company: data['Company'] || data['company'] || '',
                    title: data['Title'] || data['title'] || data['Job Title'] || '',
                    status: data['Status'] || data['status'] || 'new',
                    priority: data['Priority'] || data['priority'] || 'medium',
                    source: data['Source'] || data['source'] || 'CSV Import',
                    campaign: data['Campaign'] || data['campaign'] || '',
                    tags: data['Tags'] || data['tags'] || '',
                    notes: data['Notes'] || data['notes'] || '',
                    customFields: {}
                };
                const standardFields = [
                    'First Name', 'firstName', 'first_name',
                    'Last Name', 'lastName', 'last_name',
                    'Email', 'email',
                    'Phone', 'phone', 'Phone Number',
                    'Company', 'company',
                    'Title', 'title', 'Job Title',
                    'Status', 'status',
                    'Priority', 'priority',
                    'Source', 'source',
                    'Campaign', 'campaign',
                    'Tags', 'tags',
                    'Notes', 'notes'
                ];
                Object.keys(data).forEach(key => {
                    if (!standardFields.includes(key) && data[key]) {
                        normalizedData.customFields[key] = data[key];
                    }
                });
                results.push(normalizedData);
            })
                .on('end', () => resolve(results))
                .on('error', reject);
        });
    }
    async checkForDuplicates(leads, accountId) {
        const phoneNumbers = leads
            .map(lead => this.normalizePhoneNumber(lead.phone))
            .filter(phone => phone);
        if (phoneNumbers.length === 0)
            return [];
        const { data: existingLeads, error } = await this.supabase
            .from('leads')
            .select('phone_number_formatted, first_name, last_name')
            .eq('account_id', accountId)
            .in('phone_number_formatted', phoneNumbers);
        if (error) {
            console.error('Error checking duplicates:', error);
            return [];
        }
        return existingLeads.map(lead => lead.phone_number_formatted);
    }
    async importLeadsToDatabase(leads, accountId, campaignId, importId, options, campaignType) {
        const errors = [];
        const warnings = [];
        let importedRows = 0;
        let leadOwnerId = null;
        if (campaignId) {
            try {
                const { data: campaign, error } = await this.supabase
                    .from('campaigns')
                    .select('created_by')
                    .eq('id', campaignId)
                    .single();
                if (!error && campaign?.created_by) {
                    leadOwnerId = campaign.created_by;
                    console.log(`📋 Setting lead owner to campaign creator: ${leadOwnerId}`);
                }
            }
            catch (error) {
                console.warn('Could not fetch campaign creator:', error);
            }
        }
        const batchSize = 100;
        for (let i = 0; i < leads.length; i += batchSize) {
            const batch = leads.slice(i, i + batchSize);
            try {
                const leadRecords = batch.map(lead => ({
                    id: (0, uuid_1.v4)(),
                    organization_id: accountId,
                    campaign_id: campaignId,
                    external_id: `${importId}_${i + batch.indexOf(lead)}`,
                    phone: lead.phone,
                    first_name: lead.firstName.trim(),
                    last_name: lead.lastName.trim(),
                    email: lead.email?.trim() || null,
                    company: lead.company?.trim() || null,
                    job_title: lead.title?.trim() || null,
                    custom_fields: lead.customFields,
                    status: lead.status?.toLowerCase() || 'new',
                    lead_source: lead.source || 'CSV Import',
                    uploaded_by: leadOwnerId,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }));
                const { error } = await this.supabase
                    .from('leads')
                    .insert(leadRecords);
                if (error) {
                    errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
                }
                else {
                    importedRows += batch.length;
                }
            }
            catch (error) {
                errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
        return { importedRows, errors, warnings };
    }
    async storeImportRecord(record) {
        try {
            await this.supabase
                .from('lead_imports')
                .insert([{
                    id: record.importId,
                    account_id: record.accountId,
                    campaign_id: record.campaignId,
                    total_rows: record.totalRows,
                    imported_rows: record.importedRows,
                    error_count: record.errors,
                    warning_count: record.warnings,
                    status: record.status,
                    campaign_type: record.campaignType,
                    created_at: new Date().toISOString()
                }]);
        }
        catch (error) {
            console.error('Error storing import record:', error);
        }
    }
    generateCSVTemplate() {
        const headers = [
            'First Name',
            'Last Name',
            'Email',
            'Phone',
            'Company',
            'Title',
            'Status',
            'Priority',
            'Source',
            'Campaign',
            'Tags',
            'Notes',
            'Industry',
            'Employee Count',
            'Website',
            'LinkedIn'
        ];
        const sampleData = [
            'John',
            'Smith',
            'john.smith@example.com',
            '+1 (555) 123-4567',
            'Example Corp',
            'CTO',
            'new',
            'high',
            'LinkedIn',
            'Q4 Campaign',
            'Tech,Enterprise',
            'Sample notes about this lead',
            'Technology',
            '500-1000',
            'https://example.com',
            'https://linkedin.com/in/johnsmith'
        ];
        return [headers.join(','), sampleData.join(',')].join('\n');
    }
    async exportLeadsToCSV(accountId, filters = {}) {
        let query = this.supabase
            .from('leads')
            .select('*')
            .eq('account_id', accountId);
        if (filters.campaignId) {
            query = query.eq('campaign_id', filters.campaignId);
        }
        if (filters.status) {
            query = query.eq('status', filters.status);
        }
        if (filters.dateRange) {
            query = query
                .gte('created_at', filters.dateRange.start)
                .lte('created_at', filters.dateRange.end);
        }
        const { data: leads, error } = await query;
        if (error) {
            throw new Error(`Export failed: ${error.message}`);
        }
        const headers = [
            'First Name',
            'Last Name',
            'Email',
            'Phone',
            'Company',
            'Title',
            'Status',
            'Priority',
            'Source',
            'Campaign',
            'Tags',
            'Notes',
            'Created At',
            'Last Contacted'
        ];
        const csvRows = [headers.join(',')];
        leads?.forEach(lead => {
            const row = [
                lead.first_name || '',
                lead.last_name || '',
                lead.email || '',
                lead.phone_number || '',
                lead.company || '',
                lead.title || '',
                lead.status || '',
                lead.priority || '',
                lead.source || '',
                lead.campaign_id || '',
                (lead.tags || []).join(';'),
                lead.notes || '',
                lead.created_at || '',
                lead.last_contacted_at || ''
            ].map(field => `"${field}"`);
            csvRows.push(row.join(','));
        });
        return csvRows.join('\n');
    }
    async getImportHistory(accountId, limit = 10) {
        const { data, error } = await this.supabase
            .from('lead_imports')
            .select('*')
            .eq('account_id', accountId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) {
            throw new Error(`Failed to get import history: ${error.message}`);
        }
        return data;
    }
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    isValidPhone(phone) {
        const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
        const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
        return phoneRegex.test(cleanPhone);
    }
    normalizePhoneNumber(phone) {
        let normalized = phone.replace(/[^\d+]/g, '');
        if (!normalized.startsWith('+')) {
            normalized = '+1' + normalized;
        }
        return normalized;
    }
    getPriorityValue(priority) {
        switch (priority?.toLowerCase()) {
            case 'high': return 3;
            case 'medium': return 2;
            case 'low': return 1;
            default: return 2;
        }
    }
    static async importFromCSV(fileBuffer, filename, config) {
        const importId = crypto.randomUUID();
        const errors = [];
        let totalRows = 0;
        let successfulRows = 0;
        let failedRows = 0;
        let duplicateRows = 0;
        try {
            const { data: importRecord, error: importError } = await supabase_client_1.default
                .from('lead_imports')
                .insert({
                id: importId,
                organization_id: config.organizationId,
                filename,
                status: 'processing',
                created_by: config.userId,
                mapping_config: config.mappingConfig,
                started_at: new Date().toISOString()
            })
                .select()
                .single();
            if (importError)
                throw importError;
            const records = await this.parseCSV(fileBuffer);
            totalRows = records.length;
            await supabase_client_1.default
                .from('lead_imports')
                .update({ total_rows: totalRows })
                .eq('id', importId);
            const existingPhones = config.options?.skipDuplicates
                ? await this.getExistingPhoneNumbers(config.organizationId)
                : new Set();
            const batchSize = config.options?.batchSize || this.BATCH_SIZE;
            const batches = this.createBatches(records, batchSize);
            for (let i = 0; i < batches.length; i += this.MAX_CONCURRENT_BATCHES) {
                const batchPromises = batches
                    .slice(i, i + this.MAX_CONCURRENT_BATCHES)
                    .map((batch, index) => this.processBatch(batch, config, importId, existingPhones, i + index));
                const batchResults = await Promise.all(batchPromises);
                batchResults.forEach(result => {
                    successfulRows += result.successful;
                    failedRows += result.failed;
                    duplicateRows += result.duplicates;
                    errors.push(...result.errors);
                });
                await supabase_client_1.default
                    .from('lead_imports')
                    .update({
                    processed_rows: (i + this.MAX_CONCURRENT_BATCHES) * batchSize,
                    successful_rows: successfulRows,
                    failed_rows: failedRows
                })
                    .eq('id', importId);
            }
            await supabase_client_1.default
                .from('lead_imports')
                .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                processed_rows: totalRows,
                successful_rows: successfulRows,
                failed_rows: failedRows,
                error_log: errors
            })
                .eq('id', importId);
            return {
                importId,
                totalRows,
                successfulRows,
                failedRows,
                duplicateRows,
                errors
            };
        }
        catch (error) {
            await supabase_client_1.default
                .from('lead_imports')
                .update({
                status: 'failed',
                completed_at: new Date().toISOString(),
                error_log: [{ error: error.message }]
            })
                .eq('id', importId);
            throw error;
        }
    }
    static async parseCSV(buffer) {
        return new Promise((resolve, reject) => {
            const records = [];
            const parser = (0, csv_parse_1.parse)({
                columns: true,
                skip_empty_lines: true,
                trim: true,
                relax_quotes: true,
                relax_column_count: true
            });
            parser.on('readable', function () {
                let record;
                while ((record = parser.read()) !== null) {
                    records.push(record);
                }
            });
            parser.on('error', reject);
            parser.on('end', () => resolve(records));
            const stream = stream_1.Readable.from(buffer);
            stream.pipe(parser);
        });
    }
    static createBatches(records, batchSize) {
        const batches = [];
        for (let i = 0; i < records.length; i += batchSize) {
            batches.push(records.slice(i, i + batchSize));
        }
        return batches;
    }
    static async getExistingPhoneNumbers(organizationId) {
        const phones = new Set();
        let lastId = null;
        const pageSize = 1000;
        while (true) {
            let query = supabase_client_1.default
                .from('leads')
                .select('phone')
                .eq('organization_id', organizationId)
                .limit(pageSize);
            if (lastId) {
                query = query.gt('id', lastId);
            }
            const { data, error } = await query;
            if (error)
                throw error;
            if (!data || data.length === 0)
                break;
            data.forEach(lead => phones.add(this.normalizePhone(lead.phone)));
            lastId = data[data.length - 1].id;
        }
        return phones;
    }
    static async processBatch(records, config, importId, existingPhones, batchIndex) {
        const leads = [];
        const errors = [];
        let duplicates = 0;
        let leadOwnerId = config.userId;
        if (config.campaignId) {
            try {
                const { data: campaign } = await supabase_client_1.default
                    .from('campaigns')
                    .select('created_by')
                    .eq('id', config.campaignId)
                    .single();
                if (campaign?.created_by) {
                    leadOwnerId = campaign.created_by;
                }
            }
            catch (error) {
                console.warn('Could not fetch campaign creator, using userId instead');
            }
        }
        records.forEach((record, index) => {
            try {
                const lead = this.mapRecordToLead(record, config);
                if (!lead.phone) {
                    throw new Error('Phone number is required');
                }
                const normalizedPhone = this.normalizePhone(lead.phone);
                if (config.options?.skipDuplicates && existingPhones.has(normalizedPhone)) {
                    duplicates++;
                    return;
                }
                leads.push({
                    ...lead,
                    organization_id: config.organizationId,
                    import_batch_id: importId,
                    external_id: `${importId}-${batchIndex}-${index}`,
                    uploaded_by: leadOwnerId,
                    campaign_id: config.campaignId
                });
                existingPhones.add(normalizedPhone);
            }
            catch (error) {
                errors.push({
                    row: batchIndex * records.length + index + 2,
                    error: error.message,
                    data: record
                });
            }
        });
        if (leads.length > 0) {
            const { error: insertError } = await supabase_client_1.default
                .from('leads')
                .insert(leads);
            if (insertError) {
                return {
                    successful: 0,
                    failed: leads.length,
                    duplicates,
                    errors: [{
                            row: -1,
                            error: insertError.message,
                            data: null
                        }]
                };
            }
        }
        return {
            successful: leads.length,
            failed: errors.length,
            duplicates,
            errors
        };
    }
    static mapRecordToLead(record, config) {
        const mapping = config.mappingConfig;
        const lead = {
            phone: this.normalizePhone(record[mapping.phone] || ''),
            status: 'new',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        if (mapping.firstName && record[mapping.firstName]) {
            lead.first_name = String(record[mapping.firstName]);
        }
        if (mapping.lastName && record[mapping.lastName]) {
            lead.last_name = String(record[mapping.lastName]);
        }
        if (mapping.email && record[mapping.email]) {
            lead.email = this.normalizeEmail(String(record[mapping.email]));
        }
        if (mapping.company && record[mapping.company]) {
            lead.company = String(record[mapping.company]);
        }
        if (mapping.tags && record[mapping.tags]) {
            lead.tags = String(record[mapping.tags]).split(',').map((tag) => tag.trim());
        }
        if (mapping.customFields && mapping.customFields.length > 0) {
            lead.custom_fields = {};
            mapping.customFields.forEach(field => {
                if (record[field]) {
                    lead.custom_fields[field] = record[field];
                }
            });
        }
        if (config.options?.tagImportBatch) {
            lead.tags = lead.tags || [];
            lead.tags.push(`import-${new Date().toISOString().split('T')[0]}`);
        }
        return lead;
    }
    static normalizePhone(phone) {
        if (!phone)
            return '';
        let normalized = phone.replace(/\D/g, '');
        if (normalized.length === 10) {
            normalized = '1' + normalized;
        }
        if (normalized.length === 11 && normalized.startsWith('1')) {
            return '+' + normalized;
        }
        return phone;
    }
    static normalizeEmail(email) {
        return email ? email.toLowerCase().trim() : '';
    }
    static async getImportStatus(importId) {
        const { data, error } = await supabase_client_1.default
            .from('lead_imports')
            .select('*')
            .eq('id', importId)
            .single();
        if (error)
            throw error;
        return data;
    }
    static async getImportHistory(organizationId, limit = 10) {
        const { data, error } = await supabase_client_1.default
            .from('lead_imports')
            .select('*')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error)
            throw error;
        return data || [];
    }
}
exports.LeadImportService = LeadImportService;
LeadImportService.BATCH_SIZE = 500;
LeadImportService.MAX_CONCURRENT_BATCHES = 3;
