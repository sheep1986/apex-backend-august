"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const router = (0, express_1.Router)();
router.post('/ai-qualification', async (req, res) => {
    try {
        console.log('🔄 Starting AI qualification migration...');
        const { data: columns, error: checkError } = await supabase_client_1.default
            .from('information_schema.columns')
            .select('column_name')
            .eq('table_name', 'calls')
            .eq('column_name', 'ai_confidence_score');
        if (checkError) {
            console.log('ℹ️ Could not check existing columns (this is normal)');
        }
        if (columns && columns.length > 0) {
            console.log('✅ AI qualification columns already exist');
            return res.json({
                success: true,
                message: 'AI qualification columns already exist',
                alreadyExists: true
            });
        }
        console.log('🔄 Adding AI qualification columns...');
        const { data: testCall } = await supabase_client_1.default
            .from('calls')
            .select('id, ai_confidence_score, ai_recommendation, qualification_status')
            .limit(1)
            .single();
        if (testCall && testCall.ai_confidence_score !== undefined) {
            console.log('✅ Columns already exist (verified by test query)');
            return res.json({
                success: true,
                message: 'AI qualification columns already exist',
                alreadyExists: true
            });
        }
        console.log('❌ Columns do not exist. Please run the following SQL manually in Supabase:');
        const sqlCommands = [
            'ALTER TABLE calls ADD COLUMN IF NOT EXISTS ai_confidence_score DECIMAL(3,2) DEFAULT NULL;',
            'ALTER TABLE calls ADD COLUMN IF NOT EXISTS ai_recommendation VARCHAR(20) DEFAULT NULL;',
            'ALTER TABLE calls ADD COLUMN IF NOT EXISTS qualification_status VARCHAR(30) DEFAULT \'pending\';',
            'ALTER TABLE calls ADD COLUMN IF NOT EXISTS created_crm_contact BOOLEAN DEFAULT FALSE;',
            'UPDATE calls SET qualification_status = \'pending\' WHERE qualification_status IS NULL;'
        ];
        res.json({
            success: false,
            message: 'Manual migration required',
            manualSteps: true,
            sqlCommands,
            instructions: 'Please run these SQL commands in the Supabase SQL editor'
        });
    }
    catch (error) {
        console.error('❌ Migration error:', error);
        res.status(500).json({
            error: 'Migration failed',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/status', async (req, res) => {
    try {
        const { data, error } = await supabase_client_1.default
            .from('calls')
            .select('id, ai_confidence_score, ai_recommendation, qualification_status, created_crm_contact')
            .limit(1);
        if (error) {
            return res.json({
                aiQualificationMigrated: false,
                error: error.message,
                needsMigration: true
            });
        }
        return res.json({
            aiQualificationMigrated: true,
            needsMigration: false,
            sampleData: data?.[0] || null
        });
    }
    catch (error) {
        res.status(500).json({
            error: 'Status check failed',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.post('/campaign-automation', async (req, res) => {
    try {
        console.log('🔄 Starting campaign automation migration...');
        const sqlPath = path_1.default.join(__dirname, '../../../campaign-automation-schema.sql');
        if (!fs_1.default.existsSync(sqlPath)) {
            return res.status(400).json({
                error: 'Migration file not found',
                expectedPath: sqlPath
            });
        }
        const sqlContent = fs_1.default.readFileSync(sqlPath, 'utf8');
        const commands = sqlContent
            .split(';')
            .map(cmd => cmd.trim())
            .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));
        const results = [];
        let successCount = 0;
        let errorCount = 0;
        for (const command of commands) {
            try {
                if (command.toLowerCase().includes('create table') ||
                    command.toLowerCase().includes('alter table') ||
                    command.toLowerCase().includes('create index') ||
                    command.toLowerCase().includes('create or replace')) {
                    console.log(`🔄 Executing: ${command.substring(0, 50)}...`);
                    const { error } = await supabase_client_1.default.rpc('exec_sql', { sql_query: command });
                    if (error) {
                        console.log(`⚠️ Command might have failed (could be normal if already exists): ${error.message}`);
                        errorCount++;
                        results.push({
                            command: command.substring(0, 100),
                            status: 'warning',
                            message: error.message
                        });
                    }
                    else {
                        console.log(`✅ Successfully executed command`);
                        successCount++;
                        results.push({
                            command: command.substring(0, 100),
                            status: 'success',
                            message: 'Executed successfully'
                        });
                    }
                }
            }
            catch (cmdError) {
                console.error(`❌ Error executing command: ${cmdError}`);
                errorCount++;
                results.push({
                    command: command.substring(0, 100),
                    status: 'error',
                    message: cmdError instanceof Error ? cmdError.message : 'Unknown error'
                });
            }
        }
        const { data: tables, error: tablesError } = await supabase_client_1.default
            .from('information_schema.tables')
            .select('table_name')
            .eq('table_schema', 'public')
            .in('table_name', ['campaign_contacts', 'call_queue', 'campaign_daily_stats']);
        console.log('✅ Campaign automation migration completed!');
        res.json({
            success: true,
            message: 'Campaign automation migration completed',
            stats: {
                totalCommands: commands.length,
                successCount,
                errorCount,
                warningCount: errorCount
            },
            tablesCreated: tables?.map(t => t.table_name) || [],
            results: results.slice(0, 10)
        });
    }
    catch (error) {
        console.error('❌ Campaign automation migration failed:', error);
        res.status(500).json({
            error: 'Migration failed',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.post('/apex-id', async (req, res) => {
    try {
        console.log('🔄 Starting apex_id migration...');
        const { data: testCampaign } = await supabase_client_1.default
            .from('campaigns')
            .select('id, apex_id')
            .limit(1)
            .single();
        if (testCampaign && testCampaign.apex_id !== undefined) {
            console.log('✅ apex_id column already exists');
            return res.json({
                success: true,
                message: 'apex_id column already exists',
                alreadyExists: true
            });
        }
        console.log('🔄 Adding apex_id column...');
        const { error: addColumnError } = await supabase_client_1.default.rpc('exec_sql', {
            sql: `
        -- Add apex_id column
        ALTER TABLE campaigns 
        ADD COLUMN IF NOT EXISTS apex_id VARCHAR(10);
        
        -- Create index
        CREATE INDEX IF NOT EXISTS idx_campaigns_apex_id ON campaigns(apex_id);
        
        -- Add constraint for format validation
        ALTER TABLE campaigns 
        DROP CONSTRAINT IF EXISTS chk_apex_id_format;
        
        ALTER TABLE campaigns 
        ADD CONSTRAINT chk_apex_id_format 
        CHECK (apex_id IS NULL OR apex_id ~ '^apex[0-9]{5}$');
      `
        });
        if (addColumnError) {
            console.error('❌ Error adding apex_id column:', addColumnError);
            return res.status(500).json({
                success: false,
                error: 'Failed to add apex_id column',
                details: addColumnError
            });
        }
        console.log('✅ apex_id column added successfully');
        console.log('🔄 Generating apex_id for existing campaigns...');
        const { data: campaigns, error: fetchError } = await supabase_client_1.default
            .from('campaigns')
            .select('id, organization_id, apex_id')
            .is('apex_id', null);
        if (fetchError) {
            console.error('❌ Error fetching campaigns:', fetchError);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch campaigns for ID generation'
            });
        }
        if (!campaigns || campaigns.length === 0) {
            console.log('✅ No campaigns need apex_id generation');
            return res.json({
                success: true,
                message: 'apex_id column added, no existing campaigns to update'
            });
        }
        let updatedCount = 0;
        for (const campaign of campaigns) {
            let apexId;
            let attempts = 0;
            const maxAttempts = 10;
            do {
                const numbers = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
                apexId = `apex${numbers}`;
                attempts++;
                const { data: existingCampaign } = await supabase_client_1.default
                    .from('campaigns')
                    .select('id')
                    .eq('organization_id', campaign.organization_id)
                    .eq('apex_id', apexId)
                    .single();
                if (!existingCampaign) {
                    break;
                }
                if (attempts >= maxAttempts) {
                    console.error(`❌ Failed to generate unique apex_id for campaign ${campaign.id}`);
                    return res.status(500).json({
                        success: false,
                        error: `Failed to generate unique apex_id for campaign ${campaign.id}`
                    });
                }
            } while (attempts < maxAttempts);
            const { error: updateError } = await supabase_client_1.default
                .from('campaigns')
                .update({ apex_id: apexId })
                .eq('id', campaign.id);
            if (updateError) {
                console.error(`❌ Error updating campaign ${campaign.id}:`, updateError);
                return res.status(500).json({
                    success: false,
                    error: `Failed to update campaign ${campaign.id} with apex_id`
                });
            }
            updatedCount++;
            console.log(`✅ Updated campaign ${campaign.id} with apex_id: ${apexId}`);
        }
        const { error: notNullError } = await supabase_client_1.default.rpc('exec_sql', {
            sql: `ALTER TABLE campaigns ALTER COLUMN apex_id SET NOT NULL;`
        });
        if (notNullError) {
            console.warn('⚠️ Could not set apex_id as NOT NULL:', notNullError);
        }
        console.log(`✅ Migration completed! Updated ${updatedCount} campaigns`);
        res.json({
            success: true,
            message: `apex_id migration completed successfully`,
            updatedCampaigns: updatedCount
        });
    }
    catch (error) {
        console.error('❌ Migration error:', error);
        res.status(500).json({
            success: false,
            error: 'Migration failed',
            details: error.message
        });
    }
});
exports.default = router;
