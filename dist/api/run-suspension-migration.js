"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
async function runSuspensionMigration() {
    console.log('🚀 Running suspension columns migration...');
    try {
        const { data: testData, error: testError } = await supabase_client_1.default
            .from('users')
            .select('id')
            .limit(1);
        if (testError) {
            console.error('❌ Error connecting to database:', testError);
            return;
        }
        console.log('✅ Database connection successful');
        console.log('\n📝 Please run the following SQL in your Supabase SQL editor:');
        console.log('----------------------------------------');
        console.log(`
-- Add suspension-related columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

-- Add comments for documentation
COMMENT ON COLUMN users.suspended_at IS 'Timestamp when the user was suspended';
COMMENT ON COLUMN users.suspension_reason IS 'Reason for user suspension';
    `);
        console.log('----------------------------------------');
        console.log('\n✅ After running the SQL above, the suspension feature will be fully functional.');
    }
    catch (error) {
        console.error('❌ Error:', error);
    }
}
runSuspensionMigration();
