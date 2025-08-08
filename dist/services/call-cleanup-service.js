"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callCleanupService = exports.CallCleanupService = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const supabase_client_1 = __importDefault(require("./supabase-client"));
class CallCleanupService {
    constructor() {
        this.cleanupTask = null;
    }
    start() {
        this.cleanupTask = node_cron_1.default.schedule('*/5 * * * *', async () => {
            await this.cleanupStuckCalls();
        });
        console.log('🧹 Call cleanup service started (runs every 5 minutes)');
        this.cleanupStuckCalls();
    }
    stop() {
        if (this.cleanupTask) {
            this.cleanupTask.stop();
            console.log('🛑 Call cleanup service stopped');
        }
    }
    async cleanupStuckCalls() {
        try {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            const { data: stuckCalls, error: findError } = await supabase_client_1.default
                .from('calls')
                .select('*')
                .in('status', ['in_progress', 'initiated'])
                .lt('created_at', fiveMinutesAgo);
            if (findError) {
                console.error('❌ Error finding stuck calls:', findError);
                return;
            }
            if (!stuckCalls || stuckCalls.length === 0) {
                return;
            }
            console.log(`🧹 Found ${stuckCalls.length} stuck calls to clean up`);
            for (const call of stuckCalls) {
                const outcome = call.duration < 2 ? 'failed' : 'voicemail';
                const { error: updateError } = await supabase_client_1.default
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
                if (call.vapi_call_id) {
                    const { data: queueEntry, error: queueError } = await supabase_client_1.default
                        .from('call_queue')
                        .select('*')
                        .eq('last_call_id', call.vapi_call_id)
                        .single();
                    if (queueEntry && !queueError) {
                        await supabase_client_1.default
                            .from('call_queue')
                            .update({
                            status: 'failed',
                            last_outcome: outcome,
                            updated_at: new Date().toISOString()
                        })
                            .eq('id', queueEntry.id);
                        if (outcome === 'failed' && queueEntry.attempt < 3) {
                            await this.scheduleRetry(queueEntry);
                        }
                    }
                }
                console.log(`✅ Cleaned up stuck call ${call.id} (${outcome})`);
            }
            const { data: stuckQueueEntries, error: queueFindError } = await supabase_client_1.default
                .from('call_queue')
                .select('*')
                .eq('status', 'calling')
                .lt('updated_at', fiveMinutesAgo);
            if (!queueFindError && stuckQueueEntries && stuckQueueEntries.length > 0) {
                console.log(`🧹 Found ${stuckQueueEntries.length} stuck queue entries`);
                for (const entry of stuckQueueEntries) {
                    await supabase_client_1.default
                        .from('call_queue')
                        .update({
                        status: 'failed',
                        last_outcome: 'timeout',
                        updated_at: new Date().toISOString()
                    })
                        .eq('id', entry.id);
                    if (entry.attempt < 3) {
                        await this.scheduleRetry(entry);
                    }
                }
            }
        }
        catch (error) {
            console.error('❌ Error in cleanup service:', error);
        }
    }
    async scheduleRetry(queueEntry) {
        const retryEntry = {
            campaign_id: queueEntry.campaign_id,
            contact_id: queueEntry.contact_id,
            phone_number: queueEntry.phone_number,
            contact_name: queueEntry.contact_name,
            attempt: queueEntry.attempt + 1,
            scheduled_for: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        const { error } = await supabase_client_1.default
            .from('call_queue')
            .insert(retryEntry);
        if (!error) {
            console.log(`🔄 Scheduled retry for ${queueEntry.contact_name}`);
        }
    }
}
exports.CallCleanupService = CallCleanupService;
exports.callCleanupService = new CallCleanupService();
