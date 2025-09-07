# VAPI Key Management Update - Implementation Summary

## Overview
Updated the Apex AI Calling Platform backend to properly handle VAPI public and private keys with enhanced security, explicit key management, and webhook signature verification.

## Key Changes Implemented

### 1. Database Schema Updates (`database/rename-vapi-key-columns.sql`)
- **Added** `vapi_public_key` column to organizations table
- **Kept** `vapi_api_key` column for backward compatibility (marked as deprecated)
- **Implemented** Row Level Security (RLS) policies for admin-only access to keys
- **Created** `vapi_key_audit` table for tracking all key changes with hashed values
- **Added** indexes for better performance on key columns

### 2. API Credentials Endpoint (`api/vapi-credentials.ts`)
- **Enhanced Security**: Only admins (platform_owner, client_admin) can view/update actual keys
- **Non-admin users** see only boolean flags (hasPublicKey, hasPrivateKey)
- **Added** audit logging for all key changes
- **Implemented** DELETE endpoint to remove credentials
- **Added** key format validation

### 3. VAPI Integration Service (`services/vapi-integration-service.ts`)
- **CRITICAL CHANGE**: Now uses private key exclusively for API authentication
- **Added** public key storage for webhook verification
- **Implemented** `verifyWebhookSignature()` static method using HMAC-SHA256
- **Added** `testConnection()` method to verify credentials
- **Added** `syncAssistants()` and `syncPhoneNumbers()` methods for manual syncing
- **Removed** automatic fallback to public key for API calls

### 4. Webhook Handler (`api/vapi-webhook-enhanced.ts`)
- **Implemented** signature verification using organization's public key
- **Added** organization lookup from call data
- **Returns** 401 for invalid signatures in production
- **Enhanced** error handling and logging
- **Maintains** backward compatibility for development environments

### 5. Manual Sync Endpoint (`api/vapi-sync.ts`)
- **Created** new admin-only endpoints:
  - `POST /api/vapi-sync/test` - Test VAPI connection
  - `POST /api/vapi-sync/assistants` - Sync assistants manually
  - `POST /api/vapi-sync/phone-numbers` - Sync phone numbers manually
  - `POST /api/vapi-sync/all` - Sync everything
  - `GET /api/vapi-sync/status` - Get current sync status
- **Stores** sync timestamps and results in organization settings

### 6. Organization Setup (`api/organization-setup-fixed.ts`)
- **Removed** automatic assistant/phone number import
- **Kept** credential validation via `testVapiIntegration()`
- **Simplified** to only store and validate keys

## Migration Instructions

### Step 1: Run Database Migration
```bash
cd apps/backend
node run-vapi-key-migration.js
```

Or manually execute `database/rename-vapi-key-columns.sql` in Supabase SQL Editor.

### Step 2: Update Environment Variables
Remove or update any references to `VAPI_API_KEY`. Keys should now come from the database per organization.

### Step 3: Update Backend Server
Deploy the updated backend with all the new files.

### Step 4: Update Frontend
Ensure the organization settings page:
- Shows "Configured/Not Configured" for non-admin users
- Provides fields for admins to enter both public and private keys
- Has buttons to trigger manual sync
- Removes references to "one-click setup"

## API Usage Examples

### Setting VAPI Credentials (Admin Only)
```javascript
PUT /api/vapi-credentials
{
  "vapi_public_key": "pub_xxx",
  "vapi_private_key": "priv_xxx",
  "vapi_webhook_url": "https://yourdomain.com/api/vapi-webhook"
}
```

### Testing Connection (Admin Only)
```javascript
POST /api/vapi-sync/test
// Returns: { success: true, message: "Connected", details: {...} }
```

### Syncing Data (Admin Only)
```javascript
POST /api/vapi-sync/all
// Returns: { success: true, assistants: {...}, phoneNumbers: {...} }
```

## Security Improvements

1. **Key Separation**: Public and private keys are now clearly separated
2. **Role-Based Access**: Only admins can view/modify keys
3. **Audit Trail**: All key changes are logged with hashed values
4. **Signature Verification**: All webhooks are verified using HMAC-SHA256
5. **No Key Exposure**: Keys are never exposed in logs or to non-admin users

## Backward Compatibility

- The `vapi_api_key` column is maintained for existing data
- Falls back to `vapi_api_key` as public key if `vapi_public_key` is not set
- Settings JSONB is updated alongside column values
- Development environments can bypass signature verification

## Testing Checklist

- [ ] Database migration runs successfully
- [ ] Existing organizations with vapi_api_key still work
- [ ] Admin users can view and update keys
- [ ] Non-admin users see only boolean flags
- [ ] Webhook signature verification works
- [ ] Manual sync endpoints work for admins
- [ ] Audit table logs key changes
- [ ] Connection test validates private key

## Potential Issues & Solutions

### Issue: Webhook signature verification fails
**Solution**: Ensure the organization has a public key set. Check that the webhook includes raw body for verification.

### Issue: API calls fail with 401
**Solution**: Verify the private key is set correctly. The public key cannot be used for API authentication.

### Issue: Sync returns 0 assistants/phones
**Solution**: Check that the private key has proper permissions in VAPI dashboard.

## Future Enhancements

1. **Key Rotation**: Implement automatic key rotation with grace period
2. **Key Encryption**: Encrypt keys at rest in database
3. **Rate Limiting**: Add rate limiting to sync endpoints
4. **Webhook Replay**: Add ability to replay failed webhooks
5. **Multi-Key Support**: Support multiple VAPI accounts per organization