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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeadProcessingService = void 0;
const csvParser = __importStar(require("csv-parser"));
const stream_1 = require("stream");
const crypto = __importStar(require("crypto"));
const libphonenumber_js_1 = require("libphonenumber-js");
class LeadProcessingService {
    constructor(pool) {
        this.BATCH_SIZE = 1000;
        this.MAX_FILE_SIZE = 50 * 1024 * 1024;
        this.ALLOWED_EXTENSIONS = ['.csv'];
        this.pool = pool;
    }
    async processCsvImport(campaignId, accountId, csvBuffer, filename, userId) {
        const startTime = Date.now();
        const batchId = crypto.randomUUID();
        try {
            this.validateFile(csvBuffer, filename);
            await this.createImportBatch(batchId, campaignId, accountId, filename, userId);
            const validationResults = await this.parseAndValidateCsv(csvBuffer);
            const validLeads = validationResults.filter(result => result.valid);
            const invalidLeads = validationResults.filter(result => !result.valid);
            const { uniqueLeads, duplicateCount } = await this.checkForDuplicates(validLeads, campaignId);
            let importedCount = 0;
            for (let i = 0; i < uniqueLeads.length; i += this.BATCH_SIZE) {
                const batch = uniqueLeads.slice(i, i + this.BATCH_SIZE);
                const batchResult = await this.importLeadBatch(batch, campaignId, accountId, batchId);
                importedCount += batchResult;
            }
            await this.updateImportBatch(batchId, {
                total_rows: validationResults.length,
                valid_rows: validLeads.length,
                error_rows: invalidLeads.length,
                status: 'completed'
            });
            const processingTime = Date.now() - startTime;
            return {
                batch_id: batchId,
                total_processed: validationResults.length,
                valid_leads: validLeads.length,
                invalid_leads: invalidLeads.length,
                duplicate_leads: duplicateCount,
                errors: this.aggregateErrors(invalidLeads),
                processing_time_ms: processingTime
            };
        }
        catch (error) {
            await this.updateImportBatch(batchId, {
                status: 'failed',
                error_log: [error.message]
            });
            throw new Error(`CSV import failed: ${error.message}`);
        }
    }
    validateFile(buffer, filename) {
        if (buffer.length > this.MAX_FILE_SIZE) {
            throw new Error(`File size exceeds maximum limit of ${this.MAX_FILE_SIZE / (1024 * 1024)}MB`);
        }
        const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
        if (!this.ALLOWED_EXTENSIONS.includes(extension)) {
            throw new Error(`Unsupported file type. Allowed types: ${this.ALLOWED_EXTENSIONS.join(', ')}`);
        }
    }
    async parseAndValidateCsv(csvBuffer) {
        return new Promise((resolve, reject) => {
            const results = [];
            let rowNumber = 0;
            const stream = stream_1.Readable.from(csvBuffer);
            stream
                .pipe(csvParser({
                mapHeaders: ({ header }) => header.toLowerCase().trim().replace(/\s+/g, '_')
            }))
                .on('data', (row) => {
                rowNumber++;
                const validationResult = this.validateAndCleanLead(row, rowNumber);
                results.push(validationResult);
            })
                .on('end', () => {
                resolve(results);
            })
                .on('error', (error) => {
                reject(error);
            });
        });
    }
    validateAndCleanLead(row, rowNumber) {
        const errors = [];
        const phoneNumber = this.extractPhoneNumber(row);
        if (!phoneNumber) {
            errors.push('Phone number is required');
        }
        else if (!this.isValidPhoneNumber(phoneNumber)) {
            errors.push('Invalid phone number format');
        }
        const firstName = this.extractFirstName(row);
        const lastName = this.extractLastName(row);
        if (!firstName && !lastName) {
            errors.push('At least first name or last name is required');
        }
        const company = this.extractCompany(row);
        const email = this.extractEmail(row);
        const timezone = this.extractTimezone(row);
        const customFields = this.extractCustomFields(row);
        const cleanPhone = phoneNumber ? this.cleanPhoneNumber(phoneNumber) : '';
        if (email && !this.isValidEmail(email)) {
            errors.push('Invalid email format');
        }
        return {
            valid: errors.length === 0,
            errors,
            row_number: rowNumber,
            data: {
                phone_number: cleanPhone,
                first_name: firstName,
                last_name: lastName,
                company,
                email,
                timezone: timezone || this.inferTimezone(cleanPhone),
                custom_fields: customFields
            }
        };
    }
    extractPhoneNumber(row) {
        const phoneFields = ['phone', 'phone_number', 'telephone', 'mobile', 'cell'];
        for (const field of phoneFields) {
            if (row[field]) {
                return String(row[field]).trim();
            }
        }
        return null;
    }
    extractFirstName(row) {
        const firstNameFields = ['first_name', 'firstname', 'fname', 'name'];
        for (const field of firstNameFields) {
            if (row[field]) {
                const value = String(row[field]).trim();
                if (field === 'name' && value.includes(' ')) {
                    return value.split(' ')[0];
                }
                return value;
            }
        }
        return null;
    }
    extractLastName(row) {
        const lastNameFields = ['last_name', 'lastname', 'lname', 'surname'];
        for (const field of lastNameFields) {
            if (row[field]) {
                return String(row[field]).trim();
            }
        }
        if (row.name && String(row.name).includes(' ')) {
            const parts = String(row.name).trim().split(' ');
            return parts.slice(1).join(' ');
        }
        return null;
    }
    extractCompany(row) {
        const companyFields = ['company', 'organization', 'business', 'employer'];
        for (const field of companyFields) {
            if (row[field]) {
                return String(row[field]).trim();
            }
        }
        return null;
    }
    extractEmail(row) {
        const emailFields = ['email', 'email_address', 'e_mail'];
        for (const field of emailFields) {
            if (row[field]) {
                return String(row[field]).trim().toLowerCase();
            }
        }
        return null;
    }
    extractTimezone(row) {
        const timezoneFields = ['timezone', 'time_zone', 'tz'];
        for (const field of timezoneFields) {
            if (row[field]) {
                return String(row[field]).trim();
            }
        }
        return null;
    }
    extractCustomFields(row) {
        const standardFields = [
            'phone', 'phone_number', 'telephone', 'mobile', 'cell',
            'first_name', 'firstname', 'fname', 'name',
            'last_name', 'lastname', 'lname', 'surname',
            'company', 'organization', 'business', 'employer',
            'email', 'email_address', 'e_mail',
            'timezone', 'time_zone', 'tz'
        ];
        const customFields = {};
        for (const [key, value] of Object.entries(row)) {
            if (!standardFields.includes(key.toLowerCase()) && value) {
                customFields[key] = value;
            }
        }
        return customFields;
    }
    isValidPhoneNumber(phone) {
        try {
            return (0, libphonenumber_js_1.isValidPhoneNumber)(phone);
        }
        catch {
            return false;
        }
    }
    cleanPhoneNumber(phone) {
        try {
            const phoneNumber = (0, libphonenumber_js_1.parsePhoneNumber)(phone, 'US');
            return phoneNumber?.format('E.164') || phone;
        }
        catch {
            return phone.replace(/[^\d+]/g, '');
        }
    }
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    inferTimezone(phone) {
        try {
            const phoneNumber = (0, libphonenumber_js_1.parsePhoneNumber)(phone);
            const country = phoneNumber?.country;
            const timezoneMap = {
                'US': 'America/New_York',
                'CA': 'America/Toronto',
                'GB': 'Europe/London',
                'AU': 'Australia/Sydney',
            };
            return timezoneMap[country || 'US'] || 'America/New_York';
        }
        catch {
            return 'America/New_York';
        }
    }
    async checkForDuplicates(validLeads, campaignId) {
        const phoneNumbers = validLeads.map(lead => lead.data.phone_number);
        const client = await this.pool.connect();
        try {
            const existingLeads = await client.query('SELECT phone_number FROM crm_leads WHERE campaign_id = $1 AND phone_number = ANY($2)', [campaignId, phoneNumbers]);
            const existingNumbers = new Set(existingLeads.rows.map(row => row.phone_number));
            const uniqueLeads = validLeads.filter(lead => !existingNumbers.has(lead.data.phone_number));
            return {
                uniqueLeads,
                duplicateCount: validLeads.length - uniqueLeads.length
            };
        }
        finally {
            client.release();
        }
    }
    async importLeadBatch(leads, campaignId, accountId, batchId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            let importedCount = 0;
            for (const leadData of leads) {
                const { data } = leadData;
                await client.query(`
          INSERT INTO crm_leads (
            campaign_id, account_id, phone_number, phone_number_formatted,
            first_name, last_name, company, email, timezone, custom_fields,
            status, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
          ON CONFLICT (campaign_id, phone_number) DO NOTHING
        `, [
                    campaignId,
                    accountId,
                    data.phone_number,
                    data.phone_number,
                    data.first_name,
                    data.last_name,
                    data.company,
                    data.email,
                    data.timezone,
                    JSON.stringify(data.custom_fields),
                    'new'
                ]);
                importedCount++;
            }
            await client.query('COMMIT');
            return importedCount;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async createImportBatch(batchId, campaignId, accountId, filename, userId) {
        const client = await this.pool.connect();
        try {
            await client.query(`
        INSERT INTO lead_import_batches (
          id, campaign_id, account_id, filename, status, created_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [batchId, campaignId, accountId, filename, 'processing', userId]);
        }
        finally {
            client.release();
        }
    }
    async updateImportBatch(batchId, updates) {
        const client = await this.pool.connect();
        try {
            const setClause = Object.keys(updates).map((key, index) => `${key} = $${index + 2}`).join(', ');
            if (setClause) {
                await client.query(`
          UPDATE lead_import_batches 
          SET ${setClause}, completed_at = NOW()
          WHERE id = $1
        `, [batchId, ...Object.values(updates)]);
            }
        }
        finally {
            client.release();
        }
    }
    aggregateErrors(invalidLeads) {
        const errorCounts = {};
        invalidLeads.forEach(lead => {
            lead.errors.forEach(error => {
                errorCounts[error] = (errorCounts[error] || 0) + 1;
            });
        });
        return Object.entries(errorCounts).map(([error, count]) => `${error} (${count} occurrences)`);
    }
    async getImportBatchStatus(batchId) {
        const client = await this.pool.connect();
        try {
            const result = await client.query('SELECT * FROM lead_import_batches WHERE id = $1', [batchId]);
            return result.rows[0] || null;
        }
        finally {
            client.release();
        }
    }
    async getCampaignLeadStats(campaignId) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
        SELECT 
          COUNT(*) as total_leads,
          COUNT(*) FILTER (WHERE status = 'new') as new_leads,
          COUNT(*) FILTER (WHERE status = 'contacted') as contacted_leads,
          COUNT(*) FILTER (WHERE status = 'qualified') as qualified_leads,
          COUNT(*) FILTER (WHERE status = 'disqualified') as disqualified_leads
        FROM crm_leads 
        WHERE campaign_id = $1
      `, [campaignId]);
            return result.rows[0];
        }
        finally {
            client.release();
        }
    }
}
exports.LeadProcessingService = LeadProcessingService;
