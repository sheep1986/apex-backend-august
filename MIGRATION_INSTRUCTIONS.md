# VAPI Key Migration Instructions

## Quick Start

The migration SQL file is ready at: `apps/backend/EXECUTE_IN_SUPABASE.sql`

## Step-by-Step Instructions

### 1. Open Supabase Dashboard
- Go to your Supabase project dashboard
- Click on "SQL Editor" in the left sidebar

### 2. Create New Query
- Click the "New Query" button
- This will open a blank SQL editor

### 3. Copy Migration SQL
- Open the file `apps/backend/EXECUTE_IN_SUPABASE.sql`
- Select ALL contents (Ctrl+A or Cmd+A)
- Copy the contents (Ctrl+C or Cmd+C)

### 4. Execute Migration
- Paste the SQL into the Supabase SQL Editor
- Click the "Run" button (or press Ctrl+Enter / Cmd+Enter)
- Wait for the migration to complete

### 5. Verify Success
You should see a success message at the end:
```
Migration completed successfully!
Tables created/updated: organizations, vapi_key_audit, webhook_logs, vapi_assistants, phone_numbers
```

## What This Migration Does

✅ **Database Schema Updates**
- Adds `vapi_public_key` column to organizations table
- Keeps `vapi_api_key` for backward compatibility
- Creates audit table for tracking key changes
- Adds indexes for better performance

✅ **Security Enhancements**
- Implements Row Level Security (RLS) policies
- Restricts key access to admin users only
- Creates audit trail for all key changes

✅ **New Tables**
- `vapi_key_audit` - Tracks all key changes
- `vapi_assistants` - Stores VAPI assistant configurations
- `webhook_logs` - Logs webhook events
- Updates to `phone_numbers` table for VAPI support

## After Migration

### Update Your Backend
1. Deploy the updated backend code with all the new files
2. The backend will now properly handle public and private keys

### Update Environment Variables
Remove any hardcoded `VAPI_API_KEY` from your environment. Keys are now stored per organization in the database.

### Test the Changes
1. Login as an admin user
2. Go to Organization Settings
3. Enter both public and private VAPI keys
4. Test the connection
5. Manually sync assistants and phone numbers

## Troubleshooting

### "permission denied" error
- Make sure you're using the Supabase service role key
- Check that RLS is properly configured

### "already exists" errors
- The migration may have partially run before
- These are usually safe to ignore

### "syntax error" issues
- Make sure you copied the ENTIRE SQL file
- Don't try to run the JavaScript files in SQL Editor

## Need Help?
- Check the migration logs in Supabase
- Review the `VAPI_KEY_MANAGEMENT_UPDATE.md` file for full documentation
- Contact support with any error messages