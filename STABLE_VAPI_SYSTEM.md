# Stable VAPI Webhook Data Capture System

## Overview

This system is designed to be **update-resistant**, **data-preserving**, and **simple** for capturing ALL VAPI webhook data without complex organizational dependencies that can break during system updates.

## Key Features

### 🛡️ Update-Resistant Design
- **No complex org relationships** - Uses direct email storage instead of organization IDs
- **Simple table structure** - No foreign keys that can break during schema changes
- **Independent operation** - Works without dependency on user management systems

### 📊 Complete Data Preservation
- **Raw payload storage** - Stores complete webhook payload as JSONB
- **All event types supported** - Captures any VAPI webhook event type
- **Comprehensive call data** - Recordings, transcripts, costs, outcomes, timestamps

### 🎯 Simple & Robust
- **Email-based user identification** - Uses emails instead of org IDs
- **Direct data access** - Simple APIs for data retrieval and analysis
- **Error resilient** - Always returns 200 to prevent VAPI retries

## Database Schema

### Main Table: `vapi_webhook_data`

```sql
CREATE TABLE vapi_webhook_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Core webhook identification
  webhook_type VARCHAR(100) NOT NULL,
  webhook_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  webhook_id VARCHAR(255),
  
  -- Call identification (simple, no foreign keys)
  vapi_call_id VARCHAR(255) NOT NULL,
  phone_number VARCHAR(50),
  caller_number VARCHAR(50),
  
  -- User identification (email-based, no org dependency)
  user_email VARCHAR(255),
  platform_owner_email VARCHAR(255) DEFAULT 'sean@artificialmedia.co.uk',
  
  -- Core call data
  call_status VARCHAR(100),
  call_direction VARCHAR(20),
  call_duration INTEGER DEFAULT 0,
  call_cost DECIMAL(10,4) DEFAULT 0,
  call_started_at TIMESTAMP WITH TIME ZONE,
  call_ended_at TIMESTAMP WITH TIME ZONE,
  end_reason VARCHAR(255),
  
  -- AI & Voice data
  transcript TEXT,
  summary TEXT,
  recording_url TEXT,
  recording_duration INTEGER DEFAULT 0,
  
  -- Assistant & configuration data
  assistant_id VARCHAR(255),
  assistant_name VARCHAR(255),
  phone_number_id VARCHAR(255),
  
  -- Outcome & disposition
  call_disposition VARCHAR(100),
  call_outcome TEXT,
  sentiment VARCHAR(50),
  
  -- Raw data preservation (MOST IMPORTANT for stability)
  raw_webhook_payload JSONB NOT NULL,
  raw_call_data JSONB,
  raw_assistant_data JSONB,
  raw_phone_data JSONB,
  
  -- Metadata for debugging and tracking
  processing_status VARCHAR(50) DEFAULT 'processed',
  processing_notes TEXT,
  source_ip VARCHAR(50),
  user_agent TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Setup Instructions

### 1. Create Database Table

**Option A: Manual Creation (Recommended)**
1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Run the SQL from: `database/stable-vapi-webhook-schema.sql`

**Option B: Script Creation**
```bash
node create-stable-vapi-table.js
```

### 2. Configure VAPI Webhook

Update your VAPI webhook URL to:
```
https://apex-backend-pay4.onrender.com/api/stable-vapi/webhook
```

### 3. Test the System

```bash
node test-stable-vapi-system.js
```

## API Endpoints

### Webhook Endpoint
- **POST** `/api/stable-vapi/webhook` - Main webhook handler
- **GET** `/api/stable-vapi/status` - Webhook status and health check

### Data Access Endpoints
- **GET** `/api/stable-vapi-data/user/:email/stats` - User call statistics
- **GET** `/api/stable-vapi-data/user/:email/calls` - User recent calls
- **GET** `/api/stable-vapi-data/calls/:callId` - Complete call data
- **GET** `/api/stable-vapi-data/search?q=term` - Search by transcript
- **GET** `/api/stable-vapi-data/platform/stats` - Platform statistics (owner only)
- **GET** `/api/stable-vapi-data/export/csv` - Export to CSV
- **GET** `/api/stable-vapi-data/webhook-data` - Raw webhook data with filters

## Usage Examples

### Get User Statistics
```bash
curl "https://apex-backend-pay4.onrender.com/api/stable-vapi-data/user/info@artificialmedia.co.uk/stats"
```

### Get User's Recent Calls
```bash
curl "https://apex-backend-pay4.onrender.com/api/stable-vapi-data/user/info@artificialmedia.co.uk/calls?limit=5"
```

### Search Transcripts
```bash
curl "https://apex-backend-pay4.onrender.com/api/stable-vapi-data/search?q=interested&limit=10"
```

### Export Data to CSV
```bash
curl "https://apex-backend-pay4.onrender.com/api/stable-vapi-data/export/csv?user_email=info@artificialmedia.co.uk"
```

### Get Platform Statistics (Platform Owner Only)
```bash
curl "https://apex-backend-pay4.onrender.com/api/stable-vapi-data/platform/stats?user_email=sean@artificialmedia.co.uk"
```

## Data Service Functions

The `StableVapiDataService` provides programmatic access to the data:

```typescript
import { StableVapiDataService } from './services/stable-vapi-data-service';

// Get user statistics
const stats = await StableVapiDataService.getUserCallStats('user@example.com');

// Get recent calls
const calls = await StableVapiDataService.getUserRecentCalls('user@example.com', 10);

// Search transcripts
const results = await StableVapiDataService.searchCallsByTranscript('interested');

// Get platform stats
const platformStats = await StableVapiDataService.getPlatformStats();
```

## Data Structure Examples

### Webhook Event
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "webhook_type": "call-ended",
  "vapi_call_id": "call_abc123",
  "user_email": "info@artificialmedia.co.uk",
  "phone_number": "+1234567890",
  "call_status": "completed",
  "call_duration": 120,
  "call_cost": 0.05,
  "transcript": "Hello, I'm interested in your service...",
  "summary": "Customer expressed interest and requested callback",
  "recording_url": "https://...",
  "raw_webhook_payload": { /* complete VAPI payload */ }
}
```

### User Statistics
```json
{
  "userEmail": "info@artificialmedia.co.uk",
  "totalCalls": 45,
  "completedCalls": 38,
  "totalDuration": 5400,
  "totalCost": 12.50,
  "avgCallDuration": 120,
  "completionRate": 84,
  "lastCallDate": "2024-07-11T10:30:00Z"
}
```

### Call Summary
```json
{
  "callId": "call_abc123",
  "userEmail": "info@artificialmedia.co.uk",
  "phoneNumber": "+1234567890",
  "status": "completed",
  "duration": 120,
  "cost": 0.05,
  "transcript": "Full conversation transcript...",
  "summary": "AI-generated summary...",
  "recordingUrl": "https://...",
  "sentiment": "positive",
  "eventTypes": ["call-started", "call-ended"],
  "totalEvents": 2
}
```

## User Configuration

### Platform Owner
- **Email**: `sean@artificialmedia.co.uk`
- **Access**: Full platform statistics and all user data
- **Purpose**: System monitoring and platform management

### Test User
- **Email**: `info@artificialmedia.co.uk`
- **Access**: Own call data and statistics
- **Purpose**: Testing and demonstration

## Benefits Over Previous System

1. **No Org Dependencies** - Eliminates org ID mismatches and Clerk update issues
2. **Complete Data Preservation** - Raw JSONB storage ensures no data loss
3. **Simple Queries** - Direct email-based queries without complex joins
4. **Update Resistant** - Simple schema won't break with system updates
5. **Easy Migration** - Can coexist with existing systems
6. **Debug Friendly** - Raw payload storage enables complete debugging

## Monitoring & Maintenance

### Health Checks
- Monitor `/api/stable-vapi/status` for webhook health
- Monitor `/api/stable-vapi-data/health` for data API health

### Data Integrity
- Raw payload storage ensures complete data recovery
- Processing status tracking for error monitoring
- Source IP and user agent logging for debugging

### Performance
- Indexed on key fields for fast queries
- Pagination support for large datasets
- CSV export for external analysis

## Migration from Old System

1. **Parallel Operation** - New system runs alongside existing system
2. **Gradual Migration** - Update VAPI webhook URL when ready
3. **Data Comparison** - Compare data between systems during transition
4. **Fallback Ready** - Can revert to old system if needed

This stable system ensures your VAPI data capture continues working regardless of system updates, Clerk changes, or organizational restructuring.