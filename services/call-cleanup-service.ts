import cron from 'node-cron';
import supabase from './supabase-client';

export class CallCleanupService {
  private cleanupTask: cron.ScheduledTask | null = null;

  /**
   * Start the cleanup service
   */
  start() {
    // Run cleanup every 5 minutes
    this.cleanupTask = cron.schedule('*/5 * * * *', async () => {
      await this.cleanupStuckCalls();
    });

    console.log('🧹 Call cleanup service started (runs every 5 minutes)');
    
    // Run immediately on start
    this.cleanupStuckCalls();
  }

  /**
   * Stop the cleanup service
   */
  stop() {
    if (this.cleanupTask) {
      this.cleanupTask.stop();
      console.log('🛑 Call cleanup service stopped');
    }
  }

  /**
   * Clean up stuck calls
   */
  private async cleanupStuckCalls() {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      // Find stuck calls in 'in_progress' or 'initiated' status
      const { data: stuckCalls, error: findError } = await supabase
        .from('calls')
        .select('*')
        .in('status', ['in_progress', 'initiated'])
        .lt('created_at', fiveMinutesAgo);

      if (findError) {
        console.error('❌ Error finding stuck calls:', findError);
        return;
      }

      if (!stuckCalls || stuckCalls.length === 0) {
        return; // No stuck calls
      }

      console.log(`🧹 Found ${stuckCalls.length} stuck calls to clean up`);

      for (const call of stuckCalls) {
        // Determine outcome based on duration
        const outcome = call.duration < 2 ? 'failed' : 'voicemail';

        // Update the call status
        const { error: updateError } = await supabase
          .from('calls')
          .update({
            status: 'completed',
            outcome: outcome,
            updated_at: new Date().toISOString()
          })
          .eq('id', call.id);

        if (updateError) {
          console.error(`❌ Error updating call ${call.id}:`, updateError);
          continue;
        }

        // Update related call queue entry
        if (call.vapi_call_id) {
          const { data: queueEntry, error: queueError } = await supabase
            .from('call_queue')
            .select('*')
            .eq('last_call_id', call.vapi_call_id)
            .single();

          if (queueEntry && !queueError) {
            await supabase
              .from('call_queue')
              .update({
                status: 'failed',
                last_outcome: outcome,
                updated_at: new Date().toISOString()
              })
              .eq('id', queueEntry.id);

            // Schedule retry for failed calls
            if (outcome === 'failed' && queueEntry.attempt < 3) {
              await this.scheduleRetry(queueEntry);
            }
          }
        }

        console.log(`✅ Cleaned up stuck call ${call.id} (${outcome})`);
      }

      // Also clean up stuck call_queue entries
      const { data: stuckQueueEntries, error: queueFindError } = await supabase
        .from('call_queue')
        .select('*')
        .eq('status', 'calling')
        .lt('updated_at', fiveMinutesAgo);

      if (!queueFindError && stuckQueueEntries && stuckQueueEntries.length > 0) {
        console.log(`🧹 Found ${stuckQueueEntries.length} stuck queue entries`);

        for (const entry of stuckQueueEntries) {
          await supabase
            .from('call_queue')
            .update({
              status: 'failed',
              last_outcome: 'timeout',
              updated_at: new Date().toISOString()
            })
            .eq('id', entry.id);

          // Schedule retry
          if (entry.attempt < 3) {
            await this.scheduleRetry(entry);
          }
        }
      }

    } catch (error) {
      console.error('❌ Error in cleanup service:', error);
    }
  }

  /**
   * Schedule a retry for a failed call
   */
  private async scheduleRetry(queueEntry: any) {
    const retryEntry = {
      campaign_id: queueEntry.campaign_id,
      contact_id: queueEntry.contact_id,
      phone_number: queueEntry.phone_number,
      contact_name: queueEntry.contact_name,
      attempt: queueEntry.attempt + 1,
      scheduled_for: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('call_queue')
      .insert(retryEntry);

    if (!error) {
      console.log(`🔄 Scheduled retry for ${queueEntry.contact_name}`);
    }
  }
}

// Export singleton instance
export const callCleanupService = new CallCleanupService();