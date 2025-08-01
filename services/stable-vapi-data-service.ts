import supabaseService from './supabase-client';

/**
 * Stable VAPI Data Service
 * 
 * Provides functions to extract and display captured VAPI webhook data
 * without dependencies on complex org structures.
 */

export interface VapiWebhookData {
  id: string;
  webhook_type: string;
  webhook_timestamp: string;
  vapi_call_id: string;
  phone_number?: string;
  caller_number?: string;
  user_email?: string;
  call_status?: string;
  call_direction?: string;
  call_duration?: number;
  call_cost?: number;
  call_started_at?: string;
  call_ended_at?: string;
  end_reason?: string;
  transcript?: string;
  summary?: string;
  recording_url?: string;
  raw_webhook_payload: any;
  created_at: string;
}

export interface CallSummary {
  callId: string;
  userEmail: string;
  phoneNumber: string;
  status: string;
  duration: number;
  cost: number;
  transcript?: string;
  summary?: string;
  recordingUrl?: string;
  startedAt: string;
  endedAt?: string;
  endReason?: string;
  sentiment?: string;
  eventTypes: string[];
  totalEvents: number;
  lastUpdated: string;
}

export interface UserCallStats {
  userEmail: string;
  totalCalls: number;
  completedCalls: number;
  totalDuration: number;
  totalCost: number;
  lastCallDate?: string;
  avgCallDuration: number;
  completionRate: number;
}

export class StableVapiDataService {
  
  /**
   * Get all webhook data with optional filtering
   */
  static async getWebhookData(filters: {
    userEmail?: string;
    webhookType?: string;
    callStatus?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ data: VapiWebhookData[]; total: number; error?: string }> {
    try {
      const {
        userEmail,
        webhookType,
        callStatus,
        startDate,
        endDate,
        limit = 50,
        offset = 0
      } = filters;

      let query = supabaseService
        .from('vapi_webhook_data')
        .select('*', { count: 'exact' })
        .order('webhook_timestamp', { ascending: false });

      // Apply filters
      if (userEmail) {
        query = query.eq('user_email', userEmail);
      }
      if (webhookType) {
        query = query.eq('webhook_type', webhookType);
      }
      if (callStatus) {
        query = query.eq('call_status', callStatus);
      }
      if (startDate) {
        query = query.gte('webhook_timestamp', startDate);
      }
      if (endDate) {
        query = query.lte('webhook_timestamp', endDate);
      }

      // Apply pagination
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        console.error('❌ Error fetching webhook data:', error);
        return { data: [], total: 0, error: error.message };
      }

      return { data: data || [], total: count || 0 };
    } catch (error) {
      console.error('❌ Error in getWebhookData:', error);
      return { 
        data: [], 
        total: 0, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get all webhook events for a specific call
   */
  static async getCallEvents(callId: string): Promise<{ 
    events: VapiWebhookData[]; 
    summary: CallSummary | null; 
    error?: string 
  }> {
    try {
      const { data, error } = await supabaseService
        .from('vapi_webhook_data')
        .select('*')
        .eq('vapi_call_id', callId)
        .order('webhook_timestamp', { ascending: true });

      if (error) {
        console.error('❌ Error fetching call events:', error);
        return { events: [], summary: null, error: error.message };
      }

      if (!data || data.length === 0) {
        return { events: [], summary: null, error: 'Call not found' };
      }

      const summary = this.buildCallSummary(data);
      return { events: data, summary };
    } catch (error) {
      console.error('❌ Error in getCallEvents:', error);
      return { 
        events: [], 
        summary: null, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get call statistics for a user
   */
  static async getUserCallStats(userEmail: string): Promise<UserCallStats | null> {
    try {
      // Get all call-ended events for the user to calculate stats
      const { data, error } = await supabaseService
        .from('vapi_webhook_data')
        .select('vapi_call_id, call_duration, call_cost, call_status, webhook_timestamp, call_ended_at')
        .eq('user_email', userEmail)
        .eq('webhook_type', 'call-ended');

      if (error) {
        console.error('❌ Error fetching user call stats:', error);
        return null;
      }

      if (!data || data.length === 0) {
        return {
          userEmail,
          totalCalls: 0,
          completedCalls: 0,
          totalDuration: 0,
          totalCost: 0,
          avgCallDuration: 0,
          completionRate: 0
        };
      }

      // Calculate statistics
      const uniqueCalls = new Map();
      data.forEach(call => {
        uniqueCalls.set(call.vapi_call_id, call);
      });

      const calls = Array.from(uniqueCalls.values());
      const totalCalls = calls.length;
      const completedCalls = calls.filter(call => 
        call.call_status === 'completed' || call.call_status === 'ended'
      ).length;
      const totalDuration = calls.reduce((sum, call) => sum + (call.call_duration || 0), 0);
      const totalCost = calls.reduce((sum, call) => sum + (call.call_cost || 0), 0);
      const avgCallDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;
      const completionRate = totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0;
      
      const lastCallDate = calls
        .map(call => call.call_ended_at || call.webhook_timestamp)
        .filter(date => date)
        .sort()
        .pop();

      return {
        userEmail,
        totalCalls,
        completedCalls,
        totalDuration,
        totalCost,
        lastCallDate,
        avgCallDuration,
        completionRate
      };
    } catch (error) {
      console.error('❌ Error in getUserCallStats:', error);
      return null;
    }
  }

  /**
   * Get recent calls for a user
   */
  static async getUserRecentCalls(userEmail: string, limit: number = 10): Promise<CallSummary[]> {
    try {
      // Get recent call-ended events
      const { data, error } = await supabaseService
        .from('vapi_webhook_data')
        .select('*')
        .eq('user_email', userEmail)
        .eq('webhook_type', 'call-ended')
        .order('webhook_timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('❌ Error fetching recent calls:', error);
        return [];
      }

      if (!data || data.length === 0) {
        return [];
      }

      // For each call, get all its events to build a complete summary
      const callSummaries: CallSummary[] = [];
      for (const call of data) {
        const { events, summary } = await this.getCallEvents(call.vapi_call_id);
        if (summary) {
          callSummaries.push(summary);
        }
      }

      return callSummaries;
    } catch (error) {
      console.error('❌ Error in getUserRecentCalls:', error);
      return [];
    }
  }

  /**
   * Search calls by transcript content
   */
  static async searchCallsByTranscript(
    searchTerm: string, 
    userEmail?: string,
    limit: number = 20
  ): Promise<CallSummary[]> {
    try {
      let query = supabaseService
        .from('vapi_webhook_data')
        .select('*')
        .not('transcript', 'is', null)
        .ilike('transcript', `%${searchTerm}%`)
        .order('webhook_timestamp', { ascending: false })
        .limit(limit);

      if (userEmail) {
        query = query.eq('user_email', userEmail);
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Error searching calls by transcript:', error);
        return [];
      }

      if (!data || data.length === 0) {
        return [];
      }

      // Get unique calls and build summaries
      const uniqueCallIds = [...new Set(data.map(d => d.vapi_call_id))];
      const callSummaries: CallSummary[] = [];

      for (const callId of uniqueCallIds) {
        const { summary } = await this.getCallEvents(callId);
        if (summary) {
          callSummaries.push(summary);
        }
      }

      return callSummaries;
    } catch (error) {
      console.error('❌ Error in searchCallsByTranscript:', error);
      return [];
    }
  }

  /**
   * Get platform-wide statistics (for platform owner)
   */
  static async getPlatformStats(): Promise<{
    totalUsers: number;
    totalCalls: number;
    totalDuration: number;
    totalCost: number;
    last24Hours: {
      calls: number;
      duration: number;
      cost: number;
    };
    topUsers: Array<{
      email: string;
      callCount: number;
      totalDuration: number;
      totalCost: number;
    }>;
  }> {
    try {
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Get all call-ended events
      const { data: allCalls, error: allCallsError } = await supabaseService
        .from('vapi_webhook_data')
        .select('user_email, vapi_call_id, call_duration, call_cost, webhook_timestamp')
        .eq('webhook_type', 'call-ended');

      if (allCallsError) {
        console.error('❌ Error fetching platform stats:', allCallsError);
        return {
          totalUsers: 0,
          totalCalls: 0,
          totalDuration: 0,
          totalCost: 0,
          last24Hours: { calls: 0, duration: 0, cost: 0 },
          topUsers: []
        };
      }

      // Calculate stats
      const uniqueUsers = new Set(allCalls?.map(call => call.user_email).filter(Boolean));
      const uniqueCalls = new Map();
      
      allCalls?.forEach(call => {
        uniqueCalls.set(call.vapi_call_id, call);
      });

      const calls = Array.from(uniqueCalls.values());
      const totalCalls = calls.length;
      const totalDuration = calls.reduce((sum, call) => sum + (call.call_duration || 0), 0);
      const totalCost = calls.reduce((sum, call) => sum + (call.call_cost || 0), 0);

      // Last 24 hours stats
      const recent24HourCalls = calls.filter(call => 
        new Date(call.webhook_timestamp) > last24Hours
      );
      const last24HourStats = {
        calls: recent24HourCalls.length,
        duration: recent24HourCalls.reduce((sum, call) => sum + (call.call_duration || 0), 0),
        cost: recent24HourCalls.reduce((sum, call) => sum + (call.call_cost || 0), 0)
      };

      // Top users
      const userStats = new Map();
      calls.forEach(call => {
        if (call.user_email) {
          if (!userStats.has(call.user_email)) {
            userStats.set(call.user_email, {
              email: call.user_email,
              callCount: 0,
              totalDuration: 0,
              totalCost: 0
            });
          }
          const stats = userStats.get(call.user_email);
          stats.callCount++;
          stats.totalDuration += call.call_duration || 0;
          stats.totalCost += call.call_cost || 0;
        }
      });

      const topUsers = Array.from(userStats.values())
        .sort((a, b) => b.callCount - a.callCount)
        .slice(0, 10);

      return {
        totalUsers: uniqueUsers.size,
        totalCalls,
        totalDuration,
        totalCost,
        last24Hours: last24HourStats,
        topUsers
      };
    } catch (error) {
      console.error('❌ Error in getPlatformStats:', error);
      return {
        totalUsers: 0,
        totalCalls: 0,
        totalDuration: 0,
        totalCost: 0,
        last24Hours: { calls: 0, duration: 0, cost: 0 },
        topUsers: []
      };
    }
  }

  /**
   * Build a comprehensive call summary from webhook events
   */
  private static buildCallSummary(events: VapiWebhookData[]): CallSummary {
    const latestEvent = events[events.length - 1];
    const firstEvent = events[0];

    return {
      callId: latestEvent.vapi_call_id,
      userEmail: latestEvent.user_email || '',
      phoneNumber: latestEvent.phone_number || '',
      status: latestEvent.call_status || 'unknown',
      duration: latestEvent.call_duration || 0,
      cost: latestEvent.call_cost || 0,
      transcript: latestEvent.transcript,
      summary: latestEvent.summary,
      recordingUrl: latestEvent.recording_url,
      startedAt: firstEvent.call_started_at || firstEvent.webhook_timestamp,
      endedAt: latestEvent.call_ended_at,
      endReason: latestEvent.end_reason,
      sentiment: latestEvent.sentiment,
      eventTypes: [...new Set(events.map(e => e.webhook_type))],
      totalEvents: events.length,
      lastUpdated: latestEvent.webhook_timestamp
    };
  }

  /**
   * Export call data to CSV format
   */
  static async exportCallsToCSV(userEmail?: string, startDate?: string, endDate?: string): Promise<string> {
    try {
      const { data } = await this.getWebhookData({
        userEmail,
        startDate,
        endDate,
        webhookType: 'call-ended',
        limit: 10000
      });

      if (!data || data.length === 0) {
        return 'No data to export';
      }

      // CSV headers
      const headers = [
        'Call ID',
        'User Email',
        'Phone Number',
        'Status',
        'Duration (seconds)',
        'Cost',
        'Started At',
        'Ended At',
        'End Reason',
        'Has Transcript',
        'Has Recording',
        'Webhook Timestamp'
      ];

      // CSV rows
      const rows = data.map(call => [
        call.vapi_call_id,
        call.user_email || '',
        call.phone_number || '',
        call.call_status || '',
        call.call_duration || 0,
        call.call_cost || 0,
        call.call_started_at || '',
        call.call_ended_at || '',
        call.end_reason || '',
        call.transcript ? 'Yes' : 'No',
        call.recording_url ? 'Yes' : 'No',
        call.webhook_timestamp
      ]);

      // Combine headers and rows
      const csvContent = [headers, ...rows]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');

      return csvContent;
    } catch (error) {
      console.error('❌ Error exporting to CSV:', error);
      return 'Error exporting data';
    }
  }
}