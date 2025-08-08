"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
async function createCalendarTables() {
    console.log('📅 Creating Calendar System Tables...\n');
    try {
        const { data: existingTables } = await supabase_client_1.default
            .from('appointments')
            .select('id')
            .limit(1);
        if (existingTables) {
            console.log('✅ Appointments table already exists');
            return;
        }
        const schemaPath = path_1.default.join(__dirname, '../database/calendar-system-schema.sql');
        if (!fs_1.default.existsSync(schemaPath)) {
            console.log('⚠️ Schema file not found, creating basic tables...');
            const { error: appointmentsError } = await supabase_client_1.default.rpc('exec_sql', {
                sql: `
          CREATE TABLE IF NOT EXISTS appointments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
            lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
            campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
            call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
            type VARCHAR(50) DEFAULT 'callback',
            title VARCHAR(255) NOT NULL,
            description TEXT,
            date DATE NOT NULL,
            time TIME NOT NULL,
            duration_minutes INTEGER DEFAULT 30,
            timezone VARCHAR(50) DEFAULT 'UTC',
            location_type VARCHAR(50) DEFAULT 'phone',
            location_details JSONB,
            agenda TEXT,
            preparation_notes TEXT,
            status VARCHAR(50) DEFAULT 'scheduled',
            confirmation_status VARCHAR(50) DEFAULT 'pending',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `
            });
            if (appointmentsError) {
                console.error('❌ Error creating appointments table:', appointmentsError);
            }
            else {
                console.log('✅ Created appointments table');
            }
            const { error: tasksError } = await supabase_client_1.default.rpc('exec_sql', {
                sql: `
          CREATE TABLE IF NOT EXISTS tasks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
            lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
            appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
            call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            category VARCHAR(50) DEFAULT 'follow_up',
            priority VARCHAR(20) DEFAULT 'medium',
            due_date DATE,
            due_time TIME,
            status VARCHAR(50) DEFAULT 'pending',
            notes TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `
            });
            if (tasksError) {
                console.error('❌ Error creating tasks table:', tasksError);
            }
            else {
                console.log('✅ Created tasks table');
            }
        }
        else {
            console.log('📝 Reading full schema from file...');
            const schema = fs_1.default.readFileSync(schemaPath, 'utf8');
            const statements = schema
                .split(';')
                .map(s => s.trim())
                .filter(s => s.length > 0 && !s.startsWith('--'));
            console.log(`📊 Found ${statements.length} SQL statements to execute`);
            for (let i = 0; i < statements.length; i++) {
                const statement = statements[i];
                if (!statement || statement.startsWith('--'))
                    continue;
                const match = statement.match(/CREATE\s+(?:TABLE|INDEX|VIEW|FUNCTION|TRIGGER)\s+(?:IF\s+NOT\s+EXISTS\s+)?(\S+)/i);
                const objectName = match ? match[1] : `Statement ${i + 1}`;
                console.log(`   Executing: ${objectName}...`);
                const { error } = await supabase_client_1.default.rpc('exec_sql', {
                    sql: statement + ';'
                });
                if (error) {
                    console.error(`   ❌ Error with ${objectName}:`, error.message);
                }
                else {
                    console.log(`   ✅ ${objectName} created/updated`);
                }
            }
        }
        console.log('\n📊 Testing table access...');
        const { count: aptCount, error: aptError } = await supabase_client_1.default
            .from('appointments')
            .select('*', { count: 'exact', head: true });
        if (!aptError) {
            console.log(`✅ Appointments table accessible (${aptCount || 0} records)`);
        }
        else {
            console.error('❌ Cannot access appointments table:', aptError);
        }
        const { count: taskCount, error: taskError } = await supabase_client_1.default
            .from('tasks')
            .select('*', { count: 'exact', head: true });
        if (!taskError) {
            console.log(`✅ Tasks table accessible (${taskCount || 0} records)`);
        }
        else {
            console.error('❌ Cannot access tasks table:', taskError);
        }
    }
    catch (error) {
        console.error('❌ Error creating calendar tables:', error);
    }
}
console.log('🚀 Starting Calendar System Setup\n');
createCalendarTables()
    .then(() => {
    console.log('\n✅ Calendar system setup complete!');
    process.exit(0);
})
    .catch((error) => {
    console.error('\n❌ Setup failed:', error);
    process.exit(1);
});
