import { createClient } from '@supabase/supabase-js';
import * as csv from 'csv-parser';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import supabase from './supabase-client';
import { parse } from 'csv-parse';

interface LeadImportData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  title: string;
  status: string;
  priority: string;
  source: string;
  campaign: string;
  tags: string;
  notes: string;
  customFields: Record<string, any>;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
  value: string;
}

interface ImportResult {
  success: boolean;
  totalRows: number;
  importedRows: number;
  errors: string[];
  warnings: string[];
  importId: string;
}

interface ValidationResult {
  totalRows: number;
  validRows: number;
  errors: ValidationError[];
  warnings: string[];
  preview: LeadImportData[];
}

interface LeadStats {
  total: number;
  byStatus: Record<string, number>;
  byCampaign: Record<string, number>;
  byType: { b2c: number; b2b: number };
  conversionRate: number;
  averageValue: number;
  recentActivity: any[];
}

interface ImportConfig {
  organizationId: string;
  userId: string;
  campaignId?: string; // Optional campaign ID
  mappingConfig: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone: string; // Required
    company?: string;
    tags?: string;
    customFields?: string[];
  };
  options?: {
    skipDuplicates?: boolean;
    updateExisting?: boolean;
    tagImportBatch?: boolean;
    batchSize?: number;
  };
}

// B2C vs B2B Campaign Configuration
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

export class LeadImportService {
  private supabase: any;
  private static BATCH_SIZE = 500; // Process 500 rows at a time
  private static MAX_CONCURRENT_BATCHES = 3;

  constructor() {
    // Handle missing environment variables for development
    const supabaseUrl = process.env.SUPABASE_URL || 'https://mock-development.supabase.co';
    const supabaseKey = process.env.SUPABASE_ANON_KEY || 'mock-development-key';
    
    try {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    } catch (error) {
      console.warn('Supabase client initialization failed - using mock mode for development');
      this.supabase = null; // Will be handled by individual methods
    }
  }

  /**
   * Main method to process CSV file upload with campaign type support
   */
  async processCSVUpload(
    fileBuffer: Buffer,
    accountId: string,
    campaignId?: string,
    options: {
      skipDuplicates?: boolean;
      updateExisting?: boolean;
      customFieldMapping?: Record<string, string>;
      validationRules?: any;
      campaignType?: 'b2c' | 'b2b';
    } = {}
  ): Promise<ImportResult> {
    const importId = uuidv4();
    const errors: string[] = [];
    const warnings: string[] = [];
    let totalRows = 0;
    let importedRows = 0;

    try {
      // Parse CSV data
      const leads = await this.parseCSV(fileBuffer);
      totalRows = leads.length;

      // Get campaign configuration
      const campaignType = options.campaignType || 'b2b';
      const config = CAMPAIGN_CONFIGS[campaignType];

      // Validate data with campaign-specific rules
      const validationErrors = this.validateLeadsWithConfig(leads, config);
      
      if (validationErrors.length > 0) {
        errors.push(`Validation failed: ${validationErrors.length} errors found`);
        validationErrors.forEach(error => {
          errors.push(`Row ${error.row}: ${error.field} - ${error.message}`);
        });
      }

      // Check for duplicates if skipDuplicates is enabled
      if (options.skipDuplicates) {
        const duplicateCheck = await this.checkForDuplicates(leads, accountId);
        if (duplicateCheck.length > 0) {
          warnings.push(`Found ${duplicateCheck.length} potential duplicates`);
        }
      }

      // If no critical errors, proceed with import
      if (errors.length === 0) {
        const importResult = await this.importLeadsToDatabase(
          leads,
          accountId,
          campaignId,
          importId,
          options,
          campaignType
        );
        importedRows = importResult.importedRows;
        errors.push(...importResult.errors);
        warnings.push(...importResult.warnings);
      }

      // Store import record
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

    } catch (error) {
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

  /**
   * Validate CSV data only (preview mode)
   */
  async validateCSVOnly(
    fileBuffer: Buffer,
    validationRules: any,
    requiredFields: string[]
  ): Promise<ValidationResult> {
    const leads = await this.parseCSV(fileBuffer);
    const errors: ValidationError[] = [];
    const warnings: string[] = [];
    let validRows = 0;

    leads.forEach((lead, index) => {
      const row = index + 2;
      let rowValid = true;

      // Check required fields
      requiredFields.forEach(field => {
        if (!lead[field as keyof LeadImportData]?.trim()) {
          errors.push({
            row,
            field,
            message: `${field} is required`,
            value: lead[field as keyof LeadImportData] || ''
          });
          rowValid = false;
        }
      });

      // Apply custom validation rules
      if (validationRules) {
        Object.entries(validationRules).forEach(([field, rule]: [string, any]) => {
          const value = lead[field as keyof LeadImportData];
          
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
      preview: leads.slice(0, 5) // Return first 5 rows as preview
    };
  }

  /**
   * Get lead statistics and analytics
   */
  async getLeadStats(
    accountId: string,
    filters: {
      campaignId?: string;
      dateRange?: string;
      campaignType?: string;
    } = {}
  ): Promise<LeadStats> {
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

    // Calculate statistics
    const total = leads?.length || 0;
    const byStatus: Record<string, number> = {};
    const byCampaign: Record<string, number> = {};
    const byType = { b2c: 0, b2b: 0 };
    let convertedCount = 0;
    let totalValue = 0;

    leads?.forEach(lead => {
      // Status breakdown
      byStatus[lead.status] = (byStatus[lead.status] || 0) + 1;
      
      // Campaign breakdown
      if (lead.campaign_id) {
        byCampaign[lead.campaign_id] = (byCampaign[lead.campaign_id] || 0) + 1;
      }

      // B2C vs B2B classification
      if (lead.company) {
        byType.b2b++;
      } else {
        byType.b2c++;
      }

      // Conversion tracking
      if (lead.status === 'converted') {
        convertedCount++;
        totalValue += lead.conversion_value || 0;
      }
    });

    // Get recent activity
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

  /**
   * Validate leads with campaign-specific configuration
   */
  private validateLeadsWithConfig(leads: LeadImportData[], config: any): ValidationError[] {
    const errors: ValidationError[] = [];

    leads.forEach((lead, index) => {
      const row = index + 2;

      // Check required fields
      config.requiredFields.forEach((field: string) => {
        if (!lead[field as keyof LeadImportData]?.trim()) {
          errors.push({
            row,
            field,
            message: `${field} is required`,
            value: lead[field as keyof LeadImportData] || ''
          });
        }
      });

      // Apply validation rules
      Object.entries(config.validationRules).forEach(([field, rule]: [string, any]) => {
        const value = lead[field as keyof LeadImportData];
        
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

  /**
   * Check if phone number is valid for business use
   */
  private isValidBusinessPhone(phone: string): boolean {
    // Business phones typically have area codes and are properly formatted
    const businessPhoneRegex = /^\+?1?\s*\(?[0-9]{3}\)?[\s.-]?[0-9]{3}[\s.-]?[0-9]{4}$/;
    return businessPhoneRegex.test(phone);
  }

  /**
   * Parse CSV buffer into structured data
   */
  private async parseCSV(fileBuffer: Buffer): Promise<LeadImportData[]> {
    return new Promise((resolve, reject) => {
      const results: LeadImportData[] = [];
      const stream = Readable.from(fileBuffer);

      stream
        .pipe(csv())
        .on('data', (data) => {
          // Normalize field names
          const normalizedData: LeadImportData = {
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

          // Extract custom fields (any column not in standard fields)
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

  /**
   * Check for duplicate leads
   */
  private async checkForDuplicates(leads: LeadImportData[], accountId: string): Promise<string[]> {
    const phoneNumbers = leads
      .map(lead => this.normalizePhoneNumber(lead.phone))
      .filter(phone => phone);

    if (phoneNumbers.length === 0) return [];

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

  /**
   * Import leads to database
   */
  private async importLeadsToDatabase(
    leads: LeadImportData[],
    accountId: string,
    campaignId: string | undefined,
    importId: string,
    options: {
      skipDuplicates?: boolean;
      updateExisting?: boolean;
      customFieldMapping?: Record<string, string>;
    },
    campaignType: 'b2c' | 'b2b'
  ): Promise<{ importedRows: number; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let importedRows = 0;
    
    // Get campaign creator to set as lead owner
    let leadOwnerId: string | null = null;
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
      } catch (error) {
        console.warn('Could not fetch campaign creator:', error);
      }
    }

    // Process leads in batches to avoid overwhelming the database
    const batchSize = 100;
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      
      try {
        const leadRecords = batch.map(lead => ({
          id: uuidv4(),
          organization_id: accountId, // Note: accountId is actually organizationId
          campaign_id: campaignId,
          external_id: `${importId}_${i + batch.indexOf(lead)}`,
          phone: lead.phone, // The actual column is 'phone' not 'phone_number'
          first_name: lead.firstName.trim(),
          last_name: lead.lastName.trim(),
          email: lead.email?.trim() || null,
          company: lead.company?.trim() || null,
          job_title: lead.title?.trim() || null, // Column is 'job_title' not 'title'
          custom_fields: lead.customFields,
          status: lead.status?.toLowerCase() || 'new',
          lead_source: lead.source || 'CSV Import', // Column is 'lead_source' not 'source'
          uploaded_by: leadOwnerId, // Set the campaign creator as the lead owner
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));

        const { error } = await this.supabase
          .from('leads')
          .insert(leadRecords);

        if (error) {
          errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
        } else {
          importedRows += batch.length;
        }

      } catch (error) {
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { importedRows, errors, warnings };
  }

  /**
   * Store import record for tracking
   */
  private async storeImportRecord(record: {
    importId: string;
    accountId: string;
    campaignId?: string;
    totalRows: number;
    importedRows: number;
    errors: number;
    warnings: number;
    status: 'completed' | 'failed' | 'partial';
    campaignType: 'b2c' | 'b2b';
  }) {
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
    } catch (error) {
      console.error('Error storing import record:', error);
    }
  }

  /**
   * Generate CSV template
   */
  generateCSVTemplate(): string {
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

  /**
   * Export leads to CSV
   */
  async exportLeadsToCSV(
    accountId: string,
    filters: {
      campaignId?: string;
      status?: string;
      dateRange?: { start: string; end: string };
    } = {}
  ): Promise<string> {
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

  /**
   * Get import history
   */
  async getImportHistory(accountId: string, limit: number = 10) {
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

  // Utility methods
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidPhone(phone: string): boolean {
    // Basic phone validation - can be enhanced based on requirements
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
    return phoneRegex.test(cleanPhone);
  }

  private normalizePhoneNumber(phone: string): string {
    // Remove all non-digit characters except +
    let normalized = phone.replace(/[^\d+]/g, '');
    
    // Ensure it starts with +
    if (!normalized.startsWith('+')) {
      normalized = '+1' + normalized; // Default to US
    }
    
    return normalized;
  }

  private getPriorityValue(priority: string): number {
    switch (priority?.toLowerCase()) {
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 2;
    }
  }

  /**
   * Import leads from CSV file
   */
  static async importFromCSV(
    fileBuffer: Buffer,
    filename: string,
    config: ImportConfig
  ): Promise<ImportResult> {
    const importId = crypto.randomUUID();
    const errors: ImportResult['errors'] = [];
    let totalRows = 0;
    let successfulRows = 0;
    let failedRows = 0;
    let duplicateRows = 0;

    try {
      // Create import record
      const { data: importRecord, error: importError } = await supabase
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

      if (importError) throw importError;

      // Parse CSV
      const records = await this.parseCSV(fileBuffer);
      totalRows = records.length;

      // Update total rows
      await supabase
        .from('lead_imports')
        .update({ total_rows: totalRows })
        .eq('id', importId);

      // Get existing phone numbers for duplicate check
      const existingPhones = config.options?.skipDuplicates 
        ? await this.getExistingPhoneNumbers(config.organizationId)
        : new Set<string>();

      // Process in batches
      const batchSize = config.options?.batchSize || this.BATCH_SIZE;
      const batches = this.createBatches(records, batchSize);

      // Process batches with concurrency limit
      for (let i = 0; i < batches.length; i += this.MAX_CONCURRENT_BATCHES) {
        const batchPromises = batches
          .slice(i, i + this.MAX_CONCURRENT_BATCHES)
          .map((batch, index) => 
            this.processBatch(
              batch, 
              config, 
              importId, 
              existingPhones,
              i + index
            )
          );

        const batchResults = await Promise.all(batchPromises);
        
        // Aggregate results
        batchResults.forEach(result => {
          successfulRows += result.successful;
          failedRows += result.failed;
          duplicateRows += result.duplicates;
          errors.push(...result.errors);
        });

        // Update progress
        await supabase
          .from('lead_imports')
          .update({
            processed_rows: (i + this.MAX_CONCURRENT_BATCHES) * batchSize,
            successful_rows: successfulRows,
            failed_rows: failedRows
          })
          .eq('id', importId);
      }

      // Finalize import
      await supabase
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

    } catch (error) {
      // Mark import as failed
      await supabase
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

  /**
   * Parse CSV buffer into records
   */
  private static async parseCSV(buffer: Buffer): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const records: any[] = [];
      
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true,
        relax_column_count: true
      });

      parser.on('readable', function() {
        let record;
        while ((record = parser.read()) !== null) {
          records.push(record);
        }
      });

      parser.on('error', reject);
      parser.on('end', () => resolve(records));

      // Create readable stream from buffer
      const stream = Readable.from(buffer);
      stream.pipe(parser);
    });
  }

  /**
   * Create batches from records
   */
  private static createBatches<T>(records: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < records.length; i += batchSize) {
      batches.push(records.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Get existing phone numbers for duplicate check
   */
  private static async getExistingPhoneNumbers(organizationId: string): Promise<Set<string>> {
    const phones = new Set<string>();
    let lastId = null;
    const pageSize = 1000;

    while (true) {
      let query = supabase
        .from('leads')
        .select('phone')
        .eq('organization_id', organizationId)
        .limit(pageSize);

      if (lastId) {
        query = query.gt('id', lastId);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) break;

      data.forEach(lead => phones.add(this.normalizePhone(lead.phone)));
      lastId = data[data.length - 1].id;
    }

    return phones;
  }

  /**
   * Process a batch of records
   */
  private static async processBatch(
    records: any[],
    config: ImportConfig,
    importId: string,
    existingPhones: Set<string>,
    batchIndex: number
  ): Promise<{
    successful: number;
    failed: number;
    duplicates: number;
    errors: ImportResult['errors'];
  }> {
    const leads: any[] = [];
    const errors: ImportResult['errors'] = [];
    let duplicates = 0;
    
    // Get campaign creator if campaign ID is provided
    let leadOwnerId = config.userId; // Default to the user doing the import
    if (config.campaignId) {
      try {
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('created_by')
          .eq('id', config.campaignId)
          .single();
          
        if (campaign?.created_by) {
          leadOwnerId = campaign.created_by;
        }
      } catch (error) {
        console.warn('Could not fetch campaign creator, using userId instead');
      }
    }

    // Process each record
    records.forEach((record, index) => {
      try {
        const lead = this.mapRecordToLead(record, config);
        
        // Validate required fields
        if (!lead.phone) {
          throw new Error('Phone number is required');
        }

        // Check for duplicates
        const normalizedPhone = this.normalizePhone(lead.phone);
        if (config.options?.skipDuplicates && existingPhones.has(normalizedPhone)) {
          duplicates++;
          return;
        }

        // Add to batch
        leads.push({
          ...lead,
          organization_id: config.organizationId,
          import_batch_id: importId,
          external_id: `${importId}-${batchIndex}-${index}`,
          uploaded_by: leadOwnerId, // Set lead owner (campaign creator or user)
          campaign_id: config.campaignId // Include campaign ID if provided
        });

        // Add to existing phones set
        existingPhones.add(normalizedPhone);

      } catch (error) {
        errors.push({
          row: batchIndex * records.length + index + 2, // +2 for header row and 0-index
          error: error.message,
          data: record
        });
      }
    });

    // Insert leads
    if (leads.length > 0) {
      const { error: insertError } = await supabase
        .from('leads')
        .insert(leads);

      if (insertError) {
        // Handle bulk insert error
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

  /**
   * Map CSV record to lead object
   */
  private static mapRecordToLead(record: any, config: ImportConfig): any {
    const mapping = config.mappingConfig;
    const lead: any = {
      phone: this.normalizePhone(record[mapping.phone] || ''),
      status: 'new',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Map optional fields
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

    // Handle tags
    if (mapping.tags && record[mapping.tags]) {
      lead.tags = String(record[mapping.tags]).split(',').map((tag: string) => tag.trim());
    }

    // Handle custom fields
    if (mapping.customFields && mapping.customFields.length > 0) {
      lead.custom_fields = {};
      mapping.customFields.forEach(field => {
        if (record[field]) {
          lead.custom_fields[field] = record[field];
        }
      });
    }

    // Add import tag if requested
    if (config.options?.tagImportBatch) {
      lead.tags = lead.tags || [];
      lead.tags.push(`import-${new Date().toISOString().split('T')[0]}`);
    }

    return lead;
  }

  /**
   * Normalize phone number
   */
  private static normalizePhone(phone: string): string {
    if (!phone) return '';
    
    // Remove all non-numeric characters
    let normalized = phone.replace(/\D/g, '');
    
    // Add country code if missing (assuming US)
    if (normalized.length === 10) {
      normalized = '1' + normalized;
    }
    
    // Format as E.164
    if (normalized.length === 11 && normalized.startsWith('1')) {
      return '+' + normalized;
    }
    
    return phone; // Return original if can't normalize
  }

  /**
   * Normalize email
   */
  private static normalizeEmail(email: string): string {
    return email ? email.toLowerCase().trim() : '';
  }

  /**
   * Get import status
   */
  static async getImportStatus(importId: string): Promise<any> {
    const { data, error } = await supabase
      .from('lead_imports')
      .select('*')
      .eq('id', importId)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get import history for organization
   */
  static async getImportHistory(organizationId: string, limit = 10): Promise<any[]> {
    const { data, error } = await supabase
      .from('lead_imports')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }
} 