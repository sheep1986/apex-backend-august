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
exports.ComplianceService = void 0;
const moment = __importStar(require("moment-timezone"));
const libphonenumber_js_1 = require("libphonenumber-js");
const axios_1 = __importDefault(require("axios"));
class ComplianceService {
    constructor(pool) {
        this.pool = pool;
        this.dncApiUrl = process.env.DNC_API_URL || 'https://api.dnc.gov/v1';
        this.dncApiKey = process.env.DNC_API_KEY || '';
        this.initializeStateRegulations();
    }
    initializeStateRegulations() {
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
        ]);
    }
    async checkCompliance(params) {
        const violations = [];
        const recommendations = [];
        let complianceScore = 100;
        let blockedUntil;
        try {
            const dncResult = await this.checkDNCRegistry(params.phone_number);
            if (dncResult.is_listed) {
                violations.push(`Phone number is on ${dncResult.list_source} DNC list`);
                complianceScore -= 50;
                blockedUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
            }
            const hoursResult = await this.checkCallingHours(params.phone_number, params.timezone);
            if (!hoursResult.is_within_hours) {
                violations.push(`Outside calling hours (${hoursResult.local_time} in ${hoursResult.timezone})`);
                complianceScore -= 30;
                blockedUntil = hoursResult.next_allowed_time;
            }
            const frequencyResult = await this.checkFrequencyLimits(params);
            if (!frequencyResult.is_within_limit) {
                violations.push(`Exceeds frequency limit (${frequencyResult.recent_calls}/${frequencyResult.max_allowed})`);
                complianceScore -= 25;
                blockedUntil = frequencyResult.reset_date;
            }
            const stateResult = await this.checkStateRegulations(params.phone_number);
            if (stateResult.violations.length > 0) {
                violations.push(...stateResult.violations);
                complianceScore -= 20;
            }
            const violationHistory = await this.checkViolationHistory(params.phone_number);
            if (violationHistory.has_violations) {
                violations.push('Previous compliance violations on record');
                complianceScore -= 15;
            }
            const consentResult = await this.checkConsent(params.phone_number, params.campaign_id);
            if (!consentResult.has_consent) {
                recommendations.push('Obtain explicit consent before calling');
                complianceScore -= 10;
            }
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
        }
        catch (error) {
            console.error('Compliance check error:', error);
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
    async checkDNCRegistry(phoneNumber) {
        try {
            const internalResult = await this.checkInternalDNC(phoneNumber);
            if (internalResult.is_listed) {
                return internalResult;
            }
            if (this.dncApiKey) {
                const response = await axios_1.default.get(`${this.dncApiUrl}/check/${phoneNumber}`, {
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
        }
        catch (error) {
            console.error('DNC check error:', error);
            return {
                is_listed: false,
                list_source: 'error',
                reason: `DNC check failed: ${error.message}`
            };
        }
    }
    async checkInternalDNC(phoneNumber) {
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
        }
        finally {
            client.release();
        }
    }
    async checkCallingHours(phoneNumber, timezone) {
        try {
            const leadTimezone = timezone || this.inferTimezone(phoneNumber);
            const localTime = moment().tz(leadTimezone);
            const hour = localTime.hour();
            const day = localTime.day();
            const state = this.getStateFromPhoneNumber(phoneNumber);
            const regulations = this.stateRegulations.get(state) || {
                state: 'DEFAULT',
                sunday_calling: true,
                max_calls_per_day: 3,
                calling_hours: { start: 8, end: 21 },
                special_restrictions: []
            };
            const tcpaStart = 8;
            const tcpaEnd = 21;
            const startHour = Math.max(tcpaStart, regulations.calling_hours.start);
            const endHour = Math.min(tcpaEnd, regulations.calling_hours.end);
            let isWithinHours = true;
            let nextAllowedTime;
            if (hour < startHour || hour >= endHour) {
                isWithinHours = false;
                nextAllowedTime = hour < startHour ?
                    localTime.clone().hour(startHour).minute(0).second(0).toDate() :
                    localTime.clone().add(1, 'day').hour(startHour).minute(0).second(0).toDate();
            }
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
        }
        catch (error) {
            console.error('Calling hours check error:', error);
            return {
                is_within_hours: true,
                local_time: 'unknown',
                timezone: 'UTC'
            };
        }
    }
    async checkFrequencyLimits(params) {
        const client = await this.pool.connect();
        try {
            const state = this.getStateFromPhoneNumber(params.phone_number);
            const regulations = this.stateRegulations.get(state);
            const maxCallsPerDay = regulations?.max_calls_per_day || 3;
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
            const numberCallsResult = await client.query(`
        SELECT COUNT(*) as call_count
        FROM vapi_call_attempts vca
        JOIN crm_leads cl ON cl.id = vca.lead_id
        WHERE cl.phone_number = $1
        AND vca.created_at > NOW() - INTERVAL '30 days'
      `, [params.phone_number]);
            const numberCalls = parseInt(numberCallsResult.rows[0].call_count);
            const maxCallsPerNumber = 3;
            const isWithinLimit = recentCalls < maxCallsPerDay && numberCalls < maxCallsPerNumber;
            return {
                is_within_limit: isWithinLimit,
                recent_calls: Math.max(recentCalls, numberCalls),
                max_allowed: Math.min(maxCallsPerDay, maxCallsPerNumber),
                reset_date: !isWithinLimit ? new Date(Date.now() + 24 * 60 * 60 * 1000) : undefined
            };
        }
        finally {
            client.release();
        }
    }
    async checkStateRegulations(phoneNumber) {
        const violations = [];
        const recommendations = [];
        try {
            const state = this.getStateFromPhoneNumber(phoneNumber);
            const regulations = this.stateRegulations.get(state);
            if (regulations) {
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
        }
        catch (error) {
            console.error('State regulations check error:', error);
            return { violations: [], recommendations: [] };
        }
    }
    async checkViolationHistory(phoneNumber) {
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
        }
        finally {
            client.release();
        }
    }
    async checkConsent(phoneNumber, campaignId) {
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
        }
        finally {
            client.release();
        }
    }
    async logComplianceCheck(params, result) {
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
        }
        finally {
            client.release();
        }
    }
    inferTimezone(phoneNumber) {
        try {
            const parsed = (0, libphonenumber_js_1.parsePhoneNumber)(phoneNumber);
            const country = parsed?.country;
            const timezoneMap = {
                'US': 'America/New_York',
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
        }
        catch {
            return 'America/New_York';
        }
    }
    getStateFromPhoneNumber(phoneNumber) {
        try {
            const parsed = (0, libphonenumber_js_1.parsePhoneNumber)(phoneNumber);
            if (parsed?.country !== 'US') {
                return 'NON_US';
            }
            const areaCode = parsed.nationalNumber.toString().substr(0, 3);
            const areaCodeMap = {
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
        }
        catch {
            return 'US';
        }
    }
    async recordConsent(phoneNumber, campaignId, accountId, consentType, consentDetails) {
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
        }
        finally {
            client.release();
        }
    }
    async addToDNC(phoneNumber, accountId, reason, source = 'manual') {
        const client = await this.pool.connect();
        try {
            let dncListResult = await client.query(`
        SELECT id FROM dnc_lists
        WHERE account_id = $1 AND source = $2
      `, [accountId, source]);
            let dncListId;
            if (dncListResult.rows.length === 0) {
                const newListResult = await client.query(`
          INSERT INTO dnc_lists (account_id, name, source, phone_numbers, created_at)
          VALUES ($1, $2, $3, $4, NOW())
          RETURNING id
        `, [accountId, `Internal DNC List - ${source}`, source, [phoneNumber]]);
                dncListId = newListResult.rows[0].id;
            }
            else {
                dncListId = dncListResult.rows[0].id;
                await client.query(`
          UPDATE dnc_lists
          SET phone_numbers = array_append(phone_numbers, $1),
              last_updated = NOW()
          WHERE id = $2
          AND NOT ($1 = ANY(phone_numbers))
        `, [phoneNumber, dncListId]);
            }
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
        }
        finally {
            client.release();
        }
    }
    async getComplianceDashboard(accountId) {
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
        }
        finally {
            client.release();
        }
    }
}
exports.ComplianceService = ComplianceService;
