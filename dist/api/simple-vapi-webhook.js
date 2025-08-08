"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleVapiWebhook = handleVapiWebhook;
const googleapis_1 = require("googleapis");
async function handleVapiWebhook(req, res) {
    try {
        const { call_id, phone_number, duration, recording_url, transcript, summary, disposition } = req.body;
        const interestedKeywords = ['interested', 'callback', 'more information', 'yes', 'sure'];
        const isInterested = interestedKeywords.some(keyword => transcript?.toLowerCase().includes(keyword) ||
            disposition?.toLowerCase().includes(keyword));
        if (!isInterested) {
            console.log(`Call ${call_id} not interested, skipping sheet sync`);
            return res.json({ status: 'ok', action: 'skipped' });
        }
        await syncToGoogleSheet({
            phone_number,
            call_date: new Date().toISOString(),
            duration: `${Math.round(duration / 60)} min`,
            recording_url,
            summary: summary || 'Interested in learning more',
            next_action: 'Follow up within 24 hours'
        });
        res.json({ status: 'ok', action: 'synced' });
    }
    catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Processing failed' });
    }
}
async function syncToGoogleSheet(data) {
    const auth = new googleapis_1.google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = googleapis_1.google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
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
