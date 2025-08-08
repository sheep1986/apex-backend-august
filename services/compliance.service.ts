import { Pool } from 'pg';
import * as moment from 'moment-timezone';
import { parsePhoneNumber } from 'libphonenumber-js';
import axios from 'axios';

interface ComplianceCheckParams {
  phone_number: string;
  campaign_id: string;
  account_id: string;
  timezone?: string;
  lead_id?: string;
}

interface ComplianceResult {
  allowed: boolean;
  reason?: string;
  blocked_until?: Date;
  compliance_score: number; // 0-100
  violations: string[];
  recommendations: string[];
}

interface DNCCheckResult {
  is_listed: boolean;
  list_source: string;
  date_added?: Date;
  reason?: string;
}

interface CallingHoursResult {
  is_within_hours: boolean;
  local_time: string;
  next_allowed_time?: Date;
  timezone: string;
}

interface FrequencyCheckResult {
  is_within_limit: boolean;
  recent_calls: number;
  max_allowed: number;
  reset_date?: Date;
}

interface StateRegulations {
  state: string;
  sunday_calling: boolean;
  max_calls_per_day: number;
  calling_hours: { start: number; end: number };
  special_restrictions: string[];
}

export class ComplianceService {
  private pool: Pool;
  private dncApiUrl: string;
  private dncApiKey: string;
  private stateRegulations: Map<string, StateRegulations>;

  constructor(pool: Pool) {
    this.pool = pool;
    this.dncApiUrl = process.env.DNC_API_URL || 'https://api.dnc.gov/v1';
    this.dncApiKey = process.env.DNC_API_KEY || '';
    this.initializeStateRegulations();
  }

  /**
   * Initialize state-specific regulations
   */
  private initializeStateRegulations(): void {
    this.stateRegulations = new Map([
      ['CA', {
        state: 'CA',
        sunday_calling: false,
        max_calls_per_day: 3,
        calling_hours: { start: 8, end: 20 },
        special_restrictions: ['no_robocalls', 'consent_required']
      }],
      ['NY', {
        state: 'NY',
        sunday_calling: false,
        max_calls_per_day: 3,
        calling_hours: { start: 8, end: 21 },
        special_restrictions: ['written_consent']
      }],
      ['TX', {
        state: 'TX',
        sunday_calling: true,
        max_calls_per_day: 5,
        calling_hours: { start: 8, end: 21 },
        special_restrictions: []
      }],
      ['FL', {
        state: 'FL',
        sunday_calling: true,
        max_calls_per_day: 3,
        calling_hours: { start: 8, end: 20 },
        special_restrictions: ['no_prerecorded']
      }],
      // Add more states as needed
    ]);
  }

  /**
   * Comprehensive compliance check
   */
  async checkCompliance(params: ComplianceCheckParams): Promise<ComplianceResult> {
    const violations: string[] = [];
    const recommendations: string[] = [];
    let complianceScore = 100;
    let blockedUntil: Date | undefined;

    try {
      // 1. DNC Registry Check
      const dncResult = await this.checkDNCRegistry(params.phone_number);
      if (dncResult.is_listed) {
        violations.push(`Phone number is on ${dncResult.list_source} DNC list`);
        complianceScore -= 50;
        blockedUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
      }

      // 2. Calling Hours Check
      const hoursResult = await this.checkCallingHours(params.phone_number, params.timezone);
      if (!hoursResult.is_within_hours) {
        violations.push(`Outside calling hours (${hoursResult.local_time} in ${hoursResult.timezone})`);
        complianceScore -= 30;
        blockedUntil = hoursResult.next_allowed_time;
      }

      // 3. Frequency Check
      const frequencyResult = await this.checkFrequencyLimits(params);
      if (!frequencyResult.is_within_limit) {
        violations.push(`Exceeds frequency limit (${frequencyResult.recent_calls}/${frequencyResult.max_allowed})`);
        complianceScore -= 25;
        blockedUntil = frequencyResult.reset_date;
      }

      // 4. State-Specific Regulations
      const stateResult = await this.checkStateRegulations(params.phone_number);
      if (stateResult.violations.length > 0) {
        violations.push(...stateResult.violations);
        complianceScore -= 20;
      }

      // 5. Previous Violations Check
      const violationHistory = await this.checkViolationHistory(params.phone_number);
      if (violationHistory.has_violations) {
        violations.push('Previous compliance violations on record');
        complianceScore -= 15;
      }

      // 6. Consent Check
      const consentResult = await this.checkConsent(params.phone_number, params.campaign_id);
      if (!consentResult.has_consent) {
        recommendations.push('Obtain explicit consent before calling');
        complianceScore -= 10;
      }

      // Log compliance check
      await this.logComplianceCheck(params, {
        allowed: violations.length === 0,
        reason: violations.join('; '),
        blocked_until: blockedUntil,
        compliance_score: complianceScore
      });

      return {
        allowed: violations.length === 0,
        reason: violations.length > 0 ? violations.join('; ') : undefined,
        blocked_until: blockedUntil,
        compliance_score: Math.max(0, complianceScore),
        violations,
        recommendations
      };

    } catch (error) {
      console.error('Compliance check error:', error);
      
      // Log error but don't block calls on system failure
      await this.logComplianceCheck(params, {
        allowed: true,
        reason: `Compliance check failed: ${error.message}`,
        compliance_score: 50
      });

      return {
        allowed: true,
        compliance_score: 50,
        violations: [`System error: ${error.message}`],
        recommendations: ['Manual review required']
      };
    }
  }

  /**
   * Check DNC Registry
   */
  private async checkDNCRegistry(phoneNumber: string): Promise<DNCCheckResult> {
    try {
      // First check internal DNC lists
      const internalResult = await this.checkInternalDNC(phoneNumber);
      if (internalResult.is_listed) {
        return internalResult;
      }

      // Then check external DNC API if available
      if (this.dncApiKey) {
        const response = await axios.get(`${this.dncApiUrl}/check/${phoneNumber}`, {
          headers: {
            'Authorization': `Bearer ${this.dncApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 5000
        });

        if (response.data.on_list) {
          return {
            is_listed: true,
            list_source: response.data.list_source || 'Federal DNC Registry',
            date_added: response.data.date_added ? new Date(response.data.date_added) : undefined
          };
        }
      }

      return {
        is_listed: false,
        list_source: 'none'
      };

    } catch (error) {
      console.error('DNC check error:', error);
      
      // Return safe default - don't block on API failure
      return {
        is_listed: false,
        list_source: 'error',
        reason: `DNC check failed: ${error.message}`
      };
    }
  }

  /**
   * Check internal DNC lists
   */
  private async checkInternalDNC(phoneNumber: string): Promise<DNCCheckResult> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT name, source, last_updated
        FROM dnc_lists
        WHERE $1 = ANY(phone_numbers)
        ORDER BY last_updated DESC
        LIMIT 1
      `, [phoneNumber]);

      if (result.rows.length > 0) {
        const dncRecord = result.rows[0];
        return {
          is_listed: true,
          list_source: `Internal: ${dncRecord.name}`,
          date_added: dncRecord.last_updated
        };
      }

      return {
        is_listed: false,
        list_source: 'internal'
      };

    } finally {
      client.release();
    }
  }

  /**
   * Check calling hours compliance
   */
  private async checkCallingHours(phoneNumber: string, timezone?: string): Promise<CallingHoursResult> {
    try {
      // Determine timezone
      const leadTimezone = timezone || this.inferTimezone(phoneNumber);
      const localTime = moment().tz(leadTimezone);
      const hour = localTime.hour();
      const day = localTime.day(); // 0 = Sunday
      
      // Get state regulations
      const state = this.getStateFromPhoneNumber(phoneNumber);
      const regulations = this.stateRegulations.get(state) || {
        state: 'DEFAULT',
        sunday_calling: true,
        max_calls_per_day: 3,
        calling_hours: { start: 8, end: 21 },
        special_restrictions: []
      };

      // Check basic TCPA hours (8 AM - 9 PM)
      const tcpaStart = 8;
      const tcpaEnd = 21;
      
      // Use more restrictive of TCPA or state regulations
      const startHour = Math.max(tcpaStart, regulations.calling_hours.start);
      const endHour = Math.min(tcpaEnd, regulations.calling_hours.end);

      let isWithinHours = true;
      let nextAllowedTime: Date | undefined;

      // Check hours
      if (hour < startHour || hour >= endHour) {
        isWithinHours = false;
        nextAllowedTime = hour < startHour ? 
          localTime.clone().hour(startHour).minute(0).second(0).toDate() :
          localTime.clone().add(1, 'day').hour(startHour).minute(0).second(0).toDate();
      }

      // Check Sunday restrictions
      if (day === 0 && !regulations.sunday_calling) {
        isWithinHours = false;
        nextAllowedTime = localTime.clone().add(1, 'day').hour(startHour).minute(0).second(0).toDate();
      }

      return {
        is_within_hours: isWithinHours,
        local_time: localTime.format('h:mm A'),
        next_allowed_time: nextAllowedTime,
        timezone: leadTimezone
      };

    } catch (error) {
      console.error('Calling hours check error:', error);
      
      // Return safe default
      return {
        is_within_hours: true,
        local_time: 'unknown',
        timezone: 'UTC'
      };
    }
  }

  /**
   * Check frequency limits
   */
  private async checkFrequencyLimits(params: ComplianceCheckParams): Promise<FrequencyCheckResult> {
    const client = await this.pool.connect();
    
    try {
      // Get state regulations
      const state = this.getStateFromPhoneNumber(params.phone_number);
      const regulations = this.stateRegulations.get(state);
      const maxCallsPerDay = regulations?.max_calls_per_day || 3;

      // Check calls in last 24 hours
      const recentCallsResult = await client.query(`
        SELECT COUNT(*) as call_count
        FROM vapi_call_attempts
        WHERE phone_number_id IN (
          SELECT vapi_phone_number_id FROM campaign_phone_numbers 
          WHERE campaign_id = $1
        )
        AND created_at > NOW() - INTERVAL '24 hours'
      `, [params.campaign_id]);

      const recentCalls = parseInt(recentCallsResult.rows[0].call_count);

      // Check calls to this specific number in last 30 days
      const numberCallsResult = await client.query(`
        SELECT COUNT(*) as call_count
        FROM vapi_call_attempts vca
        JOIN crm_leads cl ON cl.id = vca.lead_id
        WHERE cl.phone_number = $1
        AND vca.created_at > NOW() - INTERVAL '30 days'
      `, [params.phone_number]);

      const numberCalls = parseInt(numberCallsResult.rows[0].call_count);

      // TCPA allows max 3 calls per number per 30 days
      const maxCallsPerNumber = 3;
      const isWithinLimit = recentCalls < maxCallsPerDay && numberCalls < maxCallsPerNumber;

      return {
        is_within_limit: isWithinLimit,
        recent_calls: Math.max(recentCalls, numberCalls),
        max_allowed: Math.min(maxCallsPerDay, maxCallsPerNumber),
        reset_date: !isWithinLimit ? new Date(Date.now() + 24 * 60 * 60 * 1000) : undefined
      };

    } finally {
      client.release();
    }
  }

  /**
   * Check state-specific regulations
   */
  private async checkStateRegulations(phoneNumber: string): Promise<{
    violations: string[];
    recommendations: string[];
  }> {
    const violations: string[] = [];
    const recommendations: string[] = [];

    try {
      const state = this.getStateFromPhoneNumber(phoneNumber);
      const regulations = this.stateRegulations.get(state);

      if (regulations) {
        // Check special restrictions
        for (const restriction of regulations.special_restrictions) {
          switch (restriction) {
            case 'no_robocalls':
              recommendations.push('Ensure human-initiated calls only');
              break;
            case 'consent_required':
              recommendations.push('Obtain written consent before calling');
              break;
            case 'no_prerecorded':
              recommendations.push('Use live agents only, no prerecorded messages');
              break;
            case 'written_consent':
              recommendations.push('Obtain written consent documentation');
              break;
          }
        }
      }

      return { violations, recommendations };

    } catch (error) {
      console.error('State regulations check error:', error);
      return { violations: [], recommendations: [] };
    }
  }

  /**
   * Check violation history
   */
  private async checkViolationHistory(phoneNumber: string): Promise<{
    has_violations: boolean;
    violation_count: number;
    last_violation: Date | null;
  }> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT COUNT(*) as violation_count, MAX(created_at) as last_violation
        FROM compliance_logs
        WHERE phone_number = $1
        AND result = 'blocked'
        AND created_at > NOW() - INTERVAL '1 year'
      `, [phoneNumber]);

      const violationCount = parseInt(result.rows[0].violation_count);
      const lastViolation = result.rows[0].last_violation;

      return {
        has_violations: violationCount > 0,
        violation_count: violationCount,
        last_violation: lastViolation
      };

    } finally {
      client.release();
    }
  }

  /**
   * Check consent status
   */
  private async checkConsent(phoneNumber: string, campaignId: string): Promise<{
    has_consent: boolean;
    consent_type?: string;
    consent_date?: Date;
  }> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT * FROM compliance_records
        WHERE phone_number = $1
        AND campaign_id = $2
        AND compliance_type = 'consent_capture'
        AND status = 'compliant'
        ORDER BY created_at DESC
        LIMIT 1
      `, [phoneNumber, campaignId]);

      if (result.rows.length > 0) {
        const consent = result.rows[0];
        return {
          has_consent: true,
          consent_type: consent.details?.consent_type || 'verbal',
          consent_date: consent.created_at
        };
      }

      return { has_consent: false };

    } finally {
      client.release();
    }
  }

  /**
   * Log compliance check
   */
  private async logComplianceCheck(
    params: ComplianceCheckParams,
    result: {
      allowed: boolean;
      reason?: string;
      blocked_until?: Date;
      compliance_score: number;
    }
  ): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        INSERT INTO compliance_logs (
          account_id, phone_number, campaign_id, action, result, reason, 
          blocked_until, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [
        params.account_id,
        params.phone_number,
        params.campaign_id,
        'comprehensive_check',
        result.allowed ? 'allowed' : 'blocked',
        result.reason,
        result.blocked_until,
        JSON.stringify({ compliance_score: result.compliance_score })
      ]);
    } finally {
      client.release();
    }
  }

  /**
   * Infer timezone from phone number
   */
  private inferTimezone(phoneNumber: string): string {
    try {
      const parsed = parsePhoneNumber(phoneNumber);
      const country = parsed?.country;
      
      // Enhanced timezone mapping
      const timezoneMap: Record<string, string> = {
        'US': 'America/New_York', // Default to Eastern for US
        'CA': 'America/Toronto',
        'GB': 'Europe/London',
        'AU': 'Australia/Sydney',
        'DE': 'Europe/Berlin',
        'FR': 'Europe/Paris',
        'JP': 'Asia/Tokyo',
        'IN': 'Asia/Kolkata',
        'BR': 'America/Sao_Paulo',
        'MX': 'America/Mexico_City'
      };
      
      return timezoneMap[country || 'US'] || 'America/New_York';
    } catch {
      return 'America/New_York';
    }
  }

  /**
   * Get state from phone number (US only)
   */
  private getStateFromPhoneNumber(phoneNumber: string): string {
    try {
      const parsed = parsePhoneNumber(phoneNumber);
      
      if (parsed?.country !== 'US') {
        return 'NON_US';
      }

      const areaCode = parsed.nationalNumber.toString().substr(0, 3);
      
      // Map area codes to states (simplified)
      const areaCodeMap: Record<string, string> = {
        '212': 'NY', '213': 'CA', '214': 'TX', '215': 'PA',
        '216': 'OH', '217': 'IL', '218': 'MN', '219': 'IN',
        '305': 'FL', '310': 'CA', '312': 'IL', '313': 'MI',
        '314': 'MO', '315': 'NY', '316': 'KS', '317': 'IN',
        '404': 'GA', '405': 'OK', '406': 'MT', '407': 'FL',
        '408': 'CA', '409': 'TX', '410': 'MD', '412': 'PA',
        '504': 'LA', '505': 'NM', '506': 'NB', '507': 'MN',
        '508': 'MA', '509': 'WA', '510': 'CA', '512': 'TX',
        '602': 'AZ', '603': 'NH', '604': 'BC', '605': 'SD',
        '606': 'KY', '607': 'NY', '608': 'WI', '609': 'NJ',
        '702': 'NV', '703': 'VA', '704': 'NC', '705': 'ON',
        '706': 'GA', '707': 'CA', '708': 'IL', '709': 'NL',
        '712': 'IA', '713': 'TX', '714': 'CA', '715': 'WI',
        '716': 'NY', '717': 'PA', '718': 'NY', '719': 'CO',
        '802': 'VT', '803': 'SC', '804': 'VA', '805': 'CA',
        '806': 'TX', '807': 'ON', '808': 'HI', '809': 'DO',
        '810': 'MI', '812': 'IN', '813': 'FL', '814': 'PA',
        '815': 'IL', '816': 'MO', '817': 'TX', '818': 'CA',
        '819': 'QC', '901': 'TN', '902': 'NS', '903': 'TX',
        '904': 'FL', '905': 'ON', '906': 'MI', '907': 'AK',
        '908': 'NJ', '909': 'CA', '910': 'NC', '912': 'GA',
        '913': 'KS', '914': 'NY', '915': 'TX', '916': 'CA',
        '917': 'NY', '918': 'OK', '919': 'NC'
      };
      
      return areaCodeMap[areaCode] || 'US';
    } catch {
      return 'US';
    }
  }

  /**
   * Record consent
   */
  async recordConsent(
    phoneNumber: string,
    campaignId: string,
    accountId: string,
    consentType: 'verbal' | 'written' | 'electronic',
    consentDetails: any
  ): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        INSERT INTO compliance_records (
          account_id, phone_number, campaign_id, compliance_type, status, 
          details, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        accountId,
        phoneNumber,
        campaignId,
        'consent_capture',
        'compliant',
        JSON.stringify({ consent_type: consentType, ...consentDetails })
      ]);
    } finally {
      client.release();
    }
  }

  /**
   * Add number to internal DNC list
   */
  async addToDNC(
    phoneNumber: string,
    accountId: string,
    reason: string,
    source: string = 'manual'
  ): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      // Check if DNC list exists
      let dncListResult = await client.query(`
        SELECT id FROM dnc_lists
        WHERE account_id = $1 AND source = $2
      `, [accountId, source]);

      let dncListId;
      if (dncListResult.rows.length === 0) {
        // Create new DNC list
        const newListResult = await client.query(`
          INSERT INTO dnc_lists (account_id, name, source, phone_numbers, created_at)
          VALUES ($1, $2, $3, $4, NOW())
          RETURNING id
        `, [accountId, `Internal DNC List - ${source}`, source, [phoneNumber]]);
        
        dncListId = newListResult.rows[0].id;
      } else {
        // Add to existing list
        dncListId = dncListResult.rows[0].id;
        await client.query(`
          UPDATE dnc_lists
          SET phone_numbers = array_append(phone_numbers, $1),
              last_updated = NOW()
          WHERE id = $2
          AND NOT ($1 = ANY(phone_numbers))
        `, [phoneNumber, dncListId]);
      }

      // Log the addition
      await client.query(`
        INSERT INTO compliance_logs (
          account_id, phone_number, action, result, reason, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        accountId,
        phoneNumber,
        'dnc_addition',
        'blocked',
        reason,
        JSON.stringify({ source, dnc_list_id: dncListId })
      ]);

    } finally {
      client.release();
    }
  }

  /**
   * Get compliance dashboard data
   */
  async getComplianceDashboard(accountId: string): Promise<{
    total_checks: number;
    allowed_calls: number;
    blocked_calls: number;
    dnc_blocks: number;
    time_blocks: number;
    frequency_blocks: number;
    compliance_score: number;
    recent_violations: any[];
  }> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          COUNT(*) as total_checks,
          COUNT(*) FILTER (WHERE result = 'allowed') as allowed_calls,
          COUNT(*) FILTER (WHERE result = 'blocked') as blocked_calls,
          COUNT(*) FILTER (WHERE reason LIKE '%DNC%') as dnc_blocks,
          COUNT(*) FILTER (WHERE reason LIKE '%hours%') as time_blocks,
          COUNT(*) FILTER (WHERE reason LIKE '%frequency%') as frequency_blocks,
          AVG(CAST(metadata->>'compliance_score' AS NUMERIC)) as avg_compliance_score
        FROM compliance_logs
        WHERE account_id = $1
        AND created_at > NOW() - INTERVAL '30 days'
      `, [accountId]);

      const violations = await client.query(`
        SELECT phone_number, reason, created_at
        FROM compliance_logs
        WHERE account_id = $1
        AND result = 'blocked'
        AND created_at > NOW() - INTERVAL '7 days'
        ORDER BY created_at DESC
        LIMIT 10
      `, [accountId]);

      const stats = result.rows[0];

      return {
        total_checks: parseInt(stats.total_checks),
        allowed_calls: parseInt(stats.allowed_calls),
        blocked_calls: parseInt(stats.blocked_calls),
        dnc_blocks: parseInt(stats.dnc_blocks),
        time_blocks: parseInt(stats.time_blocks),
        frequency_blocks: parseInt(stats.frequency_blocks),
        compliance_score: parseFloat(stats.avg_compliance_score) || 0,
        recent_violations: violations.rows
      };

    } finally {
      client.release();
    }
  }
}