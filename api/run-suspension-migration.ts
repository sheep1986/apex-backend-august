import supabase from '../services/supabase-client';

async function runSuspensionMigration() {
  console.log('🚀 Running suspension columns migration...');

  try {
    // Test if columns already exist
    const { data: testData, error: testError } = await supabase
      .from('users')
      .select('id')
      .limit(1);

    if (testError) {
      console.error('❌ Error connecting to database:', testError);
      return;
    }

    console.log('✅ Database connection successful');
    
    // Since we can't directly execute ALTER TABLE through Supabase client,
    // we'll provide instructions for manual migration
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
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the migration
runSuspensionMigration();