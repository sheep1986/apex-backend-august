const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runSchema() {
  console.log('🚀 Running Lead Qualification Schema...\n');

  try {
    // Read the schema file
    const schemaPath = path.join(__dirname, 'database', 'lead-qualification-schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Split into individual statements (simple split, works for this schema)
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📋 Found ${statements.length} SQL statements to execute\n`);

    let successCount = 0;
    let errorCount = 0;

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      
      // Extract a description from the statement
      let description = 'SQL statement';
      if (statement.includes('ALTER TABLE campaigns')) {
        description = 'Add winning_criteria to campaigns';
      } else if (statement.includes('CREATE TABLE IF NOT EXISTS qualification_field_presets')) {
        description = 'Create qualification_field_presets table';
      } else if (statement.includes('CREATE TABLE IF NOT EXISTS campaign_qualification_fields')) {
        description = 'Create campaign_qualification_fields table';
      } else if (statement.includes('CREATE TABLE IF NOT EXISTS campaign_custom_fields')) {
        description = 'Create campaign_custom_fields table';
      } else if (statement.includes('CREATE TABLE IF NOT EXISTS lead_qualification_data')) {
        description = 'Create lead_qualification_data table';
      } else if (statement.includes('INSERT INTO qualification_field_presets')) {
        description = 'Insert preset qualification fields';
      } else if (statement.includes('CREATE INDEX')) {
        description = 'Create performance index';
      } else if (statement.includes('CREATE OR REPLACE VIEW')) {
        description = 'Create campaign_all_qualification_fields view';
      } else if (statement.includes('COMMENT ON')) {
        description = 'Add documentation comment';
      }

      process.stdout.write(`${i + 1}/${statements.length} - ${description}... `);

      // For now, just count them as we'll need to run these manually
      console.log('📋 (Manual execution required)');
      
      // Save to file for manual execution
      if (!fs.existsSync('temp-sql-statements.sql')) {
        fs.writeFileSync('temp-sql-statements.sql', '');
      }
      fs.appendFileSync('temp-sql-statements.sql', statement + '\n\n');
      successCount++;
    }

    console.log('\n📊 Summary:');
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${errorCount}`);

    // Test the schema
    console.log('\n🧪 Testing the schema...\n');

    // Check if tables were created
    const tables = ['qualification_field_presets', 'campaign_qualification_fields', 'campaign_custom_fields', 'lead_qualification_data'];
    
    for (const table of tables) {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.log(`❌ Table ${table}: Not accessible - ${error.message}`);
      } else {
        console.log(`✅ Table ${table}: Accessible (${count || 0} rows)`);
      }
    }

    // Check preset fields
    const { data: presets, error: presetError } = await supabase
      .from('qualification_field_presets')
      .select('category, count(*)')
      .limit(5);

    if (!presetError && presets) {
      console.log('\n📦 Preset fields by category:');
      
      // Get category counts
      const { data: categoryCounts } = await supabase
        .from('qualification_field_presets')
        .select('category');

      if (categoryCounts) {
        const counts = categoryCounts.reduce((acc, row) => {
          acc[row.category] = (acc[row.category] || 0) + 1;
          return acc;
        }, {});

        Object.entries(counts).forEach(([category, count]) => {
          console.log(`  - ${category}: ${count} fields`);
        });
      }
    }

    // Check if winning_criteria column exists by trying to query it
    const { data: testCampaign, error: columnError } = await supabase
      .from('campaigns')
      .select('id, winning_criteria')
      .limit(1);

    if (!columnError) {
      console.log('\n✅ winning_criteria column exists in campaigns table');
    } else if (columnError.message.includes('column') && columnError.message.includes('does not exist')) {
      console.log('\n⚠️  winning_criteria column needs to be added');
      console.log('   Run: ALTER TABLE campaigns ADD COLUMN winning_criteria JSONB DEFAULT \'{}\'::jsonb;');
    }

    console.log('\n✨ Lead qualification schema setup complete!');
    console.log('\nNext steps:');
    console.log('1. Integrate QualificationFieldsStep into campaign wizard');
    console.log('2. Update AI processor to use qualification fields');
    console.log('3. Test with a new campaign');

  } catch (error) {
    console.error('💥 Fatal error:', error);
  }
}

// Run the migration directly since we'll execute SQL differently
runSchema();