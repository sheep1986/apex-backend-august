import { Pool } from 'pg';
import * as csvParser from 'csv-parser';
import { Readable } from 'stream';
import * as crypto from 'crypto';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

interface LeadData {
  phone_number: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  email?: string;
  timezone?: string;
  custom_fields?: Record<string, any>;
}

interface ValidatedLead {
  valid: boolean;
  errors: string[];
  data: LeadData;
  row_number: number;
}

interface ImportResult {
  batch_id: string;
  total_processed: number;
  valid_leads: number;
  invalid_leads: number;
  duplicate_leads: number;
  errors: string[];
  processing_time_ms: number;
}

interface ImportBatch {
  id: string;
  campaign_id: string;
  account_id: string;
  filename: string;
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  status: 'processing' | 'completed' | 'failed';
  created_by: string;
}

export class LeadProcessingService {
  private pool: Pool;
  private readonly BATCH_SIZE = 1000;
  private readonly MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  private readonly ALLOWED_EXTENSIONS = ['.csv'];

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Process CSV file and import leads for a campaign
   */
  async processCsvImport(
    campaignId: string,
    accountId: string,
    csvBuffer: Buffer,
    filename: string,
    userId: string
  ): Promise<ImportResult> {
    const startTime = Date.now();
    const batchId = crypto.randomUUID();

    try {
      // Validate file
      this.validateFile(csvBuffer, filename);

      // Create import batch record
      await this.createImportBatch(batchId, campaignId, accountId, filename, userId);

      // Parse and validate CSV
      const validationResults = await this.parseAndValidateCsv(csvBuffer);
      
      // Filter valid leads
      const validLeads = validationResults.filter(result => result.valid);
      const invalidLeads = validationResults.filter(result => !result.valid);

      // Check for duplicates
      const { uniqueLeads, duplicateCount } = await this.checkForDuplicates(
        validLeads,
        campaignId
      );

      // Import leads in batches
      let importedCount = 0;
      for (let i = 0; i < uniqueLeads.length; i += this.BATCH_SIZE) {
        const batch = uniqueLeads.slice(i, i + this.BATCH_SIZE);
        const batchResult = await this.importLeadBatch(batch, campaignId, accountId, batchId);
        importedCount += batchResult;
      }

      // Update batch status
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

    } catch (error) {
      // Mark batch as failed
      await this.updateImportBatch(batchId, {
        status: 'failed',
        error_log: [error.message]
      });

      throw new Error(`CSV import failed: ${error.message}`);
    }
  }

  /**
   * Validate file size and format
   */
  private validateFile(buffer: Buffer, filename: string): void {
    if (buffer.length > this.MAX_FILE_SIZE) {
      throw new Error(`File size exceeds maximum limit of ${this.MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }

    const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    if (!this.ALLOWED_EXTENSIONS.includes(extension)) {
      throw new Error(`Unsupported file type. Allowed types: ${this.ALLOWED_EXTENSIONS.join(', ')}`);
    }
  }

  /**
   * Parse CSV and validate each row
   */
  private async parseAndValidateCsv(csvBuffer: Buffer): Promise<ValidatedLead[]> {
    return new Promise((resolve, reject) => {
      const results: ValidatedLead[] = [];
      let rowNumber = 0;

      const stream = Readable.from(csvBuffer);
      
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

  /**
   * Validate and clean individual lead data
   */
  private validateAndCleanLead(row: any, rowNumber: number): ValidatedLead {
    const errors: string[] = [];
    
    // Extract and validate phone number
    const phoneNumber = this.extractPhoneNumber(row);
    if (!phoneNumber) {
      errors.push('Phone number is required');
    } else if (!this.isValidPhoneNumber(phoneNumber)) {
      errors.push('Invalid phone number format');
    }

    // Extract name
    const firstName = this.extractFirstName(row);
    const lastName = this.extractLastName(row);
    
    if (!firstName && !lastName) {
      errors.push('At least first name or last name is required');
    }

    // Extract optional fields
    const company = this.extractCompany(row);
    const email = this.extractEmail(row);
    const timezone = this.extractTimezone(row);

    // Extract custom fields (any additional columns)
    const customFields = this.extractCustomFields(row);

    // Clean and format phone number
    const cleanPhone = phoneNumber ? this.cleanPhoneNumber(phoneNumber) : '';

    // Validate email if provided
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

  /**
   * Extract phone number from various possible column names
   */
  private extractPhoneNumber(row: any): string | null {
    const phoneFields = ['phone', 'phone_number', 'telephone', 'mobile', 'cell'];
    
    for (const field of phoneFields) {
      if (row[field]) {
        return String(row[field]).trim();
      }
    }
    
    return null;
  }

  /**
   * Extract first name from various possible column names
   */
  private extractFirstName(row: any): string | null {
    const firstNameFields = ['first_name', 'firstname', 'fname', 'name'];
    
    for (const field of firstNameFields) {
      if (row[field]) {
        const value = String(row[field]).trim();
        // If it's a full name in the 'name' field, extract first part
        if (field === 'name' && value.includes(' ')) {
          return value.split(' ')[0];
        }
        return value;
      }
    }
    
    return null;
  }

  /**
   * Extract last name from various possible column names
   */
  private extractLastName(row: any): string | null {
    const lastNameFields = ['last_name', 'lastname', 'lname', 'surname'];
    
    for (const field of lastNameFields) {
      if (row[field]) {
        return String(row[field]).trim();
      }
    }
    
    // Try to extract from full name
    if (row.name && String(row.name).includes(' ')) {
      const parts = String(row.name).trim().split(' ');
      return parts.slice(1).join(' ');
    }
    
    return null;
  }

  /**
   * Extract company from various possible column names
   */
  private extractCompany(row: any): string | null {
    const companyFields = ['company', 'organization', 'business', 'employer'];
    
    for (const field of companyFields) {
      if (row[field]) {
        return String(row[field]).trim();
      }
    }
    
    return null;
  }

  /**
   * Extract email from various possible column names
   */
  private extractEmail(row: any): string | null {
    const emailFields = ['email', 'email_address', 'e_mail'];
    
    for (const field of emailFields) {
      if (row[field]) {
        return String(row[field]).trim().toLowerCase();
      }
    }
    
    return null;
  }

  /**
   * Extract timezone from various possible column names
   */
  private extractTimezone(row: any): string | null {
    const timezoneFields = ['timezone', 'time_zone', 'tz'];
    
    for (const field of timezoneFields) {
      if (row[field]) {
        return String(row[field]).trim();
      }
    }
    
    return null;
  }

  /**
   * Extract custom fields (any columns not in standard fields)
   */
  private extractCustomFields(row: any): Record<string, any> {
    const standardFields = [
      'phone', 'phone_number', 'telephone', 'mobile', 'cell',
      'first_name', 'firstname', 'fname', 'name',
      'last_name', 'lastname', 'lname', 'surname',
      'company', 'organization', 'business', 'employer',
      'email', 'email_address', 'e_mail',
      'timezone', 'time_zone', 'tz'
    ];
    
    const customFields: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(row)) {
      if (!standardFields.includes(key.toLowerCase()) && value) {
        customFields[key] = value;
      }
    }
    
    return customFields;
  }

  /**
   * Validate phone number format
   */
  private isValidPhoneNumber(phone: string): boolean {
    try {
      return isValidPhoneNumber(phone);
    } catch {
      return false;
    }
  }

  /**
   * Clean and format phone number to E.164 format
   */
  private cleanPhoneNumber(phone: string): string {
    try {
      const phoneNumber = parsePhoneNumber(phone, 'US');
      return phoneNumber?.format('E.164') || phone;
    } catch {
      // If parsing fails, return cleaned version
      return phone.replace(/[^\d+]/g, '');
    }
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Infer timezone from phone number
   */
  private inferTimezone(phone: string): string {
    try {
      const phoneNumber = parsePhoneNumber(phone);
      const country = phoneNumber?.country;
      
      // Simple timezone mapping - in production, use a more comprehensive mapping
      const timezoneMap: Record<string, string> = {
        'US': 'America/New_York',
        'CA': 'America/Toronto',
        'GB': 'Europe/London',
        'AU': 'Australia/Sydney',
        // Add more as needed
      };
      
      return timezoneMap[country || 'US'] || 'America/New_York';
    } catch {
      return 'America/New_York';
    }
  }

  /**
   * Check for duplicate leads in the campaign
   */
  private async checkForDuplicates(
    validLeads: ValidatedLead[],
    campaignId: string
  ): Promise<{ uniqueLeads: ValidatedLead[], duplicateCount: number }> {
    const phoneNumbers = validLeads.map(lead => lead.data.phone_number);
    
    const client = await this.pool.connect();
    try {
      const existingLeads = await client.query(
        'SELECT phone_number FROM crm_leads WHERE campaign_id = $1 AND phone_number = ANY($2)',
        [campaignId, phoneNumbers]
      );
      
      const existingNumbers = new Set(existingLeads.rows.map(row => row.phone_number));
      
      const uniqueLeads = validLeads.filter(lead => 
        !existingNumbers.has(lead.data.phone_number)
      );
      
      return {
        uniqueLeads,
        duplicateCount: validLeads.length - uniqueLeads.length
      };
    } finally {
      client.release();
    }
  }

  /**
   * Import a batch of leads to the database
   */
  private async importLeadBatch(
    leads: ValidatedLead[],
    campaignId: string,
    accountId: string,
    batchId: string
  ): Promise<number> {
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
          data.phone_number, // formatted version
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
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create import batch record
   */
  private async createImportBatch(
    batchId: string,
    campaignId: string,
    accountId: string,
    filename: string,
    userId: string
  ): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        INSERT INTO lead_import_batches (
          id, campaign_id, account_id, filename, status, created_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [batchId, campaignId, accountId, filename, 'processing', userId]);
    } finally {
      client.release();
    }
  }

  /**
   * Update import batch record
   */
  private async updateImportBatch(
    batchId: string,
    updates: Partial<{
      total_rows: number;
      valid_rows: number;
      error_rows: number;
      status: string;
      error_log: string[];
    }>
  ): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      const setClause = Object.keys(updates).map((key, index) => 
        `${key} = $${index + 2}`
      ).join(', ');
      
      if (setClause) {
        await client.query(`
          UPDATE lead_import_batches 
          SET ${setClause}, completed_at = NOW()
          WHERE id = $1
        `, [batchId, ...Object.values(updates)]);
      }
    } finally {
      client.release();
    }
  }

  /**
   * Aggregate errors from invalid leads
   */
  private aggregateErrors(invalidLeads: ValidatedLead[]): string[] {
    const errorCounts: Record<string, number> = {};
    
    invalidLeads.forEach(lead => {
      lead.errors.forEach(error => {
        errorCounts[error] = (errorCounts[error] || 0) + 1;
      });
    });
    
    return Object.entries(errorCounts).map(([error, count]) => 
      `${error} (${count} occurrences)`
    );
  }

  /**
   * Get import batch status
   */
  async getImportBatchStatus(batchId: string): Promise<ImportBatch | null> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        'SELECT * FROM lead_import_batches WHERE id = $1',
        [batchId]
      );
      
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  /**
   * Get campaign lead statistics
   */
  async getCampaignLeadStats(campaignId: string): Promise<{
    total_leads: number;
    new_leads: number;
    contacted_leads: number;
    qualified_leads: number;
    disqualified_leads: number;
  }> {
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
    } finally {
      client.release();
    }
  }
}