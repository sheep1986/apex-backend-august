# Backend Netlify Deployment Guide

## Deployment Steps

1. **Push to GitHub**
   - Make sure your backend code is in the `apex_backend` repository

2. **Connect to Netlify**
   - Go to Netlify Dashboard
   - Click "Add new site" > "Import an existing project"
   - Connect to GitHub and select `apex_backend` repository

3. **Configure Build Settings**
   - Build command: `npm install`
   - Publish directory: `.` (root directory)
   - Functions directory: `netlify/functions`

4. **Set Environment Variables**
   Add these in Netlify Dashboard > Site Settings > Environment Variables:

   ```
   # Supabase
   SUPABASE_URL=https://twigokrtbvigiqnaybfy.supabase.co
   SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

   # Clerk Authentication
   CLERK_SECRET_KEY=your_clerk_secret_key
   CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key

   # VAPI Integration
   VAPI_API_KEY=your_vapi_api_key
   VAPI_WEBHOOK_SECRET=your_vapi_webhook_secret

   # Other Services
   STRIPE_SECRET_KEY=your_stripe_key (optional)
   RESEND_API_KEY=your_resend_key (optional)
   SLACK_WEBHOOK_URL=your_slack_webhook (optional)

   # CORS
   ALLOWED_ORIGINS=https://aquamarine-klepon-bcb066.netlify.app,http://localhost:5173
   ```

5. **Deploy**
   - Click "Deploy site"
   - Your backend will be available at: `https://[your-site-name].netlify.app/.netlify/functions/api`

## API Endpoints

All endpoints are prefixed with `/.netlify/functions/api`

Examples:
- Health check: `GET /.netlify/functions/api`
- Users: `GET /.netlify/functions/api/users`
- Campaigns: `GET /.netlify/functions/api/campaigns`

## Testing

Test your deployment:
```bash
curl https://[your-backend-site].netlify.app/.netlify/functions/api
```

Should return:
```json
{
  "status": "ok",
  "message": "Apex AI Backend API is running on Netlify"
}
```