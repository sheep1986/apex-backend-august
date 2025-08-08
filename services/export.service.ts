import { Pool } from 'pg';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as csv from 'fast-csv';
import { createObjectCsvWriter } from 'csv-writer';
import * as archiver from 'archiver';

interface ExportRequest {
  campaignId: string;
  accountId: string;
  userId: string;
  exportType: 'all' | 'qualified' | 'unqualified' | 'contacted' | 'new';
  format: 'csv' | 'json' | 'xlsx';
  dateRange?: {
    startDate: Date;
    endDate: Date;
  };
  includeRecordings: boolean;
  includeTasks: boolean;
  includeAnalytics: boolean;
  customFields?: string[];
}

interface ExportResult {
  exportId: string;
  status: 'processing' | 'completed' | 'failed';
  downloadUrl?: string;
  fileSize?: number;
  recordCount: number;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

interface LeadExportData {
  id: string;
  phone_number: string;
  first_name: string;
  last_name: string;
  company: string;
  email: string;
  status: string;
  created_at: string;
  last_attempt_at: string;
  next_call_scheduled_at: string;
  total_attempts: number;
  last_call_duration: number;
  last_call_cost: number;
  last_call_status: string;
  qualification_score: number;
  interest_level: number;
  ai_summary: string;
  pain_points: string;
  buying_signals: string;
  objections: string;
  next_steps: string;
  recommended_action: string;
  recording_urls: string;
  custom_fields: string;
}

interface CampaignExportData {
  campaign_info: {
    id: string;
    name: string;
    description: string;
    status: string;
    created_at: string;
    total_leads: number;
    total_calls: number;
    total_cost: number;
    qualification_rate: number;
    connection_rate: number;
  };
  leads: LeadExportData[];
  analytics: {
    daily_stats: Array<{
      date: string;
      calls_made: number;
      calls_connected: number;
      leads_qualified: number;
      cost: number;
    }>;
    hourly_stats: Array<{
      hour: number;
      calls_made: number;
      connection_rate: number;
    }>;
    performance_metrics: {
      total_calls: number;
      successful_calls: number;
      average_duration: number;
      total_cost: number;
      cost_per_lead: number;
      cost_per_qualified_lead: number;
      roi_metrics: any;
    };
  };
  compliance_data: {
    dnc_checks: number;
    time_violations: number;
    frequency_violations: number;
    consent_records: number;
  };
}

export class ExportService extends EventEmitter {
  private pool: Pool;
  private exportDir: string;
  private maxFileSize: number;
  private retentionDays: number;

  constructor(pool: Pool) {
    super();
    this.pool = pool;
    this.exportDir = process.env.EXPORT_DIR || path.join(__dirname, '../../exports');
    this.maxFileSize = parseInt(process.env.MAX_EXPORT_FILE_SIZE || '100') * 1024 * 1024; // 100MB default
    this.retentionDays = parseInt(process.env.EXPORT_RETENTION_DAYS || '30');

    // Ensure export directory exists
    this.ensureExportDir();

    // Clean up old exports periodically
    this.setupCleanupTimer();
  }

  /**
   * Create a new export job
   */
  async createExport(request: ExportRequest): Promise<ExportResult> {
    const exportId = this.generateExportId();
    
    try {
      console.log(`📊 Starting export ${exportId} for campaign ${request.campaignId}`);

      // Create export record
      await this.createExportRecord(exportId, request);

      // Process export in background
      this.processExport(exportId, request).catch(error => {
        console.error(`Export ${exportId} failed:`, error);
        this.updateExportStatus(exportId, 'failed', error.message);
      });

      return {
        exportId,
        status: 'processing',
        recordCount: 0,
        createdAt: new Date()
      };

    } catch (error) {
      console.error('Failed to create export:', error);
      throw new Error(`Export creation failed: ${error.message}`);
    }
  }

  /**
   * Get export status
   */
  async getExportStatus(exportId: string): Promise<ExportResult | null> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          id, status, download_url, file_size, record_count, 
          error_message, created_at, completed_at
        FROM export_jobs 
        WHERE id = $1
      `, [exportId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        exportId: row.id,
        status: row.status,
        downloadUrl: row.download_url,
        fileSize: row.file_size,
        recordCount: row.record_count,
        error: row.error_message,
        createdAt: row.created_at,
        completedAt: row.completed_at
      };

    } finally {
      client.release();
    }
  }

  /**
   * List exports for a campaign
   */
  async listExports(campaignId: string, limit: number = 50): Promise<ExportResult[]> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          id, status, download_url, file_size, record_count, 
          error_message, created_at, completed_at
        FROM export_jobs 
        WHERE campaign_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [campaignId, limit]);

      return result.rows.map(row => ({
        exportId: row.id,
        status: row.status,
        downloadUrl: row.download_url,
        fileSize: row.file_size,
        recordCount: row.record_count,
        error: row.error_message,
        createdAt: row.created_at,
        completedAt: row.completed_at
      }));

    } finally {
      client.release();
    }
  }

  /**
   * Process export job
   */
  private async processExport(exportId: string, request: ExportRequest): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Update status to processing
      await this.updateExportStatus(exportId, 'processing');

      // Get campaign data
      const campaignData = await this.getCampaignData(request);
      
      // Generate export file
      const filePath = await this.generateExportFile(exportId, campaignData, request);
      
      // Get file stats
      const stats = fs.statSync(filePath);
      const fileSize = stats.size;
      const recordCount = campaignData.leads.length;

      // Check file size limit
      if (fileSize > this.maxFileSize) {
        throw new Error(`Export file too large (${fileSize} bytes). Maximum allowed: ${this.maxFileSize} bytes`);
      }

      // Generate download URL
      const downloadUrl = this.generateDownloadUrl(exportId, request.format);

      // Update export record
      await this.updateExportRecord(exportId, {
        status: 'completed',
        downloadUrl,
        fileSize,
        recordCount,
        completedAt: new Date()
      });

      const processingTime = Date.now() - startTime;
      console.log(`✅ Export ${exportId} completed in ${processingTime}ms (${recordCount} records, ${fileSize} bytes)`);

      // Emit completion event
      this.emit('export_completed', {
        exportId,
        campaignId: request.campaignId,
        recordCount,
        fileSize,
        processingTime
      });

    } catch (error) {
      console.error(`Export ${exportId} failed:`, error);
      await this.updateExportStatus(exportId, 'failed', error.message);
      
      this.emit('export_failed', {
        exportId,
        campaignId: request.campaignId,
        error: error.message
      });
    }
  }

  /**
   * Get campaign data for export
   */
  private async getCampaignData(request: ExportRequest): Promise<CampaignExportData> {
    const client = await this.pool.connect();
    
    try {
      // Get campaign info
      const campaignResult = await client.query(`
        SELECT 
          id, name, description, status, created_at,
          (SELECT COUNT(*) FROM crm_leads WHERE campaign_id = c.id) as total_leads,
          (SELECT COUNT(*) FROM vapi_call_attempts WHERE campaign_id = c.id) as total_calls,
          (SELECT COALESCE(SUM(cost), 0) FROM vapi_call_attempts WHERE campaign_id = c.id) as total_cost
        FROM campaigns c
        WHERE id = $1
      `, [request.campaignId]);

      const campaign = campaignResult.rows[0];
      
      // Get leads data
      const leadsData = await this.getLeadsData(request);
      
      // Get analytics data
      const analyticsData = await this.getAnalyticsData(request);
      
      // Get compliance data
      const complianceData = await this.getComplianceData(request);

      // Calculate metrics
      const qualificationRate = campaign.total_leads > 0 ? 
        (leadsData.filter(l => l.status === 'qualified').length / campaign.total_leads * 100) : 0;
      
      const connectionRate = campaign.total_calls > 0 ?
        (leadsData.filter(l => l.last_call_status === 'completed').length / campaign.total_calls * 100) : 0;

      return {
        campaign_info: {
          id: campaign.id,
          name: campaign.name,
          description: campaign.description,
          status: campaign.status,
          created_at: campaign.created_at,
          total_leads: campaign.total_leads,
          total_calls: campaign.total_calls,
          total_cost: parseFloat(campaign.total_cost),
          qualification_rate: qualificationRate,
          connection_rate: connectionRate
        },
        leads: leadsData,
        analytics: analyticsData,
        compliance_data: complianceData
      };

    } finally {
      client.release();
    }
  }

  /**
   * Get leads data for export
   */
  private async getLeadsData(request: ExportRequest): Promise<LeadExportData[]> {
    const client = await this.pool.connect();
    
    try {
      let whereClause = 'WHERE l.campaign_id = $1';
      const params = [request.campaignId];
      
      // Add status filter
      if (request.exportType !== 'all') {
        whereClause += ` AND l.status = $${params.length + 1}`;
        params.push(request.exportType);
      }
      
      // Add date range filter
      if (request.dateRange) {
        whereClause += ` AND l.created_at BETWEEN $${params.length + 1} AND $${params.length + 2}`;
        params.push(request.dateRange.startDate, request.dateRange.endDate);
      }

      const result = await client.query(`
        SELECT 
          l.id,
          l.phone_number,
          l.first_name,
          l.last_name,
          l.company,
          l.email,
          l.status,
          l.created_at,
          l.last_attempt_at,
          l.next_call_scheduled_at,
          l.custom_fields,
          
          -- Call attempt data
          (SELECT COUNT(*) FROM vapi_call_attempts vca WHERE vca.lead_id = l.id) as total_attempts,
          (SELECT duration_seconds FROM vapi_call_attempts vca WHERE vca.lead_id = l.id ORDER BY created_at DESC LIMIT 1) as last_call_duration,
          (SELECT cost FROM vapi_call_attempts vca WHERE vca.lead_id = l.id ORDER BY created_at DESC LIMIT 1) as last_call_cost,
          (SELECT status FROM vapi_call_attempts vca WHERE vca.lead_id = l.id ORDER BY created_at DESC LIMIT 1) as last_call_status,
          
          -- Qualification data
          ql.qualification_score,
          ql.interest_level,
          ql.ai_summary,
          ql.pain_points,
          ql.next_steps,
          ql.recommended_action,
          
          -- Transcript data
          vct.ai_analysis,
          
          -- Recording URLs
          ARRAY_AGG(DISTINCT vct.recording_url) FILTER (WHERE vct.recording_url IS NOT NULL) as recording_urls
          
        FROM crm_leads l
        LEFT JOIN qualified_leads ql ON ql.lead_id = l.id
        LEFT JOIN vapi_call_attempts vca ON vca.lead_id = l.id
        LEFT JOIN vapi_call_transcripts vct ON vct.call_attempt_id = vca.id
        ${whereClause}
        GROUP BY l.id, ql.qualification_score, ql.interest_level, ql.ai_summary, 
                 ql.pain_points, ql.next_steps, ql.recommended_action, vct.ai_analysis
        ORDER BY l.created_at DESC
      `, params);

      return result.rows.map(row => ({
        id: row.id,
        phone_number: row.phone_number,
        first_name: row.first_name || '',
        last_name: row.last_name || '',
        company: row.company || '',
        email: row.email || '',
        status: row.status,
        created_at: row.created_at,
        last_attempt_at: row.last_attempt_at,
        next_call_scheduled_at: row.next_call_scheduled_at,
        total_attempts: row.total_attempts || 0,
        last_call_duration: row.last_call_duration || 0,
        last_call_cost: row.last_call_cost || 0,
        last_call_status: row.last_call_status || '',
        qualification_score: row.qualification_score || 0,
        interest_level: row.interest_level || 0,
        ai_summary: row.ai_summary || '',
        pain_points: Array.isArray(row.pain_points) ? row.pain_points.join('; ') : '',
        buying_signals: this.extractBuyingSignals(row.ai_analysis),
        objections: this.extractObjections(row.ai_analysis),
        next_steps: row.next_steps || '',
        recommended_action: row.recommended_action || '',
        recording_urls: Array.isArray(row.recording_urls) ? row.recording_urls.join('; ') : '',
        custom_fields: JSON.stringify(row.custom_fields || {})
      }));

    } finally {
      client.release();
    }
  }

  /**
   * Get analytics data for export
   */
  private async getAnalyticsData(request: ExportRequest): Promise<any> {
    const client = await this.pool.connect();
    
    try {
      // Daily stats
      const dailyStats = await client.query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as calls_made,
          COUNT(*) FILTER (WHERE status = 'completed') as calls_connected,
          COUNT(DISTINCT lead_id) FILTER (WHERE lead_id IN (
            SELECT lead_id FROM qualified_leads WHERE campaign_id = $1
          )) as leads_qualified,
          SUM(cost) as cost
        FROM vapi_call_attempts
        WHERE campaign_id = $1
        AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `, [request.campaignId]);

      // Hourly stats
      const hourlyStats = await client.query(`
        SELECT 
          EXTRACT(HOUR FROM created_at) as hour,
          COUNT(*) as calls_made,
          ROUND(
            COUNT(*) FILTER (WHERE status = 'completed')::float / COUNT(*) * 100, 2
          ) as connection_rate
        FROM vapi_call_attempts
        WHERE campaign_id = $1
        AND created_at >= NOW() - INTERVAL '7 days'
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY hour
      `, [request.campaignId]);

      // Performance metrics
      const performanceMetrics = await client.query(`
        SELECT 
          COUNT(*) as total_calls,
          COUNT(*) FILTER (WHERE status = 'completed') as successful_calls,
          AVG(duration_seconds) as average_duration,
          SUM(cost) as total_cost,
          COUNT(DISTINCT lead_id) as unique_leads_called,
          COUNT(DISTINCT lead_id) FILTER (WHERE lead_id IN (
            SELECT lead_id FROM qualified_leads WHERE campaign_id = $1
          )) as qualified_leads
        FROM vapi_call_attempts
        WHERE campaign_id = $1
      `, [request.campaignId]);

      const metrics = performanceMetrics.rows[0];
      const costPerLead = metrics.unique_leads_called > 0 ? metrics.total_cost / metrics.unique_leads_called : 0;
      const costPerQualifiedLead = metrics.qualified_leads > 0 ? metrics.total_cost / metrics.qualified_leads : 0;

      return {
        daily_stats: dailyStats.rows,
        hourly_stats: hourlyStats.rows,
        performance_metrics: {
          total_calls: parseInt(metrics.total_calls),
          successful_calls: parseInt(metrics.successful_calls),
          average_duration: parseFloat(metrics.average_duration) || 0,
          total_cost: parseFloat(metrics.total_cost) || 0,
          cost_per_lead: costPerLead,
          cost_per_qualified_lead: costPerQualifiedLead,
          roi_metrics: {
            conversion_rate: metrics.unique_leads_called > 0 ? (metrics.qualified_leads / metrics.unique_leads_called * 100) : 0,
            efficiency_score: metrics.total_calls > 0 ? (metrics.qualified_leads / metrics.total_calls * 100) : 0
          }
        }
      };

    } finally {
      client.release();
    }
  }

  /**
   * Get compliance data for export
   */
  private async getComplianceData(request: ExportRequest): Promise<any> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          COUNT(*) FILTER (WHERE action = 'dnc_check') as dnc_checks,
          COUNT(*) FILTER (WHERE action = 'time_check' AND result = 'blocked') as time_violations,
          COUNT(*) FILTER (WHERE action = 'frequency_check' AND result = 'blocked') as frequency_violations,
          COUNT(*) FILTER (WHERE action = 'consent_check' AND result = 'allowed') as consent_records
        FROM compliance_logs
        WHERE campaign_id = $1
      `, [request.campaignId]);

      return result.rows[0];

    } finally {
      client.release();
    }
  }

  /**
   * Generate export file
   */
  private async generateExportFile(
    exportId: string, 
    data: CampaignExportData, 
    request: ExportRequest
  ): Promise<string> {
    const fileName = `${exportId}.${request.format}`;
    const filePath = path.join(this.exportDir, fileName);

    switch (request.format) {
      case 'csv':
        return await this.generateCsvFile(filePath, data, request);
      case 'json':
        return await this.generateJsonFile(filePath, data, request);
      case 'xlsx':
        return await this.generateXlsxFile(filePath, data, request);
      default:
        throw new Error(`Unsupported export format: ${request.format}`);
    }
  }

  /**
   * Generate CSV file
   */
  private async generateCsvFile(
    filePath: string, 
    data: CampaignExportData, 
    request: ExportRequest
  ): Promise<string> {
    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: [
        { id: 'id', title: 'Lead ID' },
        { id: 'phone_number', title: 'Phone Number' },
        { id: 'first_name', title: 'First Name' },
        { id: 'last_name', title: 'Last Name' },
        { id: 'company', title: 'Company' },
        { id: 'email', title: 'Email' },
        { id: 'status', title: 'Status' },
        { id: 'created_at', title: 'Created At' },
        { id: 'last_attempt_at', title: 'Last Attempt At' },
        { id: 'total_attempts', title: 'Total Attempts' },
        { id: 'last_call_duration', title: 'Last Call Duration (s)' },
        { id: 'last_call_cost', title: 'Last Call Cost ($)' },
        { id: 'last_call_status', title: 'Last Call Status' },
        { id: 'qualification_score', title: 'Qualification Score' },
        { id: 'interest_level', title: 'Interest Level' },
        { id: 'ai_summary', title: 'AI Summary' },
        { id: 'pain_points', title: 'Pain Points' },
        { id: 'buying_signals', title: 'Buying Signals' },
        { id: 'objections', title: 'Objections' },
        { id: 'next_steps', title: 'Next Steps' },
        { id: 'recommended_action', title: 'Recommended Action' },
        { id: 'recording_urls', title: 'Recording URLs' },
        { id: 'custom_fields', title: 'Custom Fields' }
      ]
    });

    await csvWriter.writeRecords(data.leads);
    
    // If analytics are included, create a separate analytics file
    if (request.includeAnalytics) {
      const analyticsPath = filePath.replace('.csv', '_analytics.csv');
      await this.generateAnalyticsCsv(analyticsPath, data.analytics);
    }

    return filePath;
  }

  /**
   * Generate JSON file
   */
  private async generateJsonFile(
    filePath: string, 
    data: CampaignExportData, 
    request: ExportRequest
  ): Promise<string> {
    const exportData: any = {
      campaign: data.campaign_info,
      leads: data.leads,
      export_metadata: {
        export_id: path.basename(filePath, '.json'),
        export_type: request.exportType,
        date_range: request.dateRange,
        exported_at: new Date().toISOString(),
        record_count: data.leads.length
      }
    };

    if (request.includeAnalytics) {
      exportData.analytics = data.analytics;
    }

    if (request.includeTasks) {
      exportData.compliance = data.compliance_data;
    }

    await fs.promises.writeFile(filePath, JSON.stringify(exportData, null, 2));
    return filePath;
  }

  /**
   * Generate XLSX file
   */
  private async generateXlsxFile(
    filePath: string, 
    data: CampaignExportData, 
    request: ExportRequest
  ): Promise<string> {
    // For XLSX generation, you would use a library like 'exceljs'
    // This is a placeholder implementation
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    
    // Leads sheet
    const leadsSheet = workbook.addWorksheet('Leads');
    leadsSheet.addRow([
      'Lead ID', 'Phone Number', 'First Name', 'Last Name', 'Company', 'Email',
      'Status', 'Created At', 'Last Attempt At', 'Total Attempts',
      'Last Call Duration (s)', 'Last Call Cost ($)', 'Last Call Status',
      'Qualification Score', 'Interest Level', 'AI Summary', 'Pain Points',
      'Buying Signals', 'Objections', 'Next Steps', 'Recommended Action',
      'Recording URLs', 'Custom Fields'
    ]);
    
    data.leads.forEach(lead => {
      leadsSheet.addRow([
        lead.id, lead.phone_number, lead.first_name, lead.last_name,
        lead.company, lead.email, lead.status, lead.created_at,
        lead.last_attempt_at, lead.total_attempts, lead.last_call_duration,
        lead.last_call_cost, lead.last_call_status, lead.qualification_score,
        lead.interest_level, lead.ai_summary, lead.pain_points,
        lead.buying_signals, lead.objections, lead.next_steps,
        lead.recommended_action, lead.recording_urls, lead.custom_fields
      ]);
    });

    // Analytics sheet
    if (request.includeAnalytics) {
      const analyticsSheet = workbook.addWorksheet('Analytics');
      analyticsSheet.addRow(['Date', 'Calls Made', 'Calls Connected', 'Leads Qualified', 'Cost']);
      
      data.analytics.daily_stats.forEach(stat => {
        analyticsSheet.addRow([stat.date, stat.calls_made, stat.calls_connected, stat.leads_qualified, stat.cost]);
      });
    }

    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  /**
   * Generate analytics CSV
   */
  private async generateAnalyticsCsv(filePath: string, analytics: any): Promise<void> {
    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: [
        { id: 'date', title: 'Date' },
        { id: 'calls_made', title: 'Calls Made' },
        { id: 'calls_connected', title: 'Calls Connected' },
        { id: 'leads_qualified', title: 'Leads Qualified' },
        { id: 'cost', title: 'Cost ($)' }
      ]
    });

    await csvWriter.writeRecords(analytics.daily_stats);
  }

  /**
   * Utility functions
   */
  private extractBuyingSignals(aiAnalysis: any): string {
    try {
      const analysis = typeof aiAnalysis === 'string' ? JSON.parse(aiAnalysis) : aiAnalysis;
      return Array.isArray(analysis?.buying_signals) ? analysis.buying_signals.join('; ') : '';
    } catch {
      return '';
    }
  }

  private extractObjections(aiAnalysis: any): string {
    try {
      const analysis = typeof aiAnalysis === 'string' ? JSON.parse(aiAnalysis) : aiAnalysis;
      return Array.isArray(analysis?.objections) ? analysis.objections.join('; ') : '';
    } catch {
      return '';
    }
  }

  private generateExportId(): string {
    return `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateDownloadUrl(exportId: string, format: string): string {
    return `/api/exports/${exportId}/download.${format}`;
  }

  private ensureExportDir(): void {
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
  }

  private setupCleanupTimer(): void {
    // Clean up old exports every hour
    setInterval(() => {
      this.cleanupOldExports().catch(console.error);
    }, 60 * 60 * 1000);
  }

  private async cleanupOldExports(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    const client = await this.pool.connect();
    
    try {
      // Get old exports
      const result = await client.query(`
        SELECT id, download_url FROM export_jobs 
        WHERE created_at < $1 AND status = 'completed'
      `, [cutoffDate]);

      for (const row of result.rows) {
        try {
          // Delete file
          const fileName = path.basename(row.download_url);
          const filePath = path.join(this.exportDir, fileName);
          
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }

          // Delete record
          await client.query('DELETE FROM export_jobs WHERE id = $1', [row.id]);
          
          console.log(`🗑️ Cleaned up old export: ${row.id}`);
        } catch (error) {
          console.error(`Failed to cleanup export ${row.id}:`, error);
        }
      }
    } finally {
      client.release();
    }
  }

  /**
   * Database operations
   */
  private async createExportRecord(exportId: string, request: ExportRequest): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        INSERT INTO export_jobs (
          id, campaign_id, account_id, user_id, export_type, format,
          date_range, include_recordings, include_analytics, custom_fields,
          status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      `, [
        exportId,
        request.campaignId,
        request.accountId,
        request.userId,
        request.exportType,
        request.format,
        JSON.stringify(request.dateRange),
        request.includeRecordings,
        request.includeAnalytics,
        JSON.stringify(request.customFields),
        'processing'
      ]);
    } finally {
      client.release();
    }
  }

  private async updateExportStatus(exportId: string, status: string, errorMessage?: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        UPDATE export_jobs 
        SET status = $1, error_message = $2, updated_at = NOW()
        WHERE id = $3
      `, [status, errorMessage, exportId]);
    } finally {
      client.release();
    }
  }

  private async updateExportRecord(exportId: string, updates: Partial<ExportResult>): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      const setClause = Object.keys(updates).map((key, index) => 
        `${key} = $${index + 2}`
      ).join(', ');
      
      if (setClause) {
        await client.query(`
          UPDATE export_jobs 
          SET ${setClause}, updated_at = NOW()
          WHERE id = $1
        `, [exportId, ...Object.values(updates)]);
      }
    } finally {
      client.release();
    }
  }

  /**
   * Get export statistics
   */
  async getExportStats(accountId: string): Promise<{
    total_exports: number;
    completed_exports: number;
    failed_exports: number;
    total_records_exported: number;
    total_file_size: number;
    popular_formats: Array<{ format: string; count: number }>;
  }> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          COUNT(*) as total_exports,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_exports,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_exports,
          SUM(record_count) as total_records_exported,
          SUM(file_size) as total_file_size
        FROM export_jobs
        WHERE account_id = $1
        AND created_at > NOW() - INTERVAL '30 days'
      `, [accountId]);

      const formatsResult = await client.query(`
        SELECT format, COUNT(*) as count
        FROM export_jobs
        WHERE account_id = $1
        AND created_at > NOW() - INTERVAL '30 days'
        GROUP BY format
        ORDER BY count DESC
      `, [accountId]);

      const stats = result.rows[0];

      return {
        total_exports: parseInt(stats.total_exports),
        completed_exports: parseInt(stats.completed_exports),
        failed_exports: parseInt(stats.failed_exports),
        total_records_exported: parseInt(stats.total_records_exported) || 0,
        total_file_size: parseInt(stats.total_file_size) || 0,
        popular_formats: formatsResult.rows
      };

    } finally {
      client.release();
    }
  }
}