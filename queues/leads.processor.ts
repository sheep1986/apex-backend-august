import { Pool } from 'pg';
import { Job, Worker, Queue } from 'bullmq';
import { LeadProcessingService } from '../services/lead-processing.service';

interface LeadImportJob {
  campaignId: string;
  accountId: string;
  csvBuffer: Buffer;
  filename: string;
  userId: string;
  batchId: string;
}

interface LeadBatchJob {
  campaignId: string;
  accountId: string;
  leads: any[];
  batchId: string;
}

interface LeadUpdateJob {
  leadId: string;
  updates: Record<string, any>;
  reason: string;
}

export class LeadsProcessor {
  private pool: Pool;
  private leadsQueue: Queue;
  private leadProcessingService: LeadProcessingService;
  private worker: Worker;

  constructor(pool: Pool, redisConnection: any) {
    this.pool = pool;
    this.leadsQueue = new Queue('leads', { connection: redisConnection });
    this.leadProcessingService = new LeadProcessingService(pool);
    
    // Create worker
    this.worker = new Worker('leads', this.processJob.bind(this), {
      connection: redisConnection,
      concurrency: 5, // Process up to 5 jobs concurrently
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: 50, // Keep last 50 failed jobs
    });

    this.setupEventListeners();
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    this.worker.on('completed', (job) => {
      console.log(`✅ Lead job ${job.id} completed`);
    });

    this.worker.on('failed', (job, error) => {
      console.error(`❌ Lead job ${job?.id} failed:`, error);
    });

    this.worker.on('progress', (job, progress) => {
      console.log(`📊 Lead job ${job.id} progress: ${progress}%`);
    });

    this.worker.on('error', (error) => {
      console.error('Lead worker error:', error);
    });
  }

  /**
   * Process job based on type
   */
  private async processJob(job: Job): Promise<any> {
    const { name, data } = job;
    
    try {
      switch (name) {
        case 'import-csv':
          return await this.processLeadImport(job, data as LeadImportJob);
        case 'import-batch':
          return await this.processLeadBatch(job, data as LeadBatchJob);
        case 'update-lead':
          return await this.processLeadUpdate(job, data as LeadUpdateJob);
        case 'cleanup-duplicates':
          return await this.processCleanupDuplicates(job, data);
        case 'validate-phone-numbers':
          return await this.processValidatePhoneNumbers(job, data);
        case 'enrich-leads':
          return await this.processEnrichLeads(job, data);
        default:
          throw new Error(`Unknown job type: ${name}`);
      }
    } catch (error) {
      console.error(`Lead job ${job.id} error:`, error);
      throw error;
    }
  }

  /**
   * Process lead import job
   */
  private async processLeadImport(job: Job, data: LeadImportJob): Promise<any> {
    const { campaignId, accountId, csvBuffer, filename, userId, batchId } = data;
    
    try {
      await job.updateProgress(10);
      
      console.log(`📊 Processing lead import for campaign ${campaignId}`);
      
      // Use the lead processing service
      const result = await this.leadProcessingService.processCsvImport(
        campaignId,
        accountId,
        csvBuffer,
        filename,
        userId
      );

      await job.updateProgress(90);
      
      // Update import batch status
      await this.updateImportBatchStatus(batchId, 'completed', result);
      
      await job.updateProgress(100);
      
      return result;
      
    } catch (error) {
      await this.updateImportBatchStatus(batchId, 'failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Process lead batch job
   */
  private async processLeadBatch(job: Job, data: LeadBatchJob): Promise<any> {
    const { campaignId, accountId, leads, batchId } = data;
    
    try {
      await job.updateProgress(10);
      
      console.log(`📊 Processing lead batch: ${leads.length} leads`);
      
      const client = await this.pool.connect();
      
      try {
        await client.query('BEGIN');
        
        let processedCount = 0;
        
        for (const lead of leads) {
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
            lead.phone_number,
            lead.phone_number_formatted,
            lead.first_name,
            lead.last_name,
            lead.company,
            lead.email,
            lead.timezone,
            JSON.stringify(lead.custom_fields || {}),
            'new'
          ]);
          
          processedCount++;
          
          // Update progress
          const progress = Math.round((processedCount / leads.length) * 80) + 10;
          await job.updateProgress(progress);
        }
        
        await client.query('COMMIT');
        
        await job.updateProgress(100);
        
        return { processed: processedCount, total: leads.length };
        
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('Lead batch processing error:', error);
      throw error;
    }
  }

  /**
   * Process lead update job
   */
  private async processLeadUpdate(job: Job, data: LeadUpdateJob): Promise<any> {
    const { leadId, updates, reason } = data;
    
    try {
      await job.updateProgress(20);
      
      console.log(`📊 Updating lead ${leadId}: ${reason}`);
      
      const client = await this.pool.connect();
      
      try {
        const setClause = Object.keys(updates).map((key, index) => 
          `${key} = $${index + 2}`
        ).join(', ');
        
        if (setClause) {
          await client.query(`
            UPDATE crm_leads 
            SET ${setClause}, updated_at = NOW()
            WHERE id = $1
          `, [leadId, ...Object.values(updates)]);
        }
        
        await job.updateProgress(80);
        
        // Log the update
        await client.query(`
          INSERT INTO lead_update_log (
            lead_id, updates, reason, created_at
          ) VALUES ($1, $2, $3, NOW())
        `, [leadId, JSON.stringify(updates), reason]);
        
        await job.updateProgress(100);
        
        return { leadId, updates, reason };
        
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('Lead update error:', error);
      throw error;
    }
  }

  /**
   * Process cleanup duplicates job
   */
  private async processCleanupDuplicates(job: Job, data: any): Promise<any> {
    const { campaignId } = data;
    
    try {
      await job.updateProgress(10);
      
      console.log(`🧹 Cleaning up duplicate leads for campaign ${campaignId}`);
      
      const client = await this.pool.connect();
      
      try {
        // Find duplicates
        const duplicatesResult = await client.query(`
          SELECT phone_number, COUNT(*) as count, array_agg(id) as lead_ids
          FROM crm_leads
          WHERE campaign_id = $1
          GROUP BY phone_number
          HAVING COUNT(*) > 1
        `, [campaignId]);
        
        await job.updateProgress(30);
        
        let cleanedCount = 0;
        
        for (const duplicate of duplicatesResult.rows) {
          const leadIds = duplicate.lead_ids;
          const keepId = leadIds[0]; // Keep the first one
          const removeIds = leadIds.slice(1);
          
          // Remove duplicates
          await client.query(`
            DELETE FROM crm_leads 
            WHERE id = ANY($1)
          `, [removeIds]);
          
          cleanedCount += removeIds.length;
          
          const progress = Math.round((cleanedCount / duplicatesResult.rows.length) * 60) + 30;
          await job.updateProgress(progress);
        }
        
        await job.updateProgress(100);
        
        return { 
          duplicatesFound: duplicatesResult.rows.length,
          leadsRemoved: cleanedCount
        };
        
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('Cleanup duplicates error:', error);
      throw error;
    }
  }

  /**
   * Process validate phone numbers job
   */
  private async processValidatePhoneNumbers(job: Job, data: any): Promise<any> {
    const { campaignId, batchSize = 100 } = data;
    
    try {
      await job.updateProgress(10);
      
      console.log(`📞 Validating phone numbers for campaign ${campaignId}`);
      
      const client = await this.pool.connect();
      
      try {
        // Get leads with invalid phone numbers
        const invalidLeads = await client.query(`
          SELECT id, phone_number
          FROM crm_leads
          WHERE campaign_id = $1
          AND (phone_number_formatted IS NULL OR phone_number_formatted = '')
          LIMIT $2
        `, [campaignId, batchSize]);
        
        await job.updateProgress(30);
        
        let validatedCount = 0;
        
        for (const lead of invalidLeads.rows) {
          try {
            // Use libphonenumber to validate and format
            const formatted = this.formatPhoneNumber(lead.phone_number);
            
            if (formatted) {
              await client.query(`
                UPDATE crm_leads 
                SET phone_number_formatted = $1, updated_at = NOW()
                WHERE id = $2
              `, [formatted, lead.id]);
              
              validatedCount++;
            } else {
              // Mark as invalid
              await client.query(`
                UPDATE crm_leads 
                SET status = 'invalid', updated_at = NOW()
                WHERE id = $1
              `, [lead.id]);
            }
            
          } catch (error) {
            console.error(`Failed to validate phone ${lead.phone_number}:`, error);
          }
          
          const progress = Math.round((validatedCount / invalidLeads.rows.length) * 60) + 30;
          await job.updateProgress(progress);
        }
        
        await job.updateProgress(100);
        
        return { 
          processed: invalidLeads.rows.length,
          validated: validatedCount
        };
        
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('Phone validation error:', error);
      throw error;
    }
  }

  /**
   * Process enrich leads job
   */
  private async processEnrichLeads(job: Job, data: any): Promise<any> {
    const { campaignId, enrichmentProvider = 'clearbit' } = data;
    
    try {
      await job.updateProgress(10);
      
      console.log(`🔍 Enriching leads for campaign ${campaignId}`);
      
      const client = await this.pool.connect();
      
      try {
        // Get leads that need enrichment
        const leadsToEnrich = await client.query(`
          SELECT id, company, email
          FROM crm_leads
          WHERE campaign_id = $1
          AND (custom_fields->>'enriched' IS NULL OR custom_fields->>'enriched' = 'false')
          AND (company IS NOT NULL OR email IS NOT NULL)
          LIMIT 50
        `, [campaignId]);
        
        await job.updateProgress(30);
        
        let enrichedCount = 0;
        
        for (const lead of leadsToEnrich.rows) {
          try {
            // Mock enrichment (in production, call actual enrichment API)
            const enrichmentData = await this.mockEnrichLead(lead);
            
            if (enrichmentData) {
              await client.query(`
                UPDATE crm_leads 
                SET custom_fields = custom_fields || $1, updated_at = NOW()
                WHERE id = $2
              `, [JSON.stringify(enrichmentData), lead.id]);
              
              enrichedCount++;
            }
            
          } catch (error) {
            console.error(`Failed to enrich lead ${lead.id}:`, error);
          }
          
          const progress = Math.round((enrichedCount / leadsToEnrich.rows.length) * 60) + 30;
          await job.updateProgress(progress);
        }
        
        await job.updateProgress(100);
        
        return { 
          processed: leadsToEnrich.rows.length,
          enriched: enrichedCount
        };
        
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('Lead enrichment error:', error);
      throw error;
    }
  }

  /**
   * Queue jobs
   */
  async queueLeadImport(data: LeadImportJob): Promise<Job> {
    return await this.leadsQueue.add('import-csv', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });
  }

  async queueLeadBatch(data: LeadBatchJob): Promise<Job> {
    return await this.leadsQueue.add('import-batch', data, {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });
  }

  async queueLeadUpdate(data: LeadUpdateJob): Promise<Job> {
    return await this.leadsQueue.add('update-lead', data, {
      attempts: 2,
      delay: 1000,
    });
  }

  async queueCleanupDuplicates(campaignId: string): Promise<Job> {
    return await this.leadsQueue.add('cleanup-duplicates', { campaignId }, {
      attempts: 1,
      delay: 5000,
    });
  }

  async queueValidatePhoneNumbers(campaignId: string): Promise<Job> {
    return await this.leadsQueue.add('validate-phone-numbers', { campaignId }, {
      attempts: 1,
      delay: 2000,
    });
  }

  async queueEnrichLeads(campaignId: string): Promise<Job> {
    return await this.leadsQueue.add('enrich-leads', { campaignId }, {
      attempts: 1,
      delay: 10000,
    });
  }

  /**
   * Utility methods
   */
  private formatPhoneNumber(phoneNumber: string): string | null {
    try {
      // Use libphonenumber to format
      const { parsePhoneNumber } = require('libphonenumber-js');
      const parsed = parsePhoneNumber(phoneNumber, 'US');
      return parsed?.format('E.164') || null;
    } catch {
      return null;
    }
  }

  private async mockEnrichLead(lead: any): Promise<any> {
    // Mock enrichment data
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return {
      enriched: 'true',
      enriched_at: new Date().toISOString(),
      company_size: Math.floor(Math.random() * 1000) + 10,
      industry: 'Technology',
      revenue: '$1M-$10M',
      linkedin_url: `https://linkedin.com/company/${lead.company?.toLowerCase().replace(/\s+/g, '-')}`,
      founded_year: 2000 + Math.floor(Math.random() * 23),
      employee_count: Math.floor(Math.random() * 500) + 10,
      location: 'San Francisco, CA',
      technologies: ['JavaScript', 'React', 'Node.js'],
      confidence_score: Math.random() * 0.3 + 0.7 // 0.7-1.0
    };
  }

  private async updateImportBatchStatus(batchId: string, status: string, result: any): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        UPDATE lead_import_batches 
        SET status = $1, result = $2, completed_at = NOW()
        WHERE id = $3
      `, [status, JSON.stringify(result), batchId]);
    } catch (error) {
      console.error('Failed to update batch status:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const waiting = await this.leadsQueue.getWaiting();
    const active = await this.leadsQueue.getActive();
    const completed = await this.leadsQueue.getCompleted();
    const failed = await this.leadsQueue.getFailed();
    const delayed = await this.leadsQueue.getDelayed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }

  /**
   * Clean up old jobs
   */
  async cleanupOldJobs(): Promise<void> {
    try {
      await this.leadsQueue.clean(24 * 60 * 60 * 1000, 100); // Clean jobs older than 24 hours
      console.log('✅ Lead queue cleanup completed');
    } catch (error) {
      console.error('Lead queue cleanup error:', error);
    }
  }

  /**
   * Close worker and queue
   */
  async close(): Promise<void> {
    await this.worker.close();
    await this.leadsQueue.close();
  }
}