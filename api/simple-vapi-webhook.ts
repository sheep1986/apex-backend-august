import { Request, Response } from 'express';
import { google } from 'googleapis';

// Simple webhook for VAPI calls
export async function handleVapiWebhook(req: Request, res: Response) {
  try {
    const { 
      call_id,
      phone_number,
      duration,
      recording_url,
      transcript,
      summary,
      disposition // VAPI should send this based on AI analysis
    } = req.body;

    // Only process interested leads
    const interestedKeywords = ['interested', 'callback', 'more information', 'yes', 'sure'];
    const isInterested = interestedKeywords.some(keyword => 
      transcript?.toLowerCase().includes(keyword) || 
      disposition?.toLowerCase().includes(keyword)
    );

    if (!isInterested) {
      // Just count it and move on
      console.log(`Call ${call_id} not interested, skipping sheet sync`);
      return res.json({ status: 'ok', action: 'skipped' });
    }

    // Sync to Google Sheet
    await syncToGoogleSheet({
      phone_number,
      call_date: new Date().toISOString(),
      duration: `${Math.round(duration / 60)} min`,
      recording_url,
      summary: summary || 'Interested in learning more',
      next_action: 'Follow up within 24 hours'
    });

    res.json({ status: 'ok', action: 'synced' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Processing failed' });
  }
}

// Simple Google Sheets sync
async function syncToGoogleSheet(data: any) {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  // Append to Interested Leads tab
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Interested Leads!A:F',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        data.phone_number,
        data.call_date,
        data.duration,
        data.recording_url,
        data.summary,
        data.next_action
      ]]
    }
  });
} 